// In-memory filename index for Everything-style instant search.
//
// Build phase walks the chosen scope once with WalkDir, skipping noisy dirs
// (.git, node_modules, system caches). Each entry stores (lowercase name,
// path, size, modified, is_dir) — small enough that 1M entries is ~150MB.
//
// Query is a single-pass substring scan over the lowercase names — ~10 ms
// per million entries on a modern CPU, comfortably faster than the user
// can type. Results are returned in insertion order, capped by `limit`.
//
// FsEvent integration (apply_event) keeps the index live without re-walking:
// create/rename/delete from the existing notify watcher patch the Vec
// directly. A full rebuild is only needed if the user changes scope.

use crate::error::AppResult;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering};
use std::sync::Arc;
use walkdir::WalkDir;

const PERSIST_FILENAME: &str = "filename_index.bin";
const PERSIST_VERSION: u32 = 1;

const NOISE_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".venv",
    "venv",
    "__pycache__",
    ".cache",
    ".gradle",
    ".m2",
    ".rustup",
    ".cargo",
    ".npm",
    ".pnpm-store",
    "DerivedData",
    // macOS system caches
    "Library/Caches",
    // Windows system folders that explode the walk
    "Windows",
    "$Recycle.Bin",
    "System Volume Information",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IndexedEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
}

#[derive(Serialize, Deserialize)]
struct Snapshot {
    version: u32,
    root: String,
    built_at: i64,
    entries: Vec<IndexedEntry>,
}

struct Inner {
    entries: Vec<IndexedEntry>,
    /// Lower-cased basename, parallel to `entries`. Searching against this
    /// avoids per-row to_lowercase allocations on the hot path.
    names_lower: Vec<String>,
}

pub struct FilenameIndex {
    inner: RwLock<Inner>,
    pub root: RwLock<Option<String>>,
    pub indexing: AtomicBool,
    pub progress: AtomicUsize,
    pub built_at: AtomicI64,
}

