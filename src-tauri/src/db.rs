// SQLite-backed persistence for tags, bookmarks, recents, workspaces,
// automation rules, and version metadata. Single connection guarded by Mutex
// is fine for a desktop app (low concurrency, ~ms-scale ops).

use crate::error::AppResult;
use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::Path;

pub struct Db {
    pub conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recents (
    path        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    accessed_at INTEGER NOT NULL,
    is_dir      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_recents_time ON recents(accessed_at DESC);

CREATE TABLE IF NOT EXISTS bookmarks (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    path      TEXT NOT NULL UNIQUE,
    name      TEXT NOT NULL,
    group_name TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT NOT NULL UNIQUE,
    color  TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_tags (
    path   TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (path, tag_id),
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspaces (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    state     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_rules (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    enabled   INTEGER NOT NULL DEFAULT 1,
    trigger   TEXT NOT NULL,
    conditions TEXT NOT NULL,
    actions   TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id     TEXT NOT NULL,
    rule_name   TEXT NOT NULL,
    affected    INTEGER NOT NULL,
    detail      TEXT,
    occurred_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS versions (
    id          TEXT PRIMARY KEY,
    file_path   TEXT NOT NULL,
    version_id  INTEGER NOT NULL,
    timestamp   INTEGER NOT NULL,
    size        INTEGER NOT NULL,
    checksum    TEXT NOT NULL,
    note        TEXT,
    source      TEXT NOT NULL,
    storage     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_path ON versions(file_path, timestamp DESC);

CREATE TABLE IF NOT EXISTS cloud_accounts (
    id         TEXT PRIMARY KEY,
    provider   TEXT NOT NULL,
    name       TEXT NOT NULL,
    config     TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
"#;
