// AI orchestration. Routes chat / embeddings / streaming through a registered
// provider (OpenAI-compatible, Anthropic, or local Ollama). Providers are
// stored in the `ai_providers` SQLite table; one is marked `is_active`.
//
// OpenAI-compatible providers cover most modern APIs (DeepSeek, OpenAI,
// Moonshot, Qwen DashScope-OpenAI, Together, Groq, OpenRouter, Mistral, etc.)
// — they all expose `POST /v1/chat/completions` with the same body shape.
// Anthropic uses its own /v1/messages schema; Ollama uses /api/chat.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use chrono::Utc;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AIProvider {
    pub id: String,
    pub name: String,
    pub kind: String, // "openai" | "anthropic" | "ollama"
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub top_p: f32,
    pub extra: Value,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize)]
pub struct ProviderInput {
    pub id: Option<String>,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    pub model: String,
    #[serde(default = "default_temp")]
    pub temperature: f32,
    #[serde(default = "default_max")]
    pub max_tokens: u32,
    #[serde(default = "default_top_p")]
    pub top_p: f32,
    #[serde(default)]
    pub extra: Value,
}
fn default_temp() -> f32 { 0.7 }
fn default_max() -> u32 { 2048 }
fn default_top_p() -> f32 { 1.0 }

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .expect("reqwest")
}

// ---------- CRUD ----------

#[tauri::command]
pub async fn ai_provider_save(
    state: State<'_, AppState>,
    payload: ProviderInput,
) -> AppResult<String> {
    let conn = state.db.conn.lock();
    let id = payload.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO ai_providers
            (id,name,kind,base_url,api_key,model,temperature,max_tokens,top_p,extra,is_active,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,
                 COALESCE((SELECT is_active FROM ai_providers WHERE id=?1), 0),
                 COALESCE((SELECT created_at FROM ai_providers WHERE id=?1), ?11), ?11)
         ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, kind=excluded.kind, base_url=excluded.base_url,
            api_key=excluded.api_key, model=excluded.model,
            temperature=excluded.temperature, max_tokens=excluded.max_tokens,
            top_p=excluded.top_p, extra=excluded.extra, updated_at=excluded.updated_at",
        rusqlite::params![
            id,
            payload.name,
            payload.kind,
            payload.base_url,
            payload.api_key,
            payload.model,
            payload.temperature,
            payload.max_tokens,
            payload.top_p,
            payload.extra.to_string(),
            now
        ],
    )?;
    Ok(id)
}

