// Server-side preview helpers: detect file kind, return text content for code
// & markdown, basic image dimensions, and EXIF tags. Heavy formats (PDF/PSD)
// are loaded by the frontend webview directly via Tauri's asset protocol.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
pub struct PreviewMeta {
    pub kind: String, // "image" | "video" | "audio" | "text" | "code" | "markdown" | "pdf" | "archive" | "binary" | "unknown"
    pub mime: Option<String>,
    pub size: u64,
    pub text: Option<String>,
    pub language: Option<String>, // for code highlight
}

const MAX_TEXT: u64 = 1024 * 1024;

#[tauri::command]
pub async fn preview_file(path: String) -> AppResult<PreviewMeta> {
    let p = Path::new(&path);
    let meta = fs::metadata(p)?;
    let mime = mime_guess::from_path(p).first().map(|m| m.to_string());
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let kind = if mime
        .as_deref()
        .map(|m| m.starts_with("image/"))
        .unwrap_or(false)
    {
        "image"
    } else if mime
        .as_deref()
        .map(|m| m.starts_with("video/"))
        .unwrap_or(false)
    {
        "video"
    } else if mime
        .as_deref()
        .map(|m| m.starts_with("audio/"))
        .unwrap_or(false)
    {
        "audio"
    } else if matches!(ext.as_str(), "md" | "markdown" | "mdx") {
        "markdown"
    } else if matches!(ext.as_str(), "pdf") {
        "pdf"
    } else if matches!(
        ext.as_str(),
        "rs" | "go"
            | "py"
            | "js"
            | "jsx"
            | "ts"
            | "tsx"
            | "java"
            | "kt"
            | "swift"
            | "rb"
            | "php"
            | "c"
            | "cc"
            | "cpp"
            | "h"
            | "hpp"
            | "css"
            | "html"
            | "scss"
            | "sh"
            | "bash"
            | "zsh"
            | "lua"
            | "sql"
            | "yaml"
            | "yml"
            | "toml"
            | "json"
            | "xml"
    ) {
        "code"
    } else if matches!(
        ext.as_str(),
        "txt" | "log" | "csv" | "tsv" | "ini" | "rst"
    ) {
        "text"
    } else if matches!(ext.as_str(), "zip" | "rar" | "tar" | "gz" | "7z") {
        "archive"
    } else {
        "binary"
    };

    let mut text = None;
    if matches!(kind, "text" | "code" | "markdown") && meta.len() <= MAX_TEXT {
        if let Ok(content) = fs::read_to_string(p) {
            text = Some(content);
        }
    }

    let language = if kind == "code" { Some(ext.clone()) } else { None };

    Ok(PreviewMeta {
        kind: kind.to_string(),
        mime,
        size: meta.len(),
        text,
        language,
    })
}

#[tauri::command]
pub async fn read_text_file(path: String, max_bytes: Option<u64>) -> AppResult<String> {
    let cap = max_bytes.unwrap_or(MAX_TEXT);
    let meta = fs::metadata(&path)?;
    if meta.len() > cap {
        return Err(AppError::Other(format!(
            "file too large for text preview ({} bytes > {})",
            meta.len(),
            cap
        )));
    }
    Ok(fs::read_to_string(&path)?)
}
