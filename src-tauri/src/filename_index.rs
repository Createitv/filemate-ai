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
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering};
use std::sync::Arc;
use walkdir::WalkDir;

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

#[derive(Clone, Debug, Serialize)]
pub struct IndexedEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
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
    state: tauri::State<'_, crate::state::AppState>,
    root: String,
) -> AppResult<usize> {
    let idx = Arc::clone(&state.filename_index);
    tokio::task::spawn_blocking(move || idx.build(Path::new(&root)))
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
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