impl FilenameIndex {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(Inner {
                entries: Vec::new(),
                names_lower: Vec::new(),
            }),
            root: RwLock::new(None),
            indexing: AtomicBool::new(false),
            progress: AtomicUsize::new(0),
            built_at: AtomicI64::new(0),
        }
    }

    /// Walk `root` and replace the in-memory index. Updates `progress` every
    /// 1024 files so the UI can poll status. Returns total entry count.
    pub fn build(&self, root: &Path) -> AppResult<usize> {
        self.indexing.store(true, Ordering::Release);
        self.progress.store(0, Ordering::Release);

        let mut entries = Vec::with_capacity(1 << 16);
        let mut names_lower = Vec::with_capacity(1 << 16);

        let walker = WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| !is_noise(e.path()));

        for ent in walker.filter_map(|e| e.ok()) {
            let path = ent.path();
            let name = match path.file_name() {
                Some(n) => n.to_string_lossy().to_string(),
                None => continue,
            };
            let metadata = match ent.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let is_dir = metadata.is_dir();
            let size = if is_dir { 0 } else { metadata.len() };
            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            names_lower.push(name.to_lowercase());
            entries.push(IndexedEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir,
                size,
                modified,
            });

            if entries.len() % 1024 == 0 {
                self.progress.store(entries.len(), Ordering::Relaxed);
            }
        }

        let count = entries.len();
        {
            let mut w = self.inner.write();
            w.entries = entries;
            w.names_lower = names_lower;
        }
        *self.root.write() = Some(root.to_string_lossy().into_owned());
        self.progress.store(count, Ordering::Release);
        self.built_at.store(now_secs(), Ordering::Release);
        self.indexing.store(false, Ordering::Release);
        Ok(count)
    }

    /// Substring match on lowercase names. Returns up to `limit` results.
    pub fn query(&self, pattern: &str, limit: usize) -> Vec<IndexedEntry> {
        let pat = pattern.trim().to_lowercase();
        if pat.is_empty() {
            return Vec::new();
        }
        let inner = self.inner.read();
        let mut out = Vec::with_capacity(limit.min(64));
        for (i, n) in inner.names_lower.iter().enumerate() {
            if n.contains(&pat) {
                out.push(inner.entries[i].clone());
                if out.len() >= limit {
                    break;
                }
            }
        }
        out
    }

    pub fn count(&self) -> usize {
        self.inner.read().entries.len()
    }

    /// Persist the current index next to other app data. Cheap on miss
    /// (creates the parent dir) and best-effort on failure.
    pub fn save_to(&self, dir: &Path) -> AppResult<()> {
        std::fs::create_dir_all(dir)?;
        let path = dir.join(PERSIST_FILENAME);
        let entries = self.inner.read().entries.clone();
        let root = self
            .root
            .read()
            .clone()
            .unwrap_or_else(|| String::from(""));
        let snap = Snapshot {
            version: PERSIST_VERSION,
            root,
            built_at: self.built_at.load(Ordering::Acquire),
            entries,
        };
        let bytes = bincode::serialize(&snap)
            .map_err(|e| crate::error::AppError::Other(e.to_string()))?;
        // Write to a sibling temp file, then atomic-rename to avoid
        // half-written state if the process exits mid-write.
        let tmp = path.with_extension("bin.tmp");
        std::fs::write(&tmp, &bytes)?;
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }

    /// Load a previously persisted index. Returns Ok(false) when the file
    /// doesn't exist or its version is incompatible — caller falls back to
    /// a fresh build.
    pub fn load_from(&self, dir: &Path) -> AppResult<bool> {
        let path = dir.join(PERSIST_FILENAME);
        if !path.is_file() {
            return Ok(false);
        }
        let bytes = std::fs::read(&path)?;
        let snap: Snapshot = match bincode::deserialize(&bytes) {
            Ok(s) => s,
            Err(_) => return Ok(false),
        };
        if snap.version != PERSIST_VERSION {
            return Ok(false);
        }
        let names_lower: Vec<String> =
            snap.entries.iter().map(|e| e.name.to_lowercase()).collect();
        {
            let mut w = self.inner.write();
            w.entries = snap.entries;
            w.names_lower = names_lower;
        }
        *self.root.write() = if snap.root.is_empty() {
            None
        } else {
            Some(snap.root)
        };
        self.built_at.store(snap.built_at, Ordering::Release);
        self.progress
            .store(self.inner.read().entries.len(), Ordering::Release);
        Ok(true)
    }

    /// Apply a watcher event. Cheap-on-miss: silently ignores paths outside
    /// the indexed root. Renames are handled as remove(from) + add(to).
    pub fn apply_event(&self, ev: &crate::watcher::FsEvent) {
        use crate::watcher::FsEvent::*;
        match ev {
            Created { path } | Modified { path } => self.upsert(path),
            Removed { path } => self.remove(path),
            Renamed { from, to } => {
                self.remove(from);
                self.upsert(to);
            }
            Other { .. } => {}
        }
    }

    fn upsert(&self, path: &str) {
        if !self.path_in_root(path) {
            return;
        }
        let p = PathBuf::from(path);
        let metadata = match std::fs::symlink_metadata(&p) {
            Ok(m) => m,
            Err(_) => return,
        };
        let name = match p.file_name() {
            Some(n) => n.to_string_lossy().into_owned(),
            None => return,
        };
        let is_dir = metadata.is_dir();
        let size = if is_dir { 0 } else { metadata.len() };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let mut w = self.inner.write();
        if let Some(i) = w.entries.iter().position(|e| e.path == path) {
            w.entries[i].name = name.clone();
            w.entries[i].is_dir = is_dir;
            w.entries[i].size = size;
            w.entries[i].modified = modified;
            w.names_lower[i] = name.to_lowercase();
        } else {
            w.names_lower.push(name.to_lowercase());
            w.entries.push(IndexedEntry {
                name,
                path: path.to_string(),
                is_dir,
                size,
                modified,
            });
        }
    }

    fn remove(&self, path: &str) {
        if !self.path_in_root(path) {
            return;
        }
        let mut w = self.inner.write();
        if let Some(i) = w.entries.iter().position(|e| e.path == path) {
            w.entries.swap_remove(i);
            w.names_lower.swap_remove(i);
        }
    }

    fn path_in_root(&self, path: &str) -> bool {
        match self.root.read().as_ref() {
            Some(r) => path.starts_with(r),
            None => false,
        }
    }
}

