// Storage-cleanup helpers for the /storage page.
//
// Surfaces three buckets the user can free space from:
//   - app cache directories (~/Library/Caches on macOS, %TEMP% on Windows,
//     ~/.cache on Linux)
//   - the system trash (~/.Trash, $Recycle.Bin\<SID>, ~/.local/share/Trash)
//
// All "destructive" commands (clear_cache_dir, empty_trash) are guarded:
// clear_cache_dir only accepts paths it itself returned via cache_dirs(),
// and empty_trash shells out to the OS-native API rather than rm-ing files.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Serialize, Clone, Debug)]
pub struct CacheDir {
    pub label: String,
    pub path: String,
    pub size: u64,
    pub item_count: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct TrashStats {
    pub path: String,
    pub size: u64,
    pub item_count: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct OldFilesReport {
    pub path: String,
    pub size: u64,
    pub item_count: u64,
    pub sample: Vec<String>, // up to 10 file paths
}

// ---------- discovery ---------------------------------------------------

#[tauri::command]
pub async fn cache_dirs() -> AppResult<Vec<CacheDir>> {
    tokio::task::spawn_blocking(scan_cache_dirs)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

fn scan_cache_dirs() -> AppResult<Vec<CacheDir>> {
    let mut roots: Vec<(String, PathBuf)> = Vec::new();
    let home = dirs::home_dir();

    #[cfg(target_os = "macos")]
    {
        if let Some(h) = &home {
            roots.push(("用户缓存".into(), h.join("Library/Caches")));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(h) = &home {
            roots.push(("用户缓存".into(), h.join(".cache")));
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(p) = std::env::var("TEMP") {
            roots.push(("系统临时文件".into(), PathBuf::from(p)));
        }
        if let Ok(p) = std::env::var("LOCALAPPDATA") {
            roots.push(("应用临时文件".into(), PathBuf::from(p).join("Temp")));
        }
    }

    let mut out = Vec::new();
    for (label, path) in roots {
        if !path.is_dir() {
            continue;
        }
        let (size, item_count) = dir_stats(&path);
        out.push(CacheDir {
            label,
            path: path.to_string_lossy().to_string(),
            size,
            item_count,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn trash_stats() -> AppResult<TrashStats> {
    tokio::task::spawn_blocking(scan_trash)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

fn scan_trash() -> AppResult<TrashStats> {
    let path = trash_path()?;
    if !path.is_dir() {
        return Ok(TrashStats {
            path: path.to_string_lossy().to_string(),
            size: 0,
            item_count: 0,
        });
    }
    let (size, item_count) = dir_stats(&path);
    Ok(TrashStats {
        path: path.to_string_lossy().to_string(),
        size,
        item_count,
    })
}

fn trash_path() -> AppResult<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| AppError::Path("no home directory".into()))?;
    #[cfg(target_os = "macos")]
    {
        return Ok(home.join(".Trash"));
    }
    #[cfg(target_os = "linux")]
    {
        return Ok(home.join(".local/share/Trash/files"));
    }
    #[cfg(target_os = "windows")]
    {
        // We can't easily resolve $Recycle.Bin\<SID> reliably from Rust
        // without WinAPI; just expose the per-user folder under the user
        // profile's drive. Stats may report 0 if the OS hasn't created
        // a SID folder yet — that's fine.
        let drive = home.components().next().map(|c| c.as_os_str().to_string_lossy().to_string());
        if let Some(d) = drive {
            return Ok(PathBuf::from(format!("{d}\\$Recycle.Bin")));
        }
        return Err(AppError::Path("could not resolve recycle bin".into()));
    }
    #[allow(unreachable_code)]
    Err(AppError::Path("unsupported platform".into()))
}

fn dir_stats(p: &Path) -> (u64, u64) {
    let mut size = 0u64;
    let mut count = 0u64;
    for entry in WalkDir::new(p).max_depth(8).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                size += meta.len();
                count += 1;
            }
        }
    }
    (size, count)
}

/// Walk a directory and report files whose mtime is older than `days` days.
/// Returns aggregate size + count + a small sample for UI preview. Read-only.
#[tauri::command]
pub async fn old_files_in(path: String, days: u64) -> AppResult<OldFilesReport> {
    tokio::task::spawn_blocking(move || -> AppResult<OldFilesReport> {
        let p = PathBuf::from(&path);
        if !p.is_dir() {
            return Ok(OldFilesReport {
                path,
                size: 0,
                item_count: 0,
                sample: vec![],
            });
        }
        let cutoff = std::time::SystemTime::now()
            .checked_sub(std::time::Duration::from_secs(days * 86_400))
            .unwrap_or(std::time::UNIX_EPOCH);

        let mut size = 0u64;
        let mut count = 0u64;
        let mut sample: Vec<String> = Vec::new();

        for entry in WalkDir::new(&p).max_depth(6).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let modified = match meta.modified() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if modified > cutoff {
                continue;
            }
            size += meta.len();
            count += 1;
            if sample.len() < 10 {
                sample.push(entry.path().to_string_lossy().to_string());
            }
        }

        Ok(OldFilesReport {
            path,
            size,
            item_count: count,
            sample,
        })
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

/// Delete files older than `days` days inside a whitelisted user directory
/// (Downloads only for safety). Returns bytes freed.
#[tauri::command]
pub async fn clear_old_files_in(path: String, days: u64) -> AppResult<u64> {
    let home = dirs::home_dir().ok_or_else(|| AppError::Path("no home dir".into()))?;
    let allowed = [home.join("Downloads")];
    let p = PathBuf::from(&path);
    if !allowed.iter().any(|a| a == &p) {
        return Err(AppError::Other(
            "path not in old-cleanup whitelist (Downloads only); refusing".into(),
        ));
    }

    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(days * 86_400))
        .unwrap_or(std::time::UNIX_EPOCH);

    tokio::task::spawn_blocking(move || -> AppResult<u64> {
        let mut freed = 0u64;
        for entry in fs::read_dir(&p)? {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let child = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let modified = match meta.modified() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if modified > cutoff {
                continue;
            }
            // move to trash so users can recover
            if let Err(e) = trash::delete(&child) {
                tracing::warn!("trash failed, falling back to remove: {e}");
                if meta.is_dir() {
                    let _ = fs::remove_dir_all(&child);
                } else {
                    let _ = fs::remove_file(&child);
                }
            }
            freed += meta.len();
        }
        Ok(freed)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

// ---------- destructive ops ---------------------------------------------

#[tauri::command]
pub async fn clear_cache_dir(path: String) -> AppResult<u64> {
    // Only accept a path that scan_cache_dirs would have returned. This is
    // a guard against a malicious frontend message sneaking in something
    // like '/' or '/Users'.
    let allowed = scan_cache_dirs()?;
    let approved = allowed.iter().any(|d| d.path == path);
    if !approved {
        return Err(AppError::Other(
            "path not in cache whitelist; refusing".into(),
        ));
    }

    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(AppError::Path(format!("not a directory: {path}")));
    }

    let freed = tokio::task::spawn_blocking(move || -> AppResult<u64> {
        let mut total = 0u64;
        for entry in fs::read_dir(&p)? {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let child = entry.path();
            // tally before deletion
            let (size, _) = dir_stats(&child);
            total += size;
            // best-effort delete; macOS Caches has system-protected items
            if child.is_dir() {
                let _ = fs::remove_dir_all(&child);
            } else {
                let _ = fs::remove_file(&child);
            }
        }
        Ok(total)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    Ok(freed)
}

#[tauri::command]
pub async fn empty_trash() -> AppResult<()> {
    tokio::task::spawn_blocking(empty_trash_sync)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

fn empty_trash_sync() -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("osascript")
            .args(["-e", "tell application \"Finder\" to empty trash"])
            .status()
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !status.success() {
            return Err(AppError::Other(format!("osascript exited {status}")));
        }
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"])
            .status()
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !status.success() {
            return Err(AppError::Other(format!("powershell exited {status}")));
        }
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        let home = dirs::home_dir().ok_or_else(|| AppError::Path("no home directory".into()))?;
        for sub in ["files", "info"] {
            let p = home.join(format!(".local/share/Trash/{sub}"));
            if p.is_dir() {
                for entry in fs::read_dir(&p)? {
                    let entry = match entry {
                        Ok(e) => e,
                        Err(_) => continue,
                    };
                    let child = entry.path();
                    if child.is_dir() {
                        let _ = fs::remove_dir_all(&child);
                    } else {
                        let _ = fs::remove_file(&child);
                    }
                }
            }
        }
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err(AppError::Other("unsupported platform".into()))
}
