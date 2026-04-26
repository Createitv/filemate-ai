// Ollama HTTP client (talks to local http://127.0.0.1:11434 by default).
// Provides:
//   - chat completion (non-stream + stream events to frontend)
//   - text embedding (for vector search via SQLite blob storage)
//   - intent parsing: turn a Chinese / English query into structured search
//
// Set OLLAMA_HOST env to override base URL. No third-party SDK; thin reqwest.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const DEFAULT_HOST: &str = "http://127.0.0.1:11434";
const DEFAULT_CHAT_MODEL: &str = "llama3.2";
const DEFAULT_EMBED_MODEL: &str = "nomic-embed-text";

fn host() -> String {
    std::env::var("OLLAMA_HOST").unwrap_or_else(|_| DEFAULT_HOST.to_string())
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .expect("reqwest client")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize)]
struct ChatReq<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
}

#[derive(Deserialize)]
struct ChatResp {
    message: ChatMessage,
}

#[tauri::command]
pub async fn ai_chat(
    messages: Vec<ChatMessage>,
    model: Option<String>,
) -> AppResult<ChatMessage> {
    let model = model.unwrap_or_else(|| DEFAULT_CHAT_MODEL.to_string());
    let body = ChatReq {
        model: &model,
        messages: &messages,
        stream: false,
    };
    let res = client()
        .post(format!("{}/api/chat", host()))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;
    if !res.status().is_success() {
        return Err(AppError::Other(format!(
            "ollama {}: {}",
            res.status(),
            res.text().await.unwrap_or_default()
        )));
    }
    let resp: ChatResp = res.json().await.map_err(|e| AppError::Other(e.to_string()))?;
    Ok(resp.message)
}

#[tauri::command]
pub async fn ai_chat_stream(
    app: AppHandle,
    session_id: String,
    messages: Vec<ChatMessage>,
    model: Option<String>,
) -> AppResult<()> {
    use futures_util::StreamExt;
    let model = model.unwrap_or_else(|| DEFAULT_CHAT_MODEL.to_string());
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true
    });
    let res = client()
        .post(format!("{}/api/chat", host()))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| AppError::Other(e.to_string()))?;
        for line in bytes.split(|&b| b == b'\n') {
            if line.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_slice::<serde_json::Value>(line) {
                let _ = app.emit(
                    "ai:chat_chunk",
                    serde_json::json!({"session_id": session_id, "data": v}),
                );
                if v.get("done").and_then(|d| d.as_bool()).unwrap_or(false) {
                    return Ok(());
                }
            }
        }
    }
    Ok(())
}

#[derive(Serialize)]
struct EmbedReq<'a> {
    model: &'a str,
    prompt: &'a str,
}

#[derive(Deserialize)]
struct EmbedResp {
    embedding: Vec<f32>,
}

#[tauri::command]
pub async fn ai_embed(text: String, model: Option<String>) -> AppResult<Vec<f32>> {
    let model = model.unwrap_or_else(|| DEFAULT_EMBED_MODEL.to_string());
    let body = EmbedReq {
        model: &model,
        prompt: &text,
    };
    let res = client()
        .post(format!("{}/api/embeddings", host()))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;
    if !res.status().is_success() {
        return Err(AppError::Other(format!("ollama {}", res.status())));
    }
    let resp: EmbedResp = res.json().await.map_err(|e| AppError::Other(e.to_string()))?;
    Ok(resp.embedding)
}

#[derive(Serialize, Deserialize)]
pub struct ParsedIntent {
    pub keywords: Vec<String>,
    pub extensions: Vec<String>,
    pub time_after: Option<i64>,
    pub time_before: Option<i64>,
    pub size_min: Option<u64>,
    pub size_max: Option<u64>,
    pub raw: String,
}

#[tauri::command]
pub async fn ai_parse_intent(query: String) -> AppResult<ParsedIntent> {
    // Heuristic local parser — works without LLM. If Ollama is reachable we
    // also let it produce a JSON refinement; on failure we keep the heuristic.
    let mut intent = parse_heuristic(&query);

    let prompt = format!(
        "Extract a JSON object from the user's file-search query. \
        Schema: {{\"keywords\":[],\"extensions\":[],\"days_back\":int|null,\"size_min\":int|null,\"size_max\":int|null}}.\n\
        Reply ONLY with JSON. Query: {query}"
    );
    let messages = vec![ChatMessage {
        role: "user".into(),
        content: prompt,
    }];
    if let Ok(msg) = ai_chat(messages, None).await {
        if let Some(start) = msg.content.find('{') {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&msg.content[start..]) {
                if let Some(arr) = v.get("keywords").and_then(|x| x.as_array()) {
                    intent.keywords = arr
                        .iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect();
                }
                if let Some(arr) = v.get("extensions").and_then(|x| x.as_array()) {
                    intent.extensions = arr
                        .iter()
                        .filter_map(|x| x.as_str().map(|s| s.trim_start_matches('.').to_string()))
                        .collect();
                }
                if let Some(d) = v.get("days_back").and_then(|x| x.as_i64()) {
                    intent.time_after = Some(chrono::Utc::now().timestamp() - d * 86400);
                }
            }
        }
    }
    Ok(intent)
}

fn parse_heuristic(q: &str) -> ParsedIntent {
    let lower = q.to_lowercase();
    let mut extensions = Vec::new();
    for &ext in &[
        "pdf", "docx", "doc", "xlsx", "pptx", "ppt", "md", "txt", "png", "jpg", "jpeg", "mp4",
        "mov", "zip", "rar", "rs", "ts", "tsx", "py",
    ] {
        if lower.contains(ext) {
            extensions.push(ext.to_string());
        }
    }
    let mut time_after = None;
    if lower.contains("今天") || lower.contains("today") {
        time_after = Some(chrono::Utc::now().timestamp() - 86_400);
    } else if lower.contains("昨天") || lower.contains("yesterday") {
        time_after = Some(chrono::Utc::now().timestamp() - 86_400 * 2);
    } else if lower.contains("上周") || lower.contains("last week") {
        time_after = Some(chrono::Utc::now().timestamp() - 86_400 * 7);
    } else if lower.contains("上月") || lower.contains("last month") {
        time_after = Some(chrono::Utc::now().timestamp() - 86_400 * 30);
    }
    let keywords: Vec<String> = q
        .split_whitespace()
        .filter(|w| w.len() >= 2)
        .map(|w| w.to_string())
        .collect();
    ParsedIntent {
        keywords,
        extensions,
        time_after,
        time_before: None,
        size_min: None,
        size_max: None,
        raw: q.to_string(),
    }
}

#[tauri::command]
pub async fn ai_health() -> AppResult<serde_json::Value> {
    let res = client()
        .get(format!("{}/api/tags", host()))
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(serde_json::json!({
        "ok": res.status().is_success(),
        "host": host(),
        "status": res.status().as_u16(),
    }))
}