#[tauri::command]
pub async fn ai_provider_list(state: State<'_, AppState>) -> AppResult<Vec<AIProvider>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT id,name,kind,base_url,api_key,model,temperature,max_tokens,top_p,extra,is_active,created_at,updated_at
         FROM ai_providers ORDER BY is_active DESC, updated_at DESC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            let extra: String = row.get(9)?;
            Ok(AIProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                base_url: row.get(3)?,
                api_key: row.get(4)?,
                model: row.get(5)?,
                temperature: row.get(6)?,
                max_tokens: row.get::<_, i64>(7)? as u32,
                top_p: row.get(8)?,
                extra: serde_json::from_str(&extra).unwrap_or(Value::Null),
                is_active: row.get::<_, i32>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn ai_provider_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state
        .db
        .conn
        .lock()
        .execute("DELETE FROM ai_providers WHERE id = ?1", [id])?;
    Ok(())
}

#[tauri::command]
pub async fn ai_provider_set_active(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.conn.lock();
    conn.execute("UPDATE ai_providers SET is_active = 0", [])?;
    conn.execute("UPDATE ai_providers SET is_active = 1 WHERE id = ?1", [id])?;
    Ok(())
}

fn active_provider(state: &AppState) -> AppResult<AIProvider> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT id,name,kind,base_url,api_key,model,temperature,max_tokens,top_p,extra,is_active,created_at,updated_at
         FROM ai_providers WHERE is_active = 1 LIMIT 1",
    )?;
    let p = stmt
        .query_row([], |row| {
            let extra: String = row.get(9)?;
            Ok(AIProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                base_url: row.get(3)?,
                api_key: row.get(4)?,
                model: row.get(5)?,
                temperature: row.get(6)?,
                max_tokens: row.get::<_, i64>(7)? as u32,
                top_p: row.get(8)?,
                extra: serde_json::from_str(&extra).unwrap_or(Value::Null),
                is_active: row.get::<_, i32>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|_| AppError::Other("没有激活的 AI provider，请先在「设置 → AI」中添加并激活一个".into()))?;
    Ok(p)
}

#[tauri::command]
pub async fn ai_provider_test(payload: ProviderInput) -> AppResult<Value> {
    let provider = AIProvider {
        id: "test".into(),
        name: payload.name,
        kind: payload.kind,
        base_url: payload.base_url,
        api_key: payload.api_key,
        model: payload.model,
        temperature: payload.temperature,
        max_tokens: payload.max_tokens,
        top_p: payload.top_p,
        extra: payload.extra,
        is_active: false,
        created_at: 0,
        updated_at: 0,
    };
    let messages = vec![ChatMessage {
        role: "user".into(),
        content: "回复'OK'即可。Reply 'OK' only.".into(),
    }];
    let res = chat_with(&provider, &messages).await?;
    Ok(json!({"ok": true, "reply": res.content}))
}

// ---------- chat ----------

#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AppState>,
    messages: Vec<ChatMessage>,
    provider_id: Option<String>,
) -> AppResult<ChatMessage> {
    let provider = if let Some(id) = provider_id {
        let conn = state.db.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id,name,kind,base_url,api_key,model,temperature,max_tokens,top_p,extra,is_active,created_at,updated_at FROM ai_providers WHERE id=?1",
        )?;
        stmt.query_row([id], |row| {
            let extra: String = row.get(9)?;
            Ok(AIProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                base_url: row.get(3)?,
                api_key: row.get(4)?,
                model: row.get(5)?,
                temperature: row.get(6)?,
                max_tokens: row.get::<_, i64>(7)? as u32,
                top_p: row.get(8)?,
                extra: serde_json::from_str(&extra).unwrap_or(Value::Null),
                is_active: row.get::<_, i32>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| AppError::Other(e.to_string()))?
    } else {
        active_provider(&state)?
    };
    chat_with(&provider, &messages).await
}

#[tauri::command]
pub async fn ai_chat_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    messages: Vec<ChatMessage>,
    provider_id: Option<String>,
) -> AppResult<()> {
    let provider = if let Some(id) = provider_id.clone() {
        let conn = state.db.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id,name,kind,base_url,api_key,model,temperature,max_tokens,top_p,extra,is_active,created_at,updated_at FROM ai_providers WHERE id=?1",
        )?;
        stmt.query_row([id], |row| {
            let extra: String = row.get(9)?;
            Ok(AIProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                base_url: row.get(3)?,
                api_key: row.get(4)?,
                model: row.get(5)?,
                temperature: row.get(6)?,
                max_tokens: row.get::<_, i64>(7)? as u32,
                top_p: row.get(8)?,
                extra: serde_json::from_str(&extra).unwrap_or(Value::Null),
                is_active: row.get::<_, i32>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| AppError::Other(e.to_string()))?
    } else {
        active_provider(&state)?
    };
    chat_stream_with(&provider, &messages, &app, &session_id).await
}

pub async fn chat_with(p: &AIProvider, messages: &[ChatMessage]) -> AppResult<ChatMessage> {
    match p.kind.as_str() {
        "openai" => openai_chat(p, messages, false, None, None).await,
        "anthropic" => anthropic_chat(p, messages, false, None, None).await,
        "ollama" => ollama_chat(p, messages, false, None, None).await,
        _ => Err(AppError::Other(format!("unknown provider kind: {}", p.kind))),
    }
}

pub async fn chat_stream_with(
    p: &AIProvider,
    messages: &[ChatMessage],
    app: &AppHandle,
    session: &str,
) -> AppResult<()> {
    let app = app.clone();
    let session = session.to_string();
    match p.kind.as_str() {
        "openai" => {
            openai_chat(p, messages, true, Some(app), Some(session)).await?;
        }
        "anthropic" => {
            anthropic_chat(p, messages, true, Some(app), Some(session)).await?;
        }
        "ollama" => {
            ollama_chat(p, messages, true, Some(app), Some(session)).await?;
        }
        other => return Err(AppError::Other(format!("unknown provider kind: {other}"))),
    };
    Ok(())
}

// ---------- backends ----------

async fn openai_chat(
    p: &AIProvider,
    messages: &[ChatMessage],
    stream: bool,
    app: Option<AppHandle>,
    session: Option<String>,
) -> AppResult<ChatMessage> {
    let url = format!("{}/chat/completions", p.base_url.trim_end_matches('/'));
    let body = json!({
        "model": p.model,
        "messages": messages,
        "temperature": p.temperature,
        "top_p": p.top_p,
        "max_tokens": p.max_tokens,
        "stream": stream,
    });
    let mut req = client().post(&url).json(&body);
    if !p.api_key.is_empty() {
        req = req.bearer_auth(&p.api_key);
    }
    let res = req
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;
    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("{} {status}: {txt}", p.kind)));
    }
    if !stream {
        let v: Value = res.json().await.map_err(|e| AppError::Other(e.to_string()))?;
        let content = v
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .to_string();
        return Ok(ChatMessage { role: "assistant".into(), content });
    }
    let mut stream = res.bytes_stream();
    let mut full = String::new();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| AppError::Other(e.to_string()))?;
        for line in bytes.split(|&b| b == b'\n') {
            let line = std::str::from_utf8(line).unwrap_or("");
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let payload = line.strip_prefix("data:").unwrap_or(line).trim();
            if payload == "[DONE]" {
                break;
            }
            if let Ok(v) = serde_json::from_str::<Value>(payload) {
                let delta = v
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("content"))
                    .and_then(|s| s.as_str())
                    .unwrap_or_default();
                if !delta.is_empty() {
                    full.push_str(delta);
                    if let (Some(app), Some(sid)) = (app.as_ref(), session.as_ref()) {
                        let _ = app.emit(
                            "ai:chat_chunk",
                            json!({"session_id": sid, "delta": delta}),
                        );
                    }
                }
            }
        }
    }
    if let (Some(app), Some(sid)) = (app.as_ref(), session.as_ref()) {
        let _ = app.emit("ai:chat_done", json!({"session_id": sid, "content": full}));
    }
    Ok(ChatMessage { role: "assistant".into(), content: full })
}

