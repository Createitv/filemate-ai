// Disk usage stats reported via sysinfo. Frontend Home page consumes this for
// the storage ring + per-volume breakdown.

use crate::error::AppResult;
use serde::Serialize;
use sysinfo::Disks;

#[derive(Serialize)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total: u64,
    pub available: u64,
    pub used: u64,
    pub percent: f32,
    pub fs: String,
    pub removable: bool,
}

#[tauri::command]
pub async fn list_disks() -> AppResult<Vec<DiskInfo>> {
    let disks = Disks::new_with_refreshed_list();
    let out = disks
        .iter()
        .map(|d| {
            let total = d.total_space();
            let avail = d.available_space();
            let used = total.saturating_sub(avail);
            let percent = if total > 0 {
                (used as f64 / total as f64 * 100.0) as f32
            } else {
                0.0
            };
            DiskInfo {
                name: d.name().to_string_lossy().to_string(),
                mount_point: d.mount_point().to_string_lossy().to_string(),
                total,
                available: avail,
                used,
                percent,
                fs: d.file_system().to_string_lossy().to_string(),
                removable: d.is_removable(),
            }
        })
        .collect();
    Ok(out)
}
