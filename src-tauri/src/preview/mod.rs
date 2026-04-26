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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    // ---- detect_kind ----------------------------------------------------

    #[test]
    fn detects_image_by_extension_and_mime() {
        assert_eq!(detect_kind(Some("jpg"), Some("image/jpeg")), "image");
        assert_eq!(detect_kind(Some("png"), Some("image/png")), "image");
        assert_eq!(detect_kind(Some("webp"), Some("image/webp")), "image");
        assert_eq!(detect_kind(Some("gif"), Some("image/gif")), "image");
        assert_eq!(detect_kind(Some("heic"), Some("image/heic")), "image");
        // mime alone is enough
        assert_eq!(detect_kind(Some("xyz"), Some("image/x-foo")), "image");
    }

    #[test]
    fn detects_video_audio_pdf_markdown() {
        assert_eq!(detect_kind(Some("mp4"), Some("video/mp4")), "video");
        assert_eq!(detect_kind(Some("mov"), None), "video");
        assert_eq!(detect_kind(Some("mkv"), None), "video");
        assert_eq!(detect_kind(Some("mp3"), None), "audio");
        assert_eq!(detect_kind(Some("flac"), None), "audio");
        assert_eq!(detect_kind(Some("pdf"), None), "pdf");
        assert_eq!(detect_kind(Some("md"), None), "markdown");
        assert_eq!(detect_kind(Some("mdx"), None), "markdown");
        assert_eq!(detect_kind(Some("svg"), Some("image/svg+xml")), "svg");
    }

    #[test]
    fn detects_special_categories() {
        // RAW takes priority over generic image MIME so the frontend can
        // surface 'needs decoder' messaging instead of broken <img>.
        assert_eq!(detect_kind(Some("cr2"), Some("image/x-canon-cr2")), "raw");
        assert_eq!(detect_kind(Some("nef"), Some("image/x-nikon-nef")), "raw");
        assert_eq!(detect_kind(Some("psd"), None), "psd");
        assert_eq!(detect_kind(Some("ttf"), None), "font");
        assert_eq!(detect_kind(Some("otf"), None), "font");
        assert_eq!(detect_kind(Some("zip"), None), "archive");
        assert_eq!(detect_kind(Some("obj"), None), "model3d");
        assert_eq!(detect_kind(Some("docx"), None), "office");
    }

    #[test]
    fn detects_code_languages() {
        for ext in [
            "rs", "ts", "tsx", "js", "py", "go", "java", "kt", "swift", "cpp", "rb", "php", "html",
            "css", "json", "yaml", "toml", "vue", "svelte",
        ] {
            assert_eq!(detect_kind(Some(ext), None), "code", "ext={ext}");
        }
    }

    #[test]
    fn detects_plain_text() {
        for ext in ["txt", "log", "csv", "tsv", "ini", "rst", "conf"] {
            assert_eq!(detect_kind(Some(ext), None), "text", "ext={ext}");
        }
    }

    #[test]
    fn falls_back_to_binary() {
        assert_eq!(detect_kind(None, None), "binary");
        assert_eq!(detect_kind(Some(""), None), "binary");
        assert_eq!(detect_kind(Some("randomext"), None), "binary");
    }

    // ---- preview_file_sync ---------------------------------------------

    fn write_fixture(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("filemate-preview-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(bytes).unwrap();
        path
    }

    #[test]
    fn preview_text_file_returns_content() {
        let p = write_fixture(
            "hello.txt",
            b"hello world\nthis is a fixture\n",
        );
        let m = preview_file_sync(p.to_string_lossy().as_ref()).unwrap();
        assert_eq!(m.kind, "text");
        assert!(m.text.unwrap().contains("hello world"));
        assert!(m.size > 0);
    }

    #[test]
    fn preview_markdown_file_includes_text() {
        let p = write_fixture(
            "doc.md",
            b"# Title\n\nSome **bold** text.\n",
        );
        let m = preview_file_sync(p.to_string_lossy().as_ref()).unwrap();
        assert_eq!(m.kind, "markdown");
        assert!(m.text.as_deref().unwrap().contains("# Title"));
    }

    #[test]
    fn preview_code_file_attaches_language() {
        let p = write_fixture("snippet.rs", b"fn main() { println!(\"hi\"); }\n");
        let m = preview_file_sync(p.to_string_lossy().as_ref()).unwrap();
        assert_eq!(m.kind, "code");
        assert_eq!(m.language.as_deref(), Some("rust"));
    }

    #[test]
    fn preview_image_extracts_dimensions_and_histogram() {
        // 4×4 red PNG via the `image` crate
        let img = image::ImageBuffer::from_fn(4u32, 4u32, |_, _| {
            image::Rgb([200u8, 30, 30])
        });
        let mut bytes: Vec<u8> = Vec::new();
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        let p = write_fixture("red.png", &bytes);

        let m = preview_file_sync(p.to_string_lossy().as_ref()).unwrap();
        assert_eq!(m.kind, "image");
        match m.extras {
            FormatExtras::Image(im) => {
                assert_eq!(im.width, 4);
                assert_eq!(im.height, 4);
                assert_eq!(im.histogram.r.len(), 256);
                assert_eq!(im.histogram.g.len(), 256);
                assert_eq!(im.histogram.b.len(), 256);
                let total_r: u32 = im.histogram.r.iter().sum();
                // 16 pixels, all red — exactly 16 entries should be in the
                // R histogram (and skewed toward the brighter buckets).
                assert_eq!(total_r, 16);
            }
            other => panic!("expected Image extras, got {:?}", std::any::type_name_of_val(&other)),
        }
    }

    #[test]
    fn preview_unknown_binary_falls_back() {
        let p = write_fixture("blob.dat", &[0u8; 64]);
        let m = preview_file_sync(p.to_string_lossy().as_ref()).unwrap();
        assert_eq!(m.kind, "binary");
        assert!(m.text.is_none());
    }

    #[test]
    fn preview_pdf_kind_without_text() {
        // Minimal "PDF" — content is not parsed, only the kind detection
        // matters for the kind field.
        let p = write_fixture("doc.pdf", b"%PDF-1.4\n%fake\n");
        let m = preview_file_sync(p.to_string_lossy().as_ref()).unwrap();
        assert_eq!(m.kind, "pdf");
        // We do not extract text from PDFs server-side; frontend uses iframe.
        assert!(m.text.is_none());
    }

    #[test]
    fn preview_svg_keeps_xml_text() {
        let xml = b"<svg xmlns=\"http://www.w3.org/2000/svg\"><circle r=\"5\"/></svg>";
        let p = write_fixture("vector.svg", xml);
        let m = preview_file_sync(p.to_string_lossy().as_ref()).unwrap();
        assert_eq!(m.kind, "svg");
        assert!(m.text.as_deref().unwrap().contains("<svg"));
    }

    #[test]
    fn preview_missing_file_errors() {
        let res = preview_file_sync("/definitely/does/not/exist/__nope__");
        assert!(res.is_err());
    }
}