fn is_noise(p: &Path) -> bool {
    let name = match p.file_name() {
        Some(n) => n.to_string_lossy(),
        None => return false,
    };
    NOISE_DIRS.iter().any(|d| {
        // match either the basename (".git") or a path-suffix ("Library/Caches")
        if d.contains('/') {
            p.to_string_lossy().ends_with(d)
        } else {
            name == *d
        }
    })
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ---------- Tauri commands ----------

#[derive(Serialize)]
pub struct IndexStatus {
    pub root: Option<String>,
    pub count: usize,
    pub indexing: bool,
    pub progress: usize,
    pub built_at: i64,
}

#[tauri::command]
pub async fn build_filename_index(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
    root: String,
) -> AppResult<usize> {
    let idx = Arc::clone(&state.filename_index);
    let data_dir = app_data_dir(&app);
    tokio::task::spawn_blocking(move || -> AppResult<usize> {
        let n = idx.build(Path::new(&root))?;
        if let Some(d) = data_dir {
            let _ = idx.save_to(&d);
        }
        Ok(n)
    })
    .await
    .map_err(|e| crate::error::AppError::Other(e.to_string()))?
}

fn app_data_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    app.path().app_data_dir().ok()
}

/// Called once at app startup. Tries to restore the persisted index; if
/// nothing on disk, kicks off a background build over $HOME so the user
/// can search shortly after launch without manual indexing.
pub fn spawn_startup_scan(app: tauri::AppHandle) {
    use tauri::Manager;
    let idx = match app.try_state::<crate::state::AppState>() {
        Some(s) => Arc::clone(&s.filename_index),
        None => return,
    };
    idx.indexing.store(true, Ordering::Release);
    tokio::spawn(async move {
        let data_dir = app_data_dir(&app);

        // 1. Try to load from disk — instant if present.
        if let Some(ref d) = data_dir {
            let idx2 = Arc::clone(&idx);
            let d2 = d.clone();
            let loaded = tokio::task::spawn_blocking(move || idx2.load_from(&d2))
                .await
                .unwrap_or(Ok(false))
                .unwrap_or(false);
            if loaded {
                tracing::info!(
                    "filename index restored: {} entries",
                    idx.count()
                );
                idx.indexing.store(false, Ordering::Release);
                return;
            }
        }

        // 2. Cold start — walk $HOME in the background.
        let home = match dirs::home_dir() {
            Some(p) => p,
            None => {
                idx.indexing.store(false, Ordering::Release);
                return;
            }
        };
        tracing::info!("filename index: cold-building over {}", home.display());
        let idx2 = Arc::clone(&idx);
        let res = tokio::task::spawn_blocking(move || idx2.build(&home))
            .await
            .map_err(|e| crate::error::AppError::Other(e.to_string()));
        match res {
            Ok(Ok(n)) => {
                tracing::info!("filename index built: {n} entries");
                if let Some(d) = data_dir {
                    let idx2 = Arc::clone(&idx);
                    let _ = tokio::task::spawn_blocking(move || idx2.save_to(&d))
                        .await;
                }
            }
            Ok(Err(e)) => tracing::warn!("filename index build failed: {e}"),
            Err(e) => tracing::warn!("filename index build join failed: {e}"),
        }
    });
}

#[tauri::command]
pub fn filename_index_status(
    state: tauri::State<'_, crate::state::AppState>,
) -> IndexStatus {
    let idx = &state.filename_index;
    IndexStatus {
        root: idx.root.read().clone(),
        count: idx.count(),
        indexing: idx.indexing.load(Ordering::Acquire),
        progress: idx.progress.load(Ordering::Acquire),
        built_at: idx.built_at.load(Ordering::Acquire),
    }
}

#[tauri::command]
pub fn query_filename_index(
    state: tauri::State<'_, crate::state::AppState>,
    pattern: String,
    limit: Option<usize>,
) -> Vec<IndexedEntry> {
    state
        .filename_index
        .query(&pattern, limit.unwrap_or(500).min(2000))
}
