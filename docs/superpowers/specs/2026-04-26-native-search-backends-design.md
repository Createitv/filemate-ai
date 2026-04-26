# Native Search Backends — Design Spec

**Date:** 2026-04-26
**Owner:** ling
**Status:** Draft → ready for implementation plan

## 1. Goal

Make FileMate AI's "search by filename + content" both:
- **Fast to build** — leverage what each platform already maintains:
  - macOS: Spotlight (`mdfind` / `NSMetadataQuery`) — system already indexes everything
  - Windows: NTFS USN Journal + MFT direct read (Everything-style)
  - Linux / fallback: keep existing in-memory `FilenameIndex` (`WalkDir`-based)
- **Fast to query** — sub-100ms for filename-substring across the whole machine; content matches sourced from a user-managed list of folders.

This replaces the current `query_filename_index` Tauri command with a unified `unified_search` that returns two grouped result lists.

## 2. User-facing decisions (locked)

| # | Question | Choice |
|---|---|---|
| Q1 | Search dimensions | **C** — filename + content together |
| Q2 | Scope model | **C** — dual scope: filename = system-wide, content = user-curated folder list |
| Q3 | Windows MFT permission | **Prompt for admin elevation** at startup; user accepts → relaunch elevated |
| Q4 | Result presentation | **B** — two grouped sections (filename matches first, content matches below) |
| Q5 | Live updates | **A** — each backend self-maintains freshness; no shared event bus |

## 3. Architecture

Backends live behind a single `SearchBackend` trait. A `Router` owned by `AppState` selects backends at startup based on platform + permissions, and dispatches each query to the right combination.

### 3.1 Module layout

```
src-tauri/src/search_backends/
  mod.rs              -- trait, Capabilities flags, Query, Hit, Router
  spotlight.rs        -- macOS only (#[cfg(target_os = "macos")])
  mft.rs              -- Windows only (#[cfg(target_os = "windows")])
  walkdir_index.rs    -- cross-platform; wraps existing FilenameIndex
  tantivy_backend.rs  -- cross-platform; wraps existing search::Index
```

`src-tauri/src/filename_index.rs` stays as-is — `WalkDirIndexBackend` is a thin adapter, not a rewrite. `src-tauri/src/search.rs::Index` likewise stays — `TantivyBackend` adapts it.

### 3.2 The trait

```rust
bitflags::bitflags! {
    pub struct Capabilities: u32 {
        const CAN_FILENAME   = 1 << 0;
        const CAN_CONTENT    = 1 << 1;
        const LIVE_UPDATE    = 1 << 2;  // backend keeps itself fresh
        const SCOPE_SYSTEM   = 1 << 3;  // can search whole machine
        const SCOPE_FOLDER   = 1 << 4;  // can search a chosen subtree
    }
}

pub struct Query {
    pub pattern: String,
    pub kind: QueryKind,                // Filename | Content
    pub scope: Option<PathBuf>,         // None = backend's natural scope
    pub limit: usize,
}

pub struct Hit {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: i64,
    pub is_dir: bool,
    pub source: HitSource,              // backend that produced it
    pub matched_via: MatchKind,         // Exact | Prefix | Contains | Content
    pub snippet: Option<String>,        // content backends only
    pub score: f32,                     // backend-local score
}

#[async_trait]
pub trait SearchBackend: Send + Sync {
    fn name(&self) -> &'static str;
    fn capabilities(&self) -> Capabilities;
    async fn query(&self, q: &Query) -> AppResult<Vec<Hit>>;
    /// Optional: backends with their own freshness loop don't need this.
    async fn refresh(&self, _hint: RefreshHint) -> AppResult<()> { Ok(()) }
}
```

### 3.3 Router

```rust
pub struct Router {
    backends: Vec<Box<dyn SearchBackend>>,
    filename_pref: Vec<usize>,  // indices in priority order
    content_pref:  Vec<usize>,
}

impl Router {
    pub fn auto_select(app: &AppHandle) -> Self;
    pub async fn unified_search(&self, pattern: &str, opts: SearchOpts)
        -> SearchResult;
}

pub struct SearchResult {
    pub filename: Vec<Hit>,
    pub content:  Vec<Hit>,
    pub backend_status: BackendStatus,  // which one served each layer
}
```

