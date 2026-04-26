// Cross-platform "Open With..." support.
//
// list_installed_apps()      -> best-effort scan of system app locations
// open_with(path, app_id)    -> launch a specific application with a file
// open_with_dialog(path)     -> invoke the OS native picker (Windows only)
// reveal_in_folder(path)     -> open Finder/Explorer/file manager at path
//
// macOS scans /Applications + ~/Applications + /System/Applications for
// .app bundles. Linux scans XDG application directories for .desktop files.
// Windows shows the native "Open with" dialog via rundll32 (the user's
// installed apps already live there with proper icons + verbs).

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Clone, Debug)]
pub struct AppInfo {
    pub id: String,        // identifier passed back to open_with
    pub name: String,      // user-facing label
    pub path: String,      // bundle/exec path
    pub kind: String,      // "macos_app" | "linux_desktop" | "windows_exec"
}

#[tauri::command]
pub async fn list_installed_apps() -> AppResult<Vec<AppInfo>> {
    tokio::task::spawn_blocking(scan)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

fn scan() -> AppResult<Vec<AppInfo>> {
    #[cfg(target_os = "macos")]
    {
        return Ok(scan_macos());
    }
    #[cfg(target_os = "linux")]
    {
        return Ok(scan_linux());
    }
    #[cfg(target_os = "windows")]
    {
        return Ok(scan_windows());
    }
    #[allow(unreachable_code)]
    Ok(Vec::new())
}

#[cfg(target_os = "macos")]
fn scan_macos() -> Vec<AppInfo> {
    let mut roots: Vec<std::path::PathBuf> = vec![
        std::path::PathBuf::from("/Applications"),
        std::path::PathBuf::from("/System/Applications"),
    ];
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join("Applications"));
    }

    let mut out = Vec::new();
    for root in roots {
        if !root.is_dir() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&root) {
            collect_macos_apps(&mut out, entries, 0);
        }
        // also one-level subfolders (e.g. /Applications/Utilities)
        if let Ok(entries) = std::fs::read_dir(&root) {
            for e in entries.flatten() {
                let p = e.path();
                if p.is_dir() && !is_app_bundle(&p) {
                    if let Ok(sub) = std::fs::read_dir(&p) {
                        collect_macos_apps(&mut out, sub, 1);
                    }
                }
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out.dedup_by(|a, b| a.path == b.path);
    out
}

#[cfg(target_os = "macos")]
fn collect_macos_apps(out: &mut Vec<AppInfo>, entries: std::fs::ReadDir, _depth: u8) {
    for entry in entries.flatten() {
        let p = entry.path();
        if is_app_bundle(&p) {
            let name = p
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            out.push(AppInfo {
                id: p.to_string_lossy().to_string(),
                name,
                path: p.to_string_lossy().to_string(),
                kind: "macos_app".into(),
            });
        }
    }
}

#[cfg(target_os = "macos")]
fn is_app_bundle(p: &Path) -> bool {
    p.extension().and_then(|s| s.to_str()) == Some("app") && p.is_dir()
}

#[cfg(target_os = "linux")]
fn scan_linux() -> Vec<AppInfo> {
    let mut roots: Vec<std::path::PathBuf> = vec![
        std::path::PathBuf::from("/usr/share/applications"),
        std::path::PathBuf::from("/usr/local/share/applications"),
        std::path::PathBuf::from("/var/lib/flatpak/exports/share/applications"),
    ];
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".local/share/applications"));
        roots.push(home.join(".local/share/flatpak/exports/share/applications"));
    }

    let mut out = Vec::new();
    for root in roots {
        if !root.is_dir() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&root) {
            for e in entries.flatten() {
                let p = e.path();
                if p.extension().and_then(|s| s.to_str()) != Some("desktop") {
                    continue;
                }
                if let Some(info) = parse_desktop(&p) {
                    out.push(info);
                }
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out.dedup_by(|a, b| a.path == b.path);
    out
}

#[cfg(target_os = "linux")]
fn parse_desktop(p: &Path) -> Option<AppInfo> {
    let content = std::fs::read_to_string(p).ok()?;
    let mut name = None;
    let mut exec = None;
    let mut hidden = false;
    let mut no_display = false;
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('[') && line != "[Desktop Entry]" {
            break;
        }
        if let Some(v) = line.strip_prefix("Name=") {
            if name.is_none() {
                name = Some(v.to_string());
            }
        } else if let Some(v) = line.strip_prefix("Exec=") {
            exec = Some(v.to_string());
        } else if line == "Hidden=true" {
            hidden = true;
        } else if line == "NoDisplay=true" {
            no_display = true;
        }
    }
    if hidden || no_display {
        return None;
    }
    Some(AppInfo {
        id: p.to_string_lossy().to_string(),
        name: name?,
        path: exec?,
        kind: "linux_desktop".into(),
    })
}