async fn anthropic_chat(
    p: &AIProvider,
    messages: &[ChatMessage],
    stream: bool,
    app: Option<AppHandle>,
    session: Option<String>,
) -> AppResult<ChatMessage> {
    let url = format!("{}/messages", p.base_url.trim_end_matches('/'));
    // Anthropic split: system goes in `system`, the rest in `messages`.
    let mut system = String::new();
    let mut msgs: Vec<Value> = Vec::new();
    for m in messages {
        if m.role == "system" {
            if !system.is_empty() {
                system.push('\n');
            }
            system.push_str(&m.content);
        } else {
            msgs.push(json!({"role": m.role, "content": m.content}));
        }
    }
    let body = json!({
        "model": p.model,
        "messages": msgs,
        "system": system,
        "temperature": p.temperature,
        "top_p": p.top_p,
        "max_tokens": p.max_tokens,
        "stream": stream,
    });
    let res = client()
        .post(&url)
        .header("x-api-key", &p.api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;
    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("anthropic {status}: {txt}")));
    }
    if !stream {
        let v: Value = res.json().await.map_err(|e| AppError::Other(e.to_string()))?;
        let content = v
            .get("content")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default();
        return Ok(ChatMessage { role: "assistant".into(), content });
    }
    let mut stream = res.bytes_stream();
    let mut full = String::new();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| AppError::Other(e.to_string()))?;
        for line in bytes.split(|&b| b == b'\n') {
            let line = std::str::from_utf8(line).unwrap_or("").trim();
            if !line.starts_with("data:") {
                continue;
            }
            let payload = line.trim_start_matches("data:").trim();
            if let Ok(v) = serde_json::from_str::<Value>(payload) {
                if v.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                    let delta = v
                        .get("delta")
                        .and_then(|d| d.get("text"))
                        .and_then(|t| t.as_str())
                        .unwrap_or_default();
                    if !delta.is_empty() {
                        full.push_str(delta);
                        if let (Some(app), Some(sid)) = (app.as_ref(), session.as_ref()) {
                            let _ = app.emit(
                                "ai:chat_chunk",
                                json!({"session_id": sid, "delta": delta}),
                            );
                        }
                    }
                }
            }
        }
    }
    if let (Some(app), Some(sid)) = (app.as_ref(), session.as_ref()) {
        let _ = app.emit("ai:chat_done", json!({"session_id": sid, "content": full}));
    }
    Ok(ChatMessage { role: "assistant".into(), content: full })
}