`auto_select` rules:

| Platform | Filename pref order | Content pref order |
|---|---|---|
| macOS | `[Spotlight]` | `[Spotlight]` (Spotlight covers both — Tantivy not registered) |
| Windows + admin | `[Mft, WalkDirIndex]` | `[Tantivy]` |
| Windows non-admin | `[WalkDirIndex]` | `[Tantivy]` |
| Linux | `[WalkDirIndex]` | `[Tantivy]` |

The fallback chain is meaningful: if `Mft.query` returns `Err` at runtime, Router transparently retries on `WalkDirIndex` for that one query.

### 3.4 Dual scope

- **Filename scope = "as wide as the backend can practically cover".** Spotlight covers the whole user-visible filesystem; MFT covers every NTFS volume the process can open; WalkDirIndex is configurable (default `$HOME` only — going system-wide on Linux risks `/proc`, `/sys` explosions). All three report `SCOPE_SYSTEM`; the user perceives whole-machine search on macOS / Windows-admin and `$HOME`-wide on the rest.
- **Content scope = user-curated.** A new `ContentScope` config persisted in SQLite `settings` (`content_scope_paths` JSON array). Default seed: `[$HOME/Documents, $HOME/Desktop]`. UI exposes add/remove in Settings → Search section. Tantivy is built only over scope members.

## 4. Components

| Component | Responsibility | New / Existing |
|---|---|---|
| `SearchBackend` trait + `Router` | Trait, capability flags, dispatch | New |
| `SpotlightBackend` | Wraps `mdfind` (v1) — shells out, parses null-delimited output. Future: switch to `objc2` + `NSMetadataQuery` for live mode. | New (macOS only) |
| `MftBackend` | Reads NTFS MFT via `\\.\<volume>` handle; loads filename + parent FRN into in-memory hashmap; background thread reads USN journal every 1s for delta. Requires `SeBackupPrivilege` (admin). | New (Windows only) |
| `WalkDirIndexBackend` | Wraps existing `FilenameIndex`. Supports filename-only, multi-root scope (extended from current single-root). | New adapter; `FilenameIndex` itself unchanged except for multi-root support |
| `TantivyBackend` | Wraps existing `search::Index`. Filters results to `ContentScope`. | New adapter; `search::Index` unchanged |
| `ContentScope` (SQLite-backed config) | List of folders content layer indexes. Add / remove / list. | New (~50 lines) |
| Tauri commands | `unified_search`, `search_backend_status`, `content_scope_list/add/remove`, `request_admin_relaunch` (Windows) | New; old `query_filename_index` removed |
| Frontend `Search.tsx` | Renders two sections; consumes `unified_search` | Rewritten |
| Frontend Settings → Search | Manages content scope + Windows admin toggle | New section |
| Frontend `indexStatus` store | Polls `search_backend_status` instead of `filename_index_status` | Updated |

## 5. Data flow

### 5.1 Startup

```
lib.rs::setup
  └─ AppState::new
  └─ Router::auto_select(app_handle)
       ├─ detect platform
       ├─ Windows: probe SeBackupPrivilege; if absent, do not register MFT
       ├─ for each candidate backend: instantiate, call init() async
       └─ store backends + priority lists
  └─ app.manage(state)
  └─ tokio::spawn each backend's freshness loop (Spotlight = no-op,
     MFT = USN reader thread, WalkDir = existing notify hook,
     Tantivy = subscribe to fs:event)
```

### 5.2 Query path

