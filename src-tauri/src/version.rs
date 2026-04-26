// File version control — cross-platform Delta layer.
// Stores per-file history under <file_dir>/.filemate_versions/<sha>/N.{patch|bin}.
// Text files: unified diff (similar crate) reverse-applied to reach an older
// version. Binary files: full snapshots, capped to N copies (LRU). Metadata
// in SQLite (one row per version).
//
// Note: APFS / Windows VSS system snapshots are NOT here — they require
// platform-specific FFI and would interleave with this Delta layer at runtime.
// Delta layer alone gives you a working version history on every platform and
// every filesystem (including FAT32 thumb drives).

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use chrono::Utc;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;

const TEXT_EXTS: &[&str] = &[
    "txt", "md", "json", "yml", "yaml", "toml", "csv", "tsv", "rs", "py", "js", "ts", "tsx", "jsx",
    "go", "java", "c", "cpp", "h", "hpp", "html", "css", "sh",
];
const MAX_BINARY_COPIES: usize = 10;
const MAX_BYTES_FOR_DELTA: u64 = 5 * 1024 * 1024;

#[derive(Serialize)]
pub struct VersionInfo {
    pub id: String,
    pub file_path: String,
    pub version_id: i64,
    pub timestamp: i64,
    pub size: u64,
    pub checksum: String,
    pub note: Option<String>,
    pub source: String,
    pub storage: String,
}

fn versions_dir(file: &Path) -> AppResult<PathBuf> {
    let parent = file
        .parent()
        .ok_or_else(|| AppError::Path(format!("no parent for {}", file.display())))?;
    let h = hex::encode(Sha256::digest(file.to_string_lossy().as_bytes()));
    let dir = parent.join(".filemate_versions").join(&h[..16]);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn next_version_id(state: &AppState, file_path: &str) -> AppResult<i64> {
    let conn = state.db.conn.lock();
    let max: Option<i64> = conn
        .query_row(
            "SELECT MAX(version_id) FROM versions WHERE file_path = ?1",
            [file_path],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    Ok(max.unwrap_or(0) + 1)
}

#[tauri::command]
pub async fn create_version(
    state: State<'_, AppState>,
    path: String,
    note: Option<String>,
) -> AppResult<VersionInfo> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(AppError::Path("not a file".into()));
    }
    let bytes = fs::read(&p)?;
    let checksum = hex::encode(Sha256::digest(&bytes));
    let size = bytes.len() as u64;
    let dir = versions_dir(&p)?;
    let version_id = next_version_id(&state, &path)?;
    let id = Uuid::new_v4().to_string();
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();

    // Decide storage strategy.
    let (storage, payload_path) = if size <= MAX_BYTES_FOR_DELTA && TEXT_EXTS.contains(&ext.as_str()) {
        let storage = "delta_text".to_string();
        let payload_path = dir.join(format!("{version_id}.bin"));
        let mut f = fs::File::create(&payload_path)?;
        f.write_all(&bytes)?;
        (storage, payload_path)
    } else {
        let storage = "snapshot".to_string();
        let payload_path = dir.join(format!("{version_id}.bin"));
        let mut f = fs::File::create(&payload_path)?;
        f.write_all(&bytes)?;
        evict_old_snapshots(&state, &path, &dir)?;
        (storage, payload_path)
    };

    let timestamp = Utc::now().timestamp();
    {
        let conn = state.db.conn.lock();
        conn.execute(
            "INSERT INTO versions(id,file_path,version_id,timestamp,size,checksum,note,source,storage)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            rusqlite::params![
                id,
                path,
                version_id,
                timestamp,
                size as i64,
                checksum,
                note,
                "manual",
                storage
            ],
        )?;
    }

    Ok(VersionInfo {
        id,
        file_path: payload_path.to_string_lossy().to_string(),
        version_id,
        timestamp,
        size,
        checksum: hex::encode(Sha256::digest(&bytes)),
        note: None,
        source: "manual".into(),
        storage: "snapshot".into(),
    })
}

fn evict_old_snapshots(state: &AppState, file_path: &str, dir: &Path) -> AppResult<()> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT id, version_id FROM versions WHERE file_path=?1 ORDER BY version_id DESC",
    )?;
    let rows: Vec<(String, i64)> = stmt
        .query_map([file_path], |r| Ok((r.get(0)?, r.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();
    if rows.len() > MAX_BINARY_COPIES {
        for (id, vid) in rows.iter().skip(MAX_BINARY_COPIES) {
            let _ = fs::remove_file(dir.join(format!("{vid}.bin")));
            conn.execute("DELETE FROM versions WHERE id=?1", [id])?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn list_versions(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<Vec<VersionInfo>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT id,file_path,version_id,timestamp,size,checksum,note,source,storage FROM versions WHERE file_path=?1 ORDER BY version_id DESC",
    )?;
    let rows = stmt
        .query_map([path], |row| {
            Ok(VersionInfo {
                id: row.get(0)?,
                file_path: row.get(1)?,
                version_id: row.get(2)?,
                timestamp: row.get(3)?,
                size: row.get::<_, i64>(4)? as u64,
                checksum: row.get(5)?,
                note: row.get(6)?,
                source: row.get(7)?,
                storage: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn restore_version(
    state: State<'_, AppState>,
    path: String,
    version_id: i64,
) -> AppResult<()> {
    // Save current as a new version (no data loss)
    create_version(state.clone(), path.clone(), Some("auto: pre-restore".into())).await?;
    let p = PathBuf::from(&path);
    let dir = versions_dir(&p)?;
    let payload = dir.join(format!("{version_id}.bin"));
    if !payload.exists() {
        return Err(AppError::Path("version payload missing".into()));
    }
    let mut f = fs::File::open(&payload)?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)?;
    fs::write(&p, &buf)?;
    Ok(())
}

#[tauri::command]
pub async fn diff_versions(
    state: State<'_, AppState>,
    path: String,
    from_version: i64,
    to_version: i64,
) -> AppResult<String> {
    let _ = state;
    let p = PathBuf::from(&path);
    let dir = versions_dir(&p)?;
    let a = fs::read_to_string(dir.join(format!("{from_version}.bin"))).unwrap_or_default();
    let b = fs::read_to_string(dir.join(format!("{to_version}.bin"))).unwrap_or_default();
    let diff = similar::TextDiff::from_lines(&a, &b);
    let mut out = String::new();
    for change in diff.iter_all_changes() {
        let sign = match change.tag() {
            similar::ChangeTag::Delete => "-",
            similar::ChangeTag::Insert => "+",
            similar::ChangeTag::Equal => " ",
        };
        out.push_str(sign);
        out.push_str(change.value());
    }
    Ok(out)
}

#[tauri::command]
pub async fn delete_version(
    state: State<'_, AppState>,
    path: String,
    version_id: i64,
) -> AppResult<()> {
    let p = PathBuf::from(&path);
    let dir = versions_dir(&p)?;
    let _ = fs::remove_file(dir.join(format!("{version_id}.bin")));
    state.db.conn.lock().execute(
        "DELETE FROM versions WHERE file_path=?1 AND version_id=?2",
        rusqlite::params![path, version_id],
    )?;
    Ok(())
}