async fn ollama_chat(
    p: &AIProvider,
    messages: &[ChatMessage],
    stream: bool,
    app: Option<AppHandle>,
    session: Option<String>,
) -> AppResult<ChatMessage> {
    let url = format!("{}/api/chat", p.base_url.trim_end_matches('/'));
    let body = json!({
        "model": p.model,
        "messages": messages,
        "stream": stream,
        "options": {
            "temperature": p.temperature,
            "top_p": p.top_p,
            "num_predict": p.max_tokens,
        }
    });
    let res = client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;
    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("ollama {status}: {txt}")));
    }
    if !stream {
        let v: Value = res.json().await.map_err(|e| AppError::Other(e.to_string()))?;
        let content = v
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .to_string();
        return Ok(ChatMessage { role: "assistant".into(), content });
    }
    let mut stream = res.bytes_stream();
    let mut full = String::new();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| AppError::Other(e.to_string()))?;
        for line in bytes.split(|&b| b == b'\n') {
            if line.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_slice::<Value>(line) {
                let delta = v
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|s| s.as_str())
                    .unwrap_or_default();
                if !delta.is_empty() {
                    full.push_str(delta);
                    if let (Some(app), Some(sid)) = (app.as_ref(), session.as_ref()) {
                        let _ = app.emit(
                            "ai:chat_chunk",
                            json!({"session_id": sid, "delta": delta}),
                        );
                    }
                }
                if v.get("done").and_then(|d| d.as_bool()).unwrap_or(false) {
                    if let (Some(app), Some(sid)) = (app.as_ref(), session.as_ref()) {
                        let _ = app.emit(
                            "ai:chat_done",
                            json!({"session_id": sid, "content": full}),
                        );
                    }
                    return Ok(ChatMessage { role: "assistant".into(), content: full });
                }
            }
        }
    }
    Ok(ChatMessage { role: "assistant".into(), content: full })
}

// ---------- embed ----------