```
frontend: api.unifiedSearch("foo") →
  Tauri command unified_search(pattern, opts) →
    Router.unified_search:
      let filename_fut = pick first filename backend; .query(Filename, ...)
      let content_fut  = pick first content backend;  .query(Content,  ...)
      tokio::join!(filename_fut, content_fut)
      on Err in either: try next backend in pref list (max 1 fallback)
      merge:
        filename hits → sort by [Exact, Prefix, Contains] then by name length asc
        content hits  → sort by score desc
        dedup: if same path in both, keep in filename, set also_in_content
      return { filename, content, backend_status }
```

**Timeout / streaming model.** `unified_search` is a single round-trip command, not streamed. It awaits both layers concurrently with a 1s hard cap (each layer individually); if a layer is still running at the cap, that layer's `Vec` is returned empty and `backend_status` flags it with `partial: true`. The frontend can either accept the partial result or re-fire on the user's next keystroke. No background streaming events in v1.

### 5.3 Live update

Each backend owns its loop:
- **Spotlight**: `mdfind` is one-shot per query (v1); v2 `NSMetadataQuery` runs continuously and pushes results — switch when we add `objc2`.
- **MFT**: dedicated background thread `loop { read_usn_delta(); apply_to_inmem_table(); sleep(1s) }`. Patches under `RwLock<HashMap<FRN, Entry>>`.
- **WalkDir**: existing `notify` watcher already calls `FilenameIndex::apply_event` — unchanged.
- **Tantivy**: registered only on non-macOS platforms (on macOS Spotlight covers content). Subscribes to the same `fs:event` stream emitted by `notify` watcher; on each event runs `index.add_document` / `delete_term`. Filtered to `ContentScope` paths so unrelated FS events are ignored.

No shared bus. Each backend is an island.

### 5.4 Windows elevation flow

1. App boots non-elevated. `Router` registers `WalkDirIndex + Tantivy`. UI shows "极速模式 未启用" badge.
2. User opens Settings → Search → toggles "启用极速模式".
3. Frontend calls `request_admin_relaunch` Tauri command.
4. Backend invokes `ShellExecuteW("runas", current_exe, ...)` and exits.
5. New process boots elevated. `Router::auto_select` detects `SeBackupPrivilege`, registers `MftBackend` ahead of `WalkDirIndex`. UI shows the new badge.

If the user denies UAC, the elevated relaunch never starts and the original process keeps running — no degraded state.

## 6. Error handling

| Failure | Behaviour |
|---|---|
| Backend `init()` fails | Backend is not registered. Logged via `tracing`. Router skips it. App still runs. |
| Backend `query()` fails | Router falls back to next backend in pref list (single retry). If all fail for that layer, that layer returns empty + a backend-status flag the UI surfaces ("文件名搜索暂时不可用"). |
| User denies Windows UAC | Process state unchanged; "极速模式" toggle stays off. |
| Spotlight Full Disk Access not granted | Results are still returned (incomplete); Settings shows "Spotlight 索引不完整 — 授予完整磁盘访问" with a button to open System Settings. |
| Content scope folder deleted by user externally | `ContentScope` removes it on next read; `Tantivy` deletes any docs under it during next refresh. |
| Query timeout (1s per layer hard cap) | That layer returns empty + `backend_status.partial = true`. Late results are dropped. Caller may re-fire on the next keystroke. |

All failures use the existing `AppError::Other(String)`. No new error types.

## 7. Testing

### 7.1 Unit / cross-platform (any CI runner)

- `MockBackend` implementing `SearchBackend` with canned `Capabilities` and canned `Vec<Hit>`.
- Router tests: register mocks for both layers, assert correct dispatch / dedup / sort.
- Router fallback test: first mock returns `Err`, second mock returns `Ok` — assert second is used.
- `WalkDirIndexBackend` test: existing `FilenameIndex` tests cover correctness; adapter test verifies `Capabilities` and that `query(Filename)` round-trips into `IndexedEntry`.
- `TantivyBackend` test: index two docs, query content, assert hits.

### 7.2 Platform-gated integration

- **macOS** (`#[cfg(target_os = "macos")]`): SpotlightBackend integration test that touches a file in `/tmp`, runs query, expects hit. CI: macOS runner.
- **Windows** (`#[cfg(target_os = "windows")]`): MftBackend test that creates a file on a NTFS volume in a temp dir, walks USN delta, expects hit. CI: Windows runner with admin (GitHub Actions allows this).

