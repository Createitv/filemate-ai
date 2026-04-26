// AppState is shared via Tauri's managed state. Holds DB connection, watcher
// channels, and the search index handle.

use crate::db::Db;
use crate::filename_index::FilenameIndex;
use crate::search::Index;
use parking_lot::Mutex;
use std::sync::Arc;

pub struct AppState {
    pub db: Arc<Db>,
    pub index: Arc<Index>,
    pub filename_index: Arc<FilenameIndex>,
    pub watcher: Mutex<Option<crate::watcher::WatcherHandle>>,
}

impl AppState {
    pub fn new(db: Db, index: Index) -> Self {
        Self {
            db: Arc::new(db),
            index: Arc::new(index),
            filename_index: Arc::new(FilenameIndex::new()),
            watcher: Mutex::new(None),
        }
    }
}
