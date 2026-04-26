# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

FileMate AI — a cross-platform AI-powered file manager built as a Tauri 2 desktop app. Frontend: React 18 + TypeScript + Vite + Tailwind. Backend: Rust (in `src-tauri/`). The PRD lives in `NexFile_PRD_v2.0.docx`; design references are PNGs under `design/`.

UI strings are bilingual (zh-CN / en-US) via `react-i18next`; language packs are in `src/i18n/`.

## Commands

```sh
npm install
npm run dev            # Vite only, http://localhost:1420 (frontend stubs only)
npm run tauri:dev      # Full app: launches Rust backend + Vite HMR
npm run build          # tsc + vite build (frontend type-check + bundle)
npm run tauri:build    # Production bundle → src-tauri/target/release/bundle/
```

There is no test runner, lint config, or formatter wired up in `package.json`. Type-check is via `tsc` inside `npm run build`. Rust code is built/checked through `cargo` inside `src-tauri/` (e.g. `cargo check --manifest-path src-tauri/Cargo.toml`).

Windows installers (MSI + NSIS) are produced by `.github/workflows/build-windows.yml` on push to `main`, on `v*` tags, or via manual dispatch.

## Architecture

### Frontend ↔ backend bridge

All backend access goes through **typed wrappers** in `src/api/index.ts`, which call `@tauri-apps/api/core::invoke` against `#[tauri::command]` handlers registered in `src-tauri/src/lib.rs`. Shared DTOs live in `src/api/types.ts`. **Do not call `invoke` directly from components** — add a wrapper in `src/api/index.ts` so command names stay in one place. When adding a backend command, you must:

1. Implement the `#[tauri::command]` in the relevant `src-tauri/src/<domain>.rs`.
2. Register it in the `invoke_handler![...]` list in `src-tauri/src/lib.rs`.
3. Add a typed wrapper + DTO in `src/api/`.

### Backend layout (`src-tauri/src/`)

Each domain owns one module; `lib.rs` is a wiring file only. State that crosses commands is a single `AppState` (`state.rs`) managed by Tauri, holding:

- `Db` (`db.rs`) — bundled SQLite via `rusqlite`, opened at `app_data_dir/filemate.db`. Stores settings, recents, bookmarks, tags, workspaces, automation rules, version history, cloud accounts.
- `Index` (`search.rs`) — Tantivy full-text index at `app_data_dir/index`.
- `WatcherHandle` (`watcher.rs`) — `notify`-based filesystem watcher, optional/per-session.

Domain modules: `fs`, `disk`, `settings`, `recents`, `bookmarks`, `tags`, `workspaces`, `search`, `automation`, `version`, `batch`, `archive`, `encryption`, `terminal`, `preview/`, `cloud/`, `ai`, `ai_analyze`, `oauth`. The `cloud/` submodule has one file per provider (`gdrive`, `onedrive`, `dropbox`, `s3`, `webdav`) behind a common trait pattern; `preview/` has per-format extractors (`image_meta`, `audio`, `font`, `code`, `text`).

Errors flow through `error.rs` (`thiserror`) and serialize to the frontend as JSON; commands typically return `Result<T, AppError>`.

### Frontend layout (`src/`)

- Routing: `App.tsx` mounts every page under `AppLayout` (sidebar + topbar + AI panel). Adding a feature page = new file in `pages/` + a `<Route>` in `App.tsx` + a sidebar entry in `components/layout/Sidebar.tsx`.
- State: zustand stores in `src/stores/` (e.g. `theme.ts` persists theme mode + accent). Server-state is fetched per-page via `api.*` calls — there is no global query cache.
- UI primitives: `components/ui/` (Button, Card, Input, Toast). Layout chrome: `components/layout/`. Feature-specific UI sits in the page file or under `components/preview/`.
- Path alias: `@/*` → `src/*` (see `tsconfig.json`, `vite.config.ts`).

### Permissions / capabilities

Tauri 2 capabilities are declared in `src-tauri/capabilities/default.json`. New filesystem / shell / dialog APIs called from Rust or JS plugins must be granted there or invocations will be rejected at runtime.

## Conventions worth knowing

- Rust modules expect `serde` camelCase on the wire; the TS DTOs in `src/api/types.ts` are the source of truth for shape — keep them in sync when changing structs.
- `npm run tauri:dev` runs `npm run dev` itself (configured in `tauri.conf.json` `beforeDevCommand`); don't start both.
- The release profile uses LTO + `opt-level = "s"` + `strip` — debug builds are dramatically faster, prefer them while iterating.
- Version control of user files (PRD §2.6) is intentionally not implemented yet; `version.rs` is a placeholder pending a large-file strategy decision.