### 7.3 Frontend

- `Search.tsx` snapshot: render with mocked `{ filename: [3 items], content: [2 items] }`, verify two sections + counts.
- Settings → Search: render with mocked content scope, verify add/remove buttons fire correct API calls.

## 8. Out of scope (deferred)

- macOS continuous Spotlight via `NSMetadataQuery` (v2 — needs `objc2` dep). v1 shells out to `mdfind` per query.
- Windows: indexing non-NTFS volumes via MFT (FAT32/exFAT — fall back to WalkDir).
- Cross-platform mlocate / `locate` integration on Linux.
- Result ranking that mixes filename + content into a single relevance-ordered list (we explicitly chose B — two sections).
- Persistence of MFT cache to disk (cold start re-walks the MFT — fast enough).

## 9. File-by-file change summary

**Modified:**
- `src-tauri/src/lib.rs` — register new module, replace `filename_index::*` commands with `search_backends::*` commands, keep `spawn_startup_scan` as a transitional alias that delegates to `Router`.
- `src-tauri/src/state.rs` — replace `filename_index: Arc<FilenameIndex>` with `router: Arc<Router>` (router holds `Arc<FilenameIndex>` internally inside `WalkDirIndexBackend`).
- `src-tauri/src/filename_index.rs` — extend `build()` to support multiple roots; expose helpers; otherwise unchanged.
- `src-tauri/src/search.rs` — no semantic change; `TantivyBackend` consumes `Index` via reference.
- `src-tauri/src/watcher.rs` — emit fs events to all interested backends (Tantivy + WalkDir) via `Router::on_fs_event`.
- `src-tauri/Cargo.toml` — add `bitflags` (already in tantivy's dep tree, but make direct), `async-trait` (already present), platform-conditional `windows` crate for MFT, no new macOS deps in v1.
- `src/api/index.ts` — replace `queryFilenameIndex` with `unifiedSearch`; add `searchBackendStatus`, `contentScopeList/Add/Remove`, `requestAdminRelaunch`.
- `src/api/types.ts` — `IndexedEntry` → `Hit`; add `SearchResult`, `BackendStatus`, `ContentScope`.
- `src/pages/Search.tsx` — render two sections; consume `unified_search`.
- `src/pages/Settings.tsx` — new "搜索" section: content-scope list editor + Windows admin toggle.
- `src/stores/indexStatus.ts` — poll `search_backend_status` instead of `filename_index_status`.

**New:**
- `src-tauri/src/search_backends/mod.rs`
- `src-tauri/src/search_backends/spotlight.rs` (`#[cfg(target_os = "macos")]`)
- `src-tauri/src/search_backends/mft.rs` (`#[cfg(target_os = "windows")]`)
- `src-tauri/src/search_backends/walkdir_index.rs`
- `src-tauri/src/search_backends/tantivy_backend.rs`
- `src-tauri/src/content_scope.rs` (~50 lines, SQLite-backed)
- `src-tauri/src/admin.rs` (Windows-only — privilege probe + ShellExecute relaunch)

## 10. Risks / open issues

- **MFT format quirks** — MFT spec has edge cases (sparse, attribute lists, file IDs). Plan: use the `ntfs` crate rather than parse by hand. License: MIT — OK for this project.
- **mdfind silent incompleteness** — if the Spotlight index hasn't finished rebuilding (e.g. fresh install), results will be missing for hours. Mitigation: surface the "indexing status" via `mdutil -s /` parse and expose in UI.
- **Backend conflict with existing watcher** — the existing `watch_dir` command is per-directory; we'll extend or supersede it so the Router subscribes to all relevant trees automatically.
- **Migration** — current `filename_index.bin` persisted file is no longer the source of truth. On first launch with new code, ignore it; on a clean re-index it'll be rewritten by `WalkDirIndexBackend` adapter.