#[cfg(target_os = "windows")]
fn scan_windows() -> Vec<AppInfo> {
    // We rely on the native "Open With" dialog for picking an application,
    // and surface a few common heavy hitters for quick selection.
    let mut out = Vec::new();
    let known = [
        ("Notepad", r"C:\Windows\System32\notepad.exe"),
        ("WordPad", r"C:\Program Files\Windows NT\Accessories\wordpad.exe"),
        ("Paint", r"C:\Windows\System32\mspaint.exe"),
        (
            "Windows Media Player",
            r"C:\Program Files\Windows Media Player\wmplayer.exe",
        ),
    ];
    for (name, path) in known {
        if std::path::Path::new(path).exists() {
            out.push(AppInfo {
                id: path.to_string(),
                name: name.to_string(),
                path: path.to_string(),
                kind: "windows_exec".into(),
            });
        }
    }
    out
}

#[tauri::command]
pub async fn get_app_icon(app_id: String) -> AppResult<Option<String>> {
    tokio::task::spawn_blocking(move || -> AppResult<Option<String>> {
        Ok(resolve_app_icon(&app_id))
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

fn resolve_app_icon(_id: &str) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        return macos_icon(_id);
    }
    #[cfg(target_os = "linux")]
    {
        return linux_icon(_id);
    }
    #[allow(unreachable_code)]
    None
}

#[cfg(target_os = "macos")]
fn macos_icon(app_path: &str) -> Option<String> {
    let bundle = Path::new(app_path);
    let resources = bundle.join("Contents/Resources");
    if !resources.is_dir() {
        return None;
    }

    // Prefer the icon referenced by Info.plist; fall back to any .icns.
    let icns = read_plist_icon(&bundle.join("Contents/Info.plist"))
        .and_then(|name| {
            let p = if name.ends_with(".icns") {
                resources.join(&name)
            } else {
                resources.join(format!("{name}.icns"))
            };
            if p.is_file() { Some(p) } else { None }
        })
        .or_else(|| first_icns(&resources))?;

    // sips ships with macOS — convert to a small PNG.
    let tmp = std::env::temp_dir().join(format!(
        "filemate_icon_{}.png",
        std::process::id()
    ));
    let out = Command::new("sips")
        .args(["-s", "format", "png", "-Z", "64"])
        .arg(&icns)
        .arg("--out")
        .arg(&tmp)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let bytes = std::fs::read(&tmp).ok()?;
    let _ = std::fs::remove_file(&tmp);
    Some(encode_data_url("image/png", &bytes))
}

#[cfg(target_os = "macos")]
fn read_plist_icon(plist: &Path) -> Option<String> {
    let raw = std::fs::read(plist).ok()?;
    // Quick-and-dirty XML scan; works for the standard text plist.
    let s = std::str::from_utf8(&raw).ok()?;
    let key = s.find("<key>CFBundleIconFile</key>")?;
    let after = &s[key..];
    let start = after.find("<string>")? + "<string>".len();
    let end = after[start..].find("</string>")?;
    Some(after[start..start + end].trim().to_string())
}

#[cfg(target_os = "macos")]
fn first_icns(resources: &Path) -> Option<std::path::PathBuf> {
    std::fs::read_dir(resources)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().and_then(|s| s.to_str()) == Some("icns"))
}

