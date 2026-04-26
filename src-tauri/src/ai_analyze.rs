// AI-powered folder analysis. Walks a directory, builds a structured summary
// (counts by type, biggest files, oldest files, naming anomalies), then asks
// the active LLM provider for organization suggestions.
//
// The summary itself is computed without any AI call so it works offline; the
// LLM only adds prose recommendations on top.

use crate::ai::{chat_stream_with, chat_with, ChatMessage};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
pub struct FolderStats {
    pub root: String,
    pub total_files: usize,
    pub total_dirs: usize,
    pub total_bytes: u64,
    pub by_extension: Vec<(String, usize, u64)>,
    pub biggest: Vec<FileBrief>,
    pub oldest: Vec<FileBrief>,
    pub recently_modified: Vec<FileBrief>,
    pub naming_anomalies: Vec<String>,
    pub potential_dupes: usize,
}

#[derive(Serialize, Clone)]
pub struct FileBrief {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: i64,
}

#[tauri::command]
pub async fn analyze_folder_summary(path: String) -> AppResult<FolderStats> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(AppError::Path("not a directory".into()));
    }

    let stats = tokio::task::spawn_blocking(move || compute_stats(&root))
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;
    Ok(stats)
}

fn compute_stats(root: &Path) -> AppResult<FolderStats> {
    let mut total_files = 0usize;
    let mut total_dirs = 0usize;
    let mut total_bytes = 0u64;
    let mut by_ext: HashMap<String, (usize, u64)> = HashMap::new();
    let mut all: Vec<FileBrief> = Vec::new();
    let mut anomalies: Vec<String> = Vec::new();
    let mut size_buckets: HashMap<u64, usize> = HashMap::new();

    let anomaly_patterns = [
        "未命名", "新建", "未标题", "副本", "Untitled", "New Document", " (1)", " (2)", " (3)",
        " - Copy", "_copy", "_final_v2", "_FINAL_FINAL",
    ];

    for entry in WalkDir::new(root)
        .max_depth(8)
        .into_iter()
        .filter_map(|e| e.ok())
        .take(50_000)
    {
        let path = entry.path();
        if entry.file_type().is_dir() {
            total_dirs += 1;
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        total_files += 1;
        let size = meta.len();
        total_bytes += size;
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_else(|| "(无扩展)".into());
        let entry_for_ext = by_ext.entry(ext.clone()).or_insert((0, 0));
        entry_for_ext.0 += 1;
        entry_for_ext.1 += size;

        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        all.push(FileBrief {
            path: path.to_string_lossy().to_string(),
            name: name.clone(),
            size,
            modified,
        });

        if anomaly_patterns.iter().any(|p| name.contains(p)) && anomalies.len() < 50 {
            anomalies.push(name.clone());
        }
        *size_buckets.entry(size).or_insert(0) += 1;
    }

    let mut by_extension: Vec<(String, usize, u64)> = by_ext
        .into_iter()
        .map(|(k, (c, s))| (k, c, s))
        .collect();
    by_extension.sort_by(|a, b| b.2.cmp(&a.2));
    by_extension.truncate(30);

    let mut biggest = all.clone();
    biggest.sort_by(|a, b| b.size.cmp(&a.size));
    biggest.truncate(15);

    let mut oldest = all.clone();
    oldest.sort_by(|a, b| a.modified.cmp(&b.modified));
    oldest.truncate(15);

    let now = Utc::now().timestamp();
    let mut recent: Vec<FileBrief> = all
        .iter()
        .filter(|f| now - f.modified < 86_400 * 7)
        .cloned()
        .collect();
    recent.sort_by(|a, b| b.modified.cmp(&a.modified));
    recent.truncate(15);

    let potential_dupes = size_buckets.values().filter(|c| **c >= 2).map(|c| **c).sum();

    Ok(FolderStats {
        root: root.to_string_lossy().to_string(),
        total_files,
        total_dirs,
        total_bytes,
        by_extension,
        biggest,
        oldest,
        recently_modified: recent,
        naming_anomalies: anomalies,
        potential_dupes,
    })
}

fn stats_to_prompt(s: &FolderStats) -> String {
    let mut buf = String::new();
    buf.push_str("以下是用户某个文件夹的真实统计数据。请基于这些数据，用简体中文给出 5 条具体可执行的整理建议（按重要性排序），并给出一段总体评价。\n\n");
    buf.push_str(&format!("根目录：{}\n", s.root));
    buf.push_str(&format!(
        "文件数：{}，子目录数：{}，总大小：{:.2} MB\n\n",
        s.total_files,
        s.total_dirs,
        s.total_bytes as f64 / 1_048_576.0
    ));

    buf.push_str("按扩展名分布（前 15）：\n");
    for (ext, count, bytes) in s.by_extension.iter().take(15) {
        buf.push_str(&format!(
            "  .{:<10} {} 个，{:.2} MB\n",
            ext,
            count,
            *bytes as f64 / 1_048_576.0
        ));
    }
    buf.push_str("\n最大的文件（前 10）：\n");
    for f in s.biggest.iter().take(10) {
        buf.push_str(&format!(
            "  {:.2} MB  {}\n",
            f.size as f64 / 1_048_576.0,
            f.name
        ));
    }
    buf.push_str("\n最久未修改的文件（前 10）：\n");
    for f in s.oldest.iter().take(10) {
        buf.push_str(&format!("  {}\n", f.name));
    }

    if !s.naming_anomalies.is_empty() {
        buf.push_str("\n命名异常样本：\n");
        for n in s.naming_anomalies.iter().take(15) {
            buf.push_str(&format!("  {}\n", n));
        }
    }
    if s.potential_dupes > 0 {
        buf.push_str(&format!(
            "\n相同大小的文件数（疑似重复，需 SHA-256 二次确认）：约 {}\n",
            s.potential_dupes
        ));
    }
    buf.push_str("\n请输出 Markdown 格式：先一段「整体评价」，再一个 5 项的「建议清单」。\n");
    buf
}

#[derive(Serialize)]
pub struct AnalyzeResult {
    pub stats: FolderStats,
    pub advice: String,
    pub session_id: String,
}

#[tauri::command]
pub async fn analyze_folder(
    state: State<'_, AppState>,
    path: String,
    provider_id: Option<String>,
) -> AppResult<AnalyzeResult> {
    let stats = analyze_folder_summary(path.clone()).await?;
    let prompt = stats_to_prompt(&stats);

    let provider = if let Some(id) = provider_id {
        let conn = state.db.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id,name,kind,base_url,api_key,model,temperature,max_tokens,top_p,extra,is_active,created_at,updated_at FROM ai_providers WHERE id=?1",
        )?;
        stmt.query_row([id], |row| {
            let extra: String = row.get(9)?;
            Ok(crate::ai::AIProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                base_url: row.get(3)?,
                api_key: row.get(4)?,
                model: row.get(5)?,
                temperature: row.get(6)?,
                max_tokens: row.get::<_, i64>(7)? as u32,
                top_p: row.get(8)?,
                extra: serde_json::from_str(&extra).unwrap_or(serde_json::Value::Null),
                is_active: row.get::<_, i32>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| AppError::Other(e.to_string()))?
    } else {
        get_active(&state)?
    };

    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: "你是 FileMate AI 的文件管理助手。回答必须基于用户提供的真实统计数据，不要编造。建议要具体、可执行。".into(),
        },
        ChatMessage { role: "user".into(), content: prompt },
    ];
    let reply = chat_with(&provider, &messages).await?;
    Ok(AnalyzeResult {
        stats,
        advice: reply.content,
        session_id: Uuid::new_v4().to_string(),
    })
}

