// Tantivy-backed search: filename + textual content for files we can extract
// (txt/md/code/json/csv/html/xml). Heavy formats (PDF, Office) need external
// extractors; we index filename+path so they remain searchable.
//
// The index lives at <app_data>/index/. Frontend kicks off rebuilds via
// `index_directory`; results stream back via `search_index`.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tantivy::collector::TopDocs;
use tantivy::directory::MmapDirectory;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{doc, Index as TIndex, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument};
use tauri::State;
use walkdir::WalkDir;

const TEXT_EXTS: &[&str] = &[
    "txt", "md", "mdx", "rst", "log", "json", "yaml", "yml", "toml", "ini", "csv", "tsv", "xml",
    "html", "htm", "css", "scss", "js", "jsx", "ts", "tsx", "rs", "go", "py", "java", "c", "cc",
    "cpp", "h", "hpp", "rb", "php", "sh", "bash", "zsh", "swift", "kt", "lua", "sql",
];

const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024; // 2 MB cap per file

pub struct Index {
    pub index: TIndex,
    pub reader: IndexReader,
    pub schema: Schema,
    pub f_path: Field,
    pub f_name: Field,
    pub f_ext: Field,
    pub f_body: Field,
    pub f_size: Field,
    pub f_modified: Field,
}

impl Index {
    pub fn open(dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(dir)?;
        let mut sb = Schema::builder();
        let f_path = sb.add_text_field("path", STRING | STORED);
        let f_name = sb.add_text_field("name", TEXT | STORED);
        let f_ext = sb.add_text_field("ext", STRING | STORED);
        let f_body = sb.add_text_field("body", TEXT);
        let f_size = sb.add_u64_field("size", STORED | INDEXED);
        let f_modified = sb.add_i64_field("modified", STORED | INDEXED);
        let schema = sb.build();

        let mmap = MmapDirectory::open(dir).map_err(|e| AppError::Other(e.to_string()))?;
        let index = TIndex::open_or_create(mmap, schema.clone())
            .map_err(|e| AppError::Other(e.to_string()))?;
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e: tantivy::TantivyError| AppError::Other(e.to_string()))?;
        Ok(Self {
            index,
            reader,
            schema,
            f_path,
            f_name,
            f_ext,
            f_body,
            f_size,
            f_modified,
        })
    }

    pub fn writer(&self) -> AppResult<IndexWriter> {
        self.index
            .writer(64 * 1024 * 1024)
            .map_err(|e| AppError::Other(e.to_string()))
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SearchHit {
    pub path: String,
    pub name: String,
    pub ext: Option<String>,
    pub size: u64,
    pub modified: i64,
    pub score: f32,
}

#[tauri::command]
pub async fn index_directory(
    state: State<'_, AppState>,
    path: String,
    max_files: Option<usize>,
) -> AppResult<usize> {
    let idx = Arc::clone(&state.index);
    let max = max_files.unwrap_or(50_000);

    let count = tokio::task::spawn_blocking(move || -> AppResult<usize> {
        let mut writer = idx.writer()?;
        let term = Term::from_field_text(idx.f_path, &path);
        writer.delete_term(term);

        let mut count = 0usize;
        for entry in WalkDir::new(&path)
            .max_depth(20)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
            .take(max)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let p = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            let ext = p
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            let size = meta.len();
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            let body = if size > 0 && size <= MAX_TEXT_BYTES && TEXT_EXTS.contains(&ext.as_str()) {
                std::fs::read_to_string(p).unwrap_or_default()
            } else {
                String::new()
            };

            writer
                .add_document(doc!(
                    idx.f_path => p.to_string_lossy().to_string(),
                    idx.f_name => name,
                    idx.f_ext  => ext,
                    idx.f_body => body,
                    idx.f_size => size,
                    idx.f_modified => modified,
                ))
                .map_err(|e| AppError::Other(e.to_string()))?;
            count += 1;
        }
        writer.commit().map_err(|e| AppError::Other(e.to_string()))?;
        Ok(count)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;
    Ok(count)
}

#[tauri::command]
pub async fn remove_path_from_index(state: State<'_, AppState>, path: String) -> AppResult<()> {
    let idx = Arc::clone(&state.index);
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        let mut w = idx.writer()?;
        let term = Term::from_field_text(idx.f_path, &path);
        w.delete_term(term);
        w.commit().map_err(|e| AppError::Other(e.to_string()))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;
    Ok(())
}

#[tauri::command]
pub async fn search_index(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> AppResult<Vec<SearchHit>> {
    let idx = Arc::clone(&state.index);
    let limit = limit.unwrap_or(100).min(1000);
    let hits = tokio::task::spawn_blocking(move || -> AppResult<Vec<SearchHit>> {
        let searcher = idx.reader.searcher();
        let parser = QueryParser::for_index(&idx.index, vec![idx.f_name, idx.f_body]);
        let q = parser
            .parse_query(&query)
            .map_err(|e| AppError::Other(e.to_string()))?;
        let docs = searcher
            .search(&q, &TopDocs::with_limit(limit))
            .map_err(|e| AppError::Other(e.to_string()))?;
        let mut out = Vec::with_capacity(docs.len());
        for (score, addr) in docs {
            let d: TantivyDocument = searcher
                .doc(addr)
                .map_err(|e| AppError::Other(e.to_string()))?;
            let path = first_text(&d, idx.f_path).unwrap_or_default();
            let name = first_text(&d, idx.f_name).unwrap_or_default();
            let ext = first_text(&d, idx.f_ext);
            let size = first_u64(&d, idx.f_size).unwrap_or(0);
            let modified = first_i64(&d, idx.f_modified).unwrap_or(0);
            out.push(SearchHit {
                path,
                name,
                ext,
                size,
                modified,
                score,
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;
    Ok(hits)
}

#[tauri::command]
pub async fn search_filenames(
    path: String,
    pattern: String,
    limit: Option<usize>,
) -> AppResult<Vec<crate::fs::DirEntryInfo>> {
    let limit = limit.unwrap_or(500);
    let pattern = pattern.to_lowercase();
    let hits = tokio::task::spawn_blocking(move || -> AppResult<Vec<crate::fs::DirEntryInfo>> {
        let mut out = Vec::new();
        for entry in WalkDir::new(PathBuf::from(&path))
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if !name.contains(&pattern) {
                continue;
            }
            if let Some(info) = crate::fs::entry_from_path(entry.path()) {
                out.push(info);
                if out.len() >= limit {
                    break;
                }
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;
    Ok(hits)
}

fn first_text(d: &TantivyDocument, f: Field) -> Option<String> {
    d.get_first(f)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
}

fn first_u64(d: &TantivyDocument, f: Field) -> Option<u64> {
    d.get_first(f).and_then(|v| v.as_u64())
}

fn first_i64(d: &TantivyDocument, f: Field) -> Option<i64> {
    d.get_first(f).and_then(|v| v.as_i64())
}
