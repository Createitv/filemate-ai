// Disk usage stats reported via sysinfo. Frontend Home page consumes this for
// the storage ring + per-volume breakdown.
//
// macOS quirk: APFS volumes are firmlinked together, so sysinfo lists both
// "/" and "/System/Volumes/Data" with identical total/available numbers
// (they're literally the same container). We filter the system-internal
// volumes out, plus dedupe anything that reports the same total bytes as
// an already-listed volume.

use crate::error::AppResult;
use serde::Serialize;
use std::collections::HashSet;
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
    let mut seen_totals: HashSet<u64> = HashSet::new();
    let mut out: Vec<DiskInfo> = Vec::new();

    for d in disks.iter() {
        let mount = d.mount_point().to_string_lossy().to_string();
        if !is_user_visible(&mount) {
            continue;
        }
        let total = d.total_space();
        let avail = d.available_space();
        if total == 0 {
            continue;
        }
        // Dedupe firmlinked APFS volumes that report identical sizes.
        let key = total.wrapping_mul(31).wrapping_add(avail);
        if !seen_totals.insert(key) {
            continue;
        }

        let used = total.saturating_sub(avail);
        let percent = (used as f64 / total as f64 * 100.0) as f32;

        out.push(DiskInfo {
            name: friendly_name(&mount, &d.name().to_string_lossy()),
            mount_point: mount,
            total,
            available: avail,
            used,
            percent,
            fs: d.file_system().to_string_lossy().to_string(),
            removable: d.is_removable(),
        });
    }

    Ok(out)
}

fn is_user_visible(mount: &str) -> bool {
    // macOS: hide all the firmlink/synthetic volumes
    if mount.starts_with("/System/Volumes/") {
        return false;
    }
    if mount == "/private/var/vm" || mount.starts_with("/private/var/vm/") {
        return false;
    }
    // Linux: hide kernel/runtime pseudo filesystems
    let pseudo_prefixes = [
        "/proc",
        "/sys",
        "/dev",
        "/run",
        "/snap",
        "/var/snap",
        "/var/lib/docker",
        "/var/lib/containers",
        "/boot/efi",
    ];
    for p in pseudo_prefixes {
        if mount == p || mount.starts_with(&format!("{p}/")) {
            return false;
        }
    }
    // Windows: keep all drive letters and mounted volumes (no special filter)
    true
}

fn friendly_name(mount: &str, raw_name: &str) -> String {
    if mount == "/" {
        return "系统盘".into();
    }
    if let Some(stripped) = mount.strip_prefix("/Volumes/") {
        return stripped.to_string();
    }
    if !raw_name.is_empty() {
        return raw_name.to_string();
    }
    mount
        .split(['/', '\\'])
        .filter(|s| !s.is_empty())
        .next_back()
        .unwrap_or(mount)
        .to_string()
}