#[tauri::command]
pub async fn ai_embed(
    state: State<'_, AppState>,
    text: String,
    provider_id: Option<String>,
) -> AppResult<Vec<f32>> {
    let provider = if let Some(_id) = provider_id {
        active_provider(&state)?
    } else {
        active_provider(&state)?
    };
    match provider.kind.as_str() {
        "openai" => {
            let url = format!("{}/embeddings", provider.base_url.trim_end_matches('/'));
            let body = json!({"model": provider.model, "input": text});
            let mut req = client().post(&url).json(&body);
            if !provider.api_key.is_empty() {
                req = req.bearer_auth(&provider.api_key);
            }
            let v: Value = req
                .send()
                .await
                .map_err(|e| AppError::Other(e.to_string()))?
                .json()
                .await
                .map_err(|e| AppError::Other(e.to_string()))?;
            let arr = v
                .get("data")
                .and_then(|d| d.get(0))
                .and_then(|o| o.get("embedding"))
                .and_then(|e| e.as_array())
                .ok_or_else(|| AppError::Other("malformed embeddings response".into()))?;
            Ok(arr.iter().filter_map(|x| x.as_f64().map(|f| f as f32)).collect())
        }
        "ollama" => {
            let url = format!("{}/api/embeddings", provider.base_url.trim_end_matches('/'));
            let body = json!({"model": provider.model, "prompt": text});
            let v: Value = client()
                .post(&url)
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::Other(e.to_string()))?
                .json()
                .await
                .map_err(|e| AppError::Other(e.to_string()))?;
            let arr = v
                .get("embedding")
                .and_then(|e| e.as_array())
                .ok_or_else(|| AppError::Other("malformed embeddings response".into()))?;
            Ok(arr.iter().filter_map(|x| x.as_f64().map(|f| f as f32)).collect())
        }
        other => Err(AppError::Other(format!(
            "embeddings not supported for kind: {other}"
        ))),
    }
}

// ---------- intent ----------

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
pub async fn ai_parse_intent(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<ParsedIntent> {
    let mut intent = parse_heuristic(&query);
    let prompt = format!(
        "Extract a JSON object from this file-search query. Reply ONLY with a JSON object using this schema: \
        {{\"keywords\":[],\"extensions\":[],\"days_back\":int|null,\"size_min\":int|null,\"size_max\":int|null}}.\n\
        Query: {query}"
    );
    let messages = vec![ChatMessage {
        role: "user".into(),
        content: prompt,
    }];
    if let Ok(provider) = active_provider(&state) {
        if let Ok(msg) = chat_with(&provider, &messages).await {
            if let Some(start) = msg.content.find('{') {
                if let Some(end) = msg.content.rfind('}') {
                    if end > start {
                        if let Ok(v) = serde_json::from_str::<Value>(&msg.content[start..=end]) {
                            if let Some(arr) = v.get("keywords").and_then(|x| x.as_array()) {
                                intent.keywords = arr
                                    .iter()
                                    .filter_map(|x| x.as_str().map(String::from))
                                    .collect();
                            }
                            if let Some(arr) = v.get("extensions").and_then(|x| x.as_array()) {
                                intent.extensions = arr
                                    .iter()
                                    .filter_map(|x| {
                                        x.as_str().map(|s| s.trim_start_matches('.').to_string())
                                    })
                                    .collect();
                            }
                            if let Some(d) = v.get("days_back").and_then(|x| x.as_i64()) {
                                intent.time_after = Some(Utc::now().timestamp() - d * 86400);
                            }
                        }
                    }
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
        time_after = Some(Utc::now().timestamp() - 86_400);
    } else if lower.contains("昨天") || lower.contains("yesterday") {
        time_after = Some(Utc::now().timestamp() - 86_400 * 2);
    } else if lower.contains("上周") || lower.contains("last week") {
        time_after = Some(Utc::now().timestamp() - 86_400 * 7);
    } else if lower.contains("上月") || lower.contains("last month") {
        time_after = Some(Utc::now().timestamp() - 86_400 * 30);
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

// ---------- health ----------

#[tauri::command]
pub async fn ai_health(state: State<'_, AppState>) -> AppResult<Value> {
    match active_provider(&state) {
        Ok(p) => Ok(json!({
            "ok": true,
            "active_provider": p.name,
            "kind": p.kind,
            "model": p.model,
        })),
        Err(_) => Ok(json!({"ok": false, "active_provider": null})),
    }
}