#[cfg(target_os = "linux")]
fn linux_icon(desktop_path: &str) -> Option<String> {
    let content = std::fs::read_to_string(desktop_path).ok()?;
    let mut icon = None;
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('[') && line != "[Desktop Entry]" {
            break;
        }
        if let Some(v) = line.strip_prefix("Icon=") {
            icon = Some(v.to_string());
            break;
        }
    }
    let icon = icon?;
    let path = if Path::new(&icon).is_absolute() && Path::new(&icon).is_file() {
        std::path::PathBuf::from(&icon)
    } else {
        find_themed_icon(&icon)?
    };
    let bytes = std::fs::read(&path).ok()?;
    let mime = match path.extension().and_then(|s| s.to_str()) {
        Some("svg") => "image/svg+xml",
        Some("xpm") => "image/x-xpixmap",
        _ => "image/png",
    };
    Some(encode_data_url(mime, &bytes))
}

#[cfg(target_os = "linux")]
fn find_themed_icon(name: &str) -> Option<std::path::PathBuf> {
    let mut roots: Vec<std::path::PathBuf> = vec![
        std::path::PathBuf::from("/usr/share/icons/hicolor"),
        std::path::PathBuf::from("/usr/share/icons"),
    ];
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".local/share/icons/hicolor"));
        roots.push(home.join(".icons"));
    }
    let sizes = ["64x64", "128x128", "48x48", "256x256", "scalable", "32x32"];
    let exts = ["png", "svg", "xpm"];
    for root in &roots {
        for size in &sizes {
            for ext in &exts {
                let p = root.join(size).join("apps").join(format!("{name}.{ext}"));
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    for ext in &exts {
        let p = std::path::Path::new("/usr/share/pixmaps").join(format!("{name}.{ext}"));
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

#[allow(dead_code)]
fn encode_data_url(mime: &str, bytes: &[u8]) -> String {
    use base64::Engine;
    format!(
        "data:{};base64,{}",
        mime,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

#[tauri::command]
pub async fn open_with(path: String, app_id: String) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg("-a")
            .arg(&app_id)
            .arg(&path)
            .status()
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !status.success() {
            return Err(AppError::Other(format!("open exited {status}")));
        }
    }
    #[cfg(target_os = "linux")]
    {
        // app_id may be a .desktop file path or an exec string
        let cmd = if app_id.ends_with(".desktop") {
            // extract Exec from desktop entry
            let info = parse_desktop(Path::new(&app_id))
                .ok_or_else(|| AppError::Other("invalid desktop file".into()))?;
            let mut argv = info
                .path
                .replace("%f", &path)
                .replace("%F", &path)
                .replace("%u", &path)
                .replace("%U", &path);
            // remove leftover %-codes
            for code in ["%i", "%c", "%k"] {
                argv = argv.replace(code, "");
            }
            argv
        } else {
            format!("{app_id} {}", shell_escape(&path))
        };
        Command::new("sh")
            .arg("-c")
            .arg(&cmd)
            .spawn()
            .map_err(|e| AppError::Other(e.to_string()))?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new(&app_id)
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Other(e.to_string()))?;
    }
    let _ = (path, app_id); // satisfy unused-warnings on stub platforms
    Ok(())
}

#[allow(dead_code)]
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[tauri::command]
pub async fn open_with_dialog(path: String) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32.exe")
            .arg("shell32.dll,OpenAs_RunDLL")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Other(e.to_string()))?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err(AppError::Other(
            "系统级 Open With 对话框仅在 Windows 可用，请从 FileMate 应用列表中选择".into(),
        ))
    }
}

#[tauri::command]
pub async fn reveal_in_folder(path: String) -> AppResult<()> {
    let p = Path::new(&path);
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(p)
            .status()
            .map_err(|e| AppError::Other(e.to_string()))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", p.display()))
            .spawn()
            .map_err(|e| AppError::Other(e.to_string()))?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        // most file managers don't accept "select"; open the parent directory
        let target = if p.is_file() {
            p.parent().unwrap_or(p)
        } else {
            p
        };
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| AppError::Other(e.to_string()))?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}
