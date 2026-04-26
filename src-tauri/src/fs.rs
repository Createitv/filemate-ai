// Real file-system operations exposed as Tauri commands.
// Performance-sensitive listings use std::fs directly; ops that touch the
// recycle bin go through the `trash` crate so we get cross-platform behavior.

use crate::error::{AppError, AppResult};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified: Option<DateTime<Utc>>,
    pub created: Option<DateTime<Utc>>,
    pub mime: Option<String>,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirListing {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<DirEntryInfo>,
}

fn system_time_to_dt(t: Option<SystemTime>) -> Option<DateTime<Utc>> {
    t.map(DateTime::<Utc>::from)
}

pub fn entry_from_path(p: &Path) -> Option<DirEntryInfo> {
    let meta = fs::symlink_metadata(p).ok()?;
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| p.to_string_lossy().to_string());
    let extension = p.extension().map(|e| e.to_string_lossy().to_string());
    let mime = mime_guess::from_path(p).first().map(|m| m.to_string());
    Some(DirEntryInfo {
        name,
        path: p.to_string_lossy().to_string(),
        is_dir: meta.is_dir(),
        is_symlink: meta.file_type().is_symlink(),
        size: if meta.is_file() { meta.len() } else { 0 },
        modified: system_time_to_dt(meta.modified().ok()),
        created: system_time_to_dt(meta.created().ok()),
        mime,
        extension,
    })
}

#[tauri::command]
pub async fn list_dir(path: String, show_hidden: Option<bool>) -> AppResult<DirListing> {
    let show_hidden = show_hidden.unwrap_or(false);
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::Path(format!("path does not exist: {path}")));
    }
    let mut entries: Vec<DirEntryInfo> = fs::read_dir(&p)?
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            if !show_hidden {
                if let Some(name) = path.file_name() {
                    if name.to_string_lossy().starts_with('.') {
                        return None;
                    }
                }
            }
            entry_from_path(&path)
        })
        .collect();

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(DirListing {
        path: p.to_string_lossy().to_string(),
        parent: p.parent().map(|x| x.to_string_lossy().to_string()),
        entries,
    })
}

#[tauri::command]
pub async fn home_dir() -> AppResult<String> {
    Ok(dirs::home_dir()
        .ok_or_else(|| AppError::Path("no home directory".into()))?
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
pub async fn create_folder(path: String, name: String) -> AppResult<String> {
    let target = Path::new(&path).join(&name);
    fs::create_dir_all(&target)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn rename_entry(from: String, to: String) -> AppResult<()> {
    fs::rename(&from, &to)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_to_trash(paths: Vec<String>) -> AppResult<()> {
    trash::delete_all(paths)?;
    Ok(())
}

#[tauri::command]
pub async fn copy_entry(from: String, to: String, overwrite: Option<bool>) -> AppResult<()> {
    let src = Path::new(&from);
    let dst = Path::new(&to);
    let overwrite = overwrite.unwrap_or(false);
    if dst.exists() && !overwrite {
        return Err(AppError::Path(format!(
            "destination exists: {}",
            dst.display()
        )));
    }
    if src.is_dir() {
        copy_dir_recursive(src, dst)?;
    } else {
        if let Some(p) = dst.parent() {
            fs::create_dir_all(p)?;
        }
        fs::copy(src, dst)?;
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let e = entry?;
        let to = dst.join(e.file_name());
        if e.file_type()?.is_dir() {
            copy_dir_recursive(&e.path(), &to)?;
        } else {
            fs::copy(e.path(), to)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn move_entry(from: String, to: String) -> AppResult<()> {
    let src = Path::new(&from);
    let dst = Path::new(&to);
    if let Err(e) = fs::rename(src, dst) {
        // cross-device: fall back to copy + delete
        if e.kind() == std::io::ErrorKind::CrossesDevices
            || e.raw_os_error() == Some(18)
        {
            if src.is_dir() {
                copy_dir_recursive(src, dst)?;
                fs::remove_dir_all(src)?;
            } else {
                fs::copy(src, dst)?;
                fs::remove_file(src)?;
            }
        } else {
            return Err(e.into());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn metadata(path: String) -> AppResult<DirEntryInfo> {
    entry_from_path(Path::new(&path))
        .ok_or_else(|| AppError::Path(format!("cannot read metadata: {path}")))
}

#[tauri::command]
pub async fn open_path(path: String) -> AppResult<()> {
    // Cross-platform "reveal/open" via opener crate (registered as a Tauri plugin).
    // Frontend can also call the `opener` plugin directly; this thin wrapper keeps
    // command shape consistent with the rest of the fs API.
    opener::open(&path).map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}
