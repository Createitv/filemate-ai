// Zip archive operations: list contents, extract, create. The PRD also calls
// out RAR/7z which require non-pure-Rust dependencies; we ship Zip natively
// and shell out to system extractors for the others if the user has them.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

#[derive(Serialize)]
pub struct ArchiveEntry {
    pub name: String,
    pub size: u64,
    pub compressed_size: u64,
    pub is_dir: bool,
    pub modified: Option<i64>,
}

#[tauri::command]
pub async fn list_zip(path: String) -> AppResult<Vec<ArchiveEntry>> {
    let f = fs::File::open(&path)?;
    let mut zip = zip::ZipArchive::new(f).map_err(|e| AppError::Other(e.to_string()))?;
    let mut out = Vec::new();
    for i in 0..zip.len() {
        let file = zip.by_index(i).map_err(|e| AppError::Other(e.to_string()))?;
        out.push(ArchiveEntry {
            name: file.name().to_string(),
            size: file.size(),
            compressed_size: file.compressed_size(),
            is_dir: file.is_dir(),
            modified: None,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn extract_zip(zip_path: String, dest: String) -> AppResult<usize> {
    let f = fs::File::open(&zip_path)?;
    let mut zip = zip::ZipArchive::new(f).map_err(|e| AppError::Other(e.to_string()))?;
    let dest = PathBuf::from(dest);
    fs::create_dir_all(&dest)?;
    let mut count = 0;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|e| AppError::Other(e.to_string()))?;
        let outpath = match file.enclosed_name() {
            Some(p) => dest.join(p),
            None => continue,
        };
        if file.is_dir() {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut out = fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut out)?;
            count += 1;
        }
    }
    Ok(count)
}

#[tauri::command]
pub async fn create_zip(sources: Vec<String>, dest: String) -> AppResult<()> {
    let f = fs::File::create(&dest)?;
    let mut writer = zip::ZipWriter::new(f);
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    for src in sources {
        let path = Path::new(&src);
        if path.is_dir() {
            for entry in walkdir::WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
                let p = entry.path();
                let rel = p.strip_prefix(path.parent().unwrap_or(path)).unwrap_or(p);
                let name = rel.to_string_lossy();
                if entry.file_type().is_dir() {
                    writer
                        .add_directory(name.as_ref(), opts)
                        .map_err(|e| AppError::Other(e.to_string()))?;
                } else if entry.file_type().is_file() {
                    writer
                        .start_file(name.as_ref(), opts)
                        .map_err(|e| AppError::Other(e.to_string()))?;
                    let bytes = fs::read(p)?;
                    writer.write_all(&bytes)?;
                }
            }
        } else if path.is_file() {
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            writer
                .start_file(name, opts)
                .map_err(|e| AppError::Other(e.to_string()))?;
            let bytes = fs::read(path)?;
            writer.write_all(&bytes)?;
        }
    }

    writer.finish().map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}