#[tauri::command]
pub async fn analyze_folder_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    path: String,
    provider_id: Option<String>,
) -> AppResult<FolderStats> {
    let stats = analyze_folder_summary(path).await?;
    let prompt = stats_to_prompt(&stats);
    let provider = if let Some(id) = provider_id {
        let conn = state.db.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id,name,kind,base_url,api_key,model,temperature,max_tokens,top_p,extra,is_active,created_at,updated_at FROM ai_providers WHERE id=?1",
        )?;
        stmt.query_row([id], |row| {
            let extra: String = row.get(9)?;
            Ok(crate::ai::AIProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                base_url: row.get(3)?,
                api_key: row.get(4)?,
                model: row.get(5)?,
                temperature: row.get(6)?,
                max_tokens: row.get::<_, i64>(7)? as u32,
                top_p: row.get(8)?,
                extra: serde_json::from_str(&extra).unwrap_or(serde_json::Value::Null),
                is_active: row.get::<_, i32>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| AppError::Other(e.to_string()))?
    } else {
        get_active(&state)?
    };
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: "你是 FileMate AI 的文件管理助手。回答基于真实统计数据。".into(),
        },
        ChatMessage { role: "user".into(), content: prompt },
    ];
    chat_stream_with(&provider, &messages, &app, &session_id).await?;
    Ok(stats)
}

fn get_active(state: &AppState) -> AppResult<crate::ai::AIProvider> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT id,name,kind,base_url,api_key,model,temperature,max_tokens,top_p,extra,is_active,created_at,updated_at FROM ai_providers WHERE is_active=1 LIMIT 1",
    )?;
    stmt.query_row([], |row| {
        let extra: String = row.get(9)?;
        Ok(crate::ai::AIProvider {
            id: row.get(0)?,
            name: row.get(1)?,
            kind: row.get(2)?,
            base_url: row.get(3)?,
            api_key: row.get(4)?,
            model: row.get(5)?,
            temperature: row.get(6)?,
            max_tokens: row.get::<_, i64>(7)? as u32,
            top_p: row.get(8)?,
            extra: serde_json::from_str(&extra).unwrap_or(serde_json::Value::Null),
            is_active: row.get::<_, i32>(10)? != 0,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })
    .map_err(|_| AppError::Other("没有激活的 AI provider".into()))
}
