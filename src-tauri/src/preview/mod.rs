// Preview subsystem: detects file kind and dispatches to per-format helpers.
// Each helper is in its own file and only runs when needed, so cargo only
// pulls in heavy parsing for files the user actually opens.

mod audio;
mod code;
mod font;
mod image_meta;
mod text;

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::fs;
use std::path::Path;

pub use audio::AudioMeta;
pub use font::FontMeta;
pub use image_meta::ImageMeta;

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FormatExtras {
    None,
    Image(ImageMeta),
    Audio(AudioMeta),
    Font(FontMeta),
}

#[derive(Serialize)]
pub struct PreviewMeta {
    pub kind: String,
    pub mime: Option<String>,
    pub size: u64,
    pub modified: Option<i64>,
    pub created: Option<i64>,
    pub extension: Option<String>,
    pub text: Option<String>,
    pub language: Option<String>,
    pub extras: FormatExtras,
}

const MAX_TEXT: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub async fn preview_file(path: String) -> AppResult<PreviewMeta> {
    tokio::task::spawn_blocking(move || preview_file_sync(&path))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

fn preview_file_sync(path: &str) -> AppResult<PreviewMeta> {
    let p = Path::new(path);
    let meta = fs::metadata(p)?;
    let mime = mime_guess::from_path(p).first().map(|m| m.to_string());
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase());

    let kind = detect_kind(ext.as_deref(), mime.as_deref());
    let modified = systime(meta.modified().ok());
    let created = systime(meta.created().ok());

    let mut text = None;
    let mut language = None;
    let mut extras = FormatExtras::None;

    match kind.as_str() {
        "image" => {
            if let Ok(im) = image_meta::extract(p) {
                extras = FormatExtras::Image(im);
            }
        }
        "audio" => {
            if let Ok(am) = audio::extract(p) {
                extras = FormatExtras::Audio(am);
            }
        }
        "font" => {
            if let Ok(fm) = font::extract(p) {
                extras = FormatExtras::Font(fm);
            }
        }
        "markdown" | "text" => {
            if meta.len() <= MAX_TEXT {
                text = text::read(p).ok();
            }
        }
        "code" => {
            if meta.len() <= MAX_TEXT {
                text = text::read(p).ok();
                language = ext.clone().map(code::language_for);
            }
        }
        "svg" => {
            if meta.len() <= MAX_TEXT {
                text = text::read(p).ok();
            }
        }
        _ => {}
    }

    Ok(PreviewMeta {
        kind,
        mime,
        size: meta.len(),
        modified,
        created,
        extension: ext,
        text,
        language,
        extras,
    })
}

fn detect_kind(ext: Option<&str>, mime: Option<&str>) -> String {
    let ext = ext.unwrap_or("");
    let raw_exts = ["cr2", "cr3", "nef", "arw", "raf", "rw2", "orf", "dng"];
    let psd_exts = ["psd", "psb", "xd", "sketch", "ai"];
    let video_exts = ["mp4", "mov", "mkv", "avi", "webm", "m4v"];
    let audio_exts = ["mp3", "flac", "wav", "aac", "m4a", "ogg", "opus"];
    let font_exts = ["ttf", "otf", "woff", "woff2"];
    let archive_exts = ["zip", "rar", "7z", "tar", "gz", "bz2"];
    let model3d_exts = ["obj", "stl", "gltf", "glb", "fbx"];
    let code_exts = [
        "rs", "go", "py", "js", "jsx", "ts", "tsx", "java", "kt", "swift", "rb", "php", "c", "cc",
        "cpp", "h", "hpp", "css", "html", "scss", "sh", "bash", "zsh", "lua", "sql", "yaml",
        "yml", "toml", "json", "xml", "vue", "svelte",
    ];
    let text_exts = ["txt", "log", "csv", "tsv", "ini", "rst", "conf"];

    if raw_exts.contains(&ext) {
        return "raw".into();
    }
    if psd_exts.contains(&ext) {
        return "psd".into();
    }
    if mime.map(|m| m.starts_with("image/")).unwrap_or(false) {
        return "image".into();
    }
    if ext == "svg" {
        return "svg".into();
    }
    if video_exts.contains(&ext) || mime.map(|m| m.starts_with("video/")).unwrap_or(false) {
        return "video".into();
    }
    if audio_exts.contains(&ext) || mime.map(|m| m.starts_with("audio/")).unwrap_or(false) {
        return "audio".into();
    }
    if font_exts.contains(&ext) {
        return "font".into();
    }
    if archive_exts.contains(&ext) {
        return "archive".into();
    }
    if model3d_exts.contains(&ext) {
        return "model3d".into();
    }
    if matches!(ext, "md" | "markdown" | "mdx") {
        return "markdown".into();
    }
    if ext == "pdf" {
        return "pdf".into();
    }
    if matches!(ext, "doc" | "docx" | "ppt" | "pptx" | "xls" | "xlsx") {
        return "office".into();
    }
    if code_exts.contains(&ext) {
        return "code".into();
    }
    if text_exts.contains(&ext) {
        return "text".into();
    }
    "binary".into()
}

fn systime(t: Option<std::time::SystemTime>) -> Option<i64> {
    t.and_then(|s| s.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
}

#[tauri::command]
pub async fn read_text_file(path: String, max_bytes: Option<u64>) -> AppResult<String> {
    let cap = max_bytes.unwrap_or(MAX_TEXT);
    let meta = fs::metadata(&path)?;
    if meta.len() > cap {
        return Err(AppError::Other(format!(
            "file too large for text preview ({} > {})",
            meta.len(),
            cap
        )));
    }
    Ok(fs::read_to_string(&path)?)
}
