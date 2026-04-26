// Automation rules engine. Rules are stored in SQLite as JSON; the engine is
// driven by `watcher.rs` events. When a Created/Modified event fires inside a
// rule's monitored folder, we evaluate conditions then run the actions.
//
// Trigger types:
//   { type: "fs_event", folder: "/path", events: ["created", "modified"] }
//   { type: "manual" }
//   { type: "schedule", cron_like: "@daily" }     // daily at startup
//
// Conditions (any subset, AND-combined):
//   { type: "ext_in",   values: ["pdf","docx"] }
//   { type: "name_contains", value: "report" }
//   { type: "size_lt",  bytes: 104857600 }
//   { type: "size_gt",  bytes: 1048576 }
//   { type: "older_than_days", days: 180 }
//
// Actions (executed in order):
//   { type: "move",   to: "/dst" }
//   { type: "copy",   to: "/dst" }
//   { type: "rename", template: "{date}_{name}" }
//   { type: "tag",    name: "归档" }
//   { type: "delete" }
//   { type: "shell",  cmd: "echo $PATH" }

use crate::error::AppResult;
use crate::state::AppState;
use crate::watcher::FsEvent;
use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub trigger: Value,
    pub conditions: Vec<Value>,
    pub actions: Vec<Value>,
}

#[derive(Serialize)]
pub struct RuleRecord {
    #[serde(flatten)]
    pub rule: Rule,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub async fn save_rule(state: tauri::State<'_, AppState>, rule: Rule) -> AppResult<()> {
    let conn = state.db.conn.lock();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO automation_rules(id,name,enabled,trigger,conditions,actions,created_at,updated_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?7)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, enabled=excluded.enabled,
         trigger=excluded.trigger, conditions=excluded.conditions, actions=excluded.actions,
         updated_at=excluded.updated_at",
        rusqlite::params![
            rule.id,
            rule.name,
            rule.enabled as i32,
            rule.trigger.to_string(),
            serde_json::Value::Array(rule.conditions).to_string(),
            serde_json::Value::Array(rule.actions).to_string(),
            now
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn list_rules(state: tauri::State<'_, AppState>) -> AppResult<Vec<RuleRecord>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT id,name,enabled,trigger,conditions,actions,created_at,updated_at FROM automation_rules ORDER BY updated_at DESC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            let trig: String = row.get(3)?;
            let cond: String = row.get(4)?;
            let acts: String = row.get(5)?;
            let trigger: Value = serde_json::from_str(&trig).unwrap_or(Value::Null);
            let conditions: Vec<Value> = serde_json::from_str(&cond).unwrap_or_default();
            let actions: Vec<Value> = serde_json::from_str(&acts).unwrap_or_default();
            Ok(RuleRecord {
                rule: Rule {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    enabled: row.get::<_, i32>(2)? != 0,
                    trigger,
                    conditions,
                    actions,
                },
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn delete_rule(state: tauri::State<'_, AppState>, id: String) -> AppResult<()> {
    state
        .db
        .conn
        .lock()
        .execute("DELETE FROM automation_rules WHERE id=?1", [id])?;
    Ok(())
}

#[tauri::command]
pub async fn run_rule(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<usize> {
    let rules = list_rules(state.clone()).await?;
    let Some(rec) = rules.into_iter().find(|r| r.rule.id == id) else {
        return Err(crate::error::AppError::Other("rule not found".into()));
    };
    let folder = rec
        .rule
        .trigger
        .get("folder")
        .and_then(|v| v.as_str())
        .map(PathBuf::from);
    let mut affected = 0usize;
    if let Some(root) = folder {
        for entry in walkdir::WalkDir::new(&root)
            .max_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            if matches_conditions(entry.path(), &rec.rule.conditions) {
                run_actions(entry.path(), &rec.rule.actions, &state, &app)?;
                affected += 1;
            }
        }
    }
    record_history(&state, &rec.rule, affected, "manual");
    Ok(affected)
}

#[tauri::command]
pub async fn list_automation_history(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
) -> AppResult<Vec<Value>> {
    let limit = limit.unwrap_or(50);
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT rule_id,rule_name,affected,detail,occurred_at FROM automation_history ORDER BY occurred_at DESC LIMIT ?1",
    )?;
    let rows = stmt
        .query_map([limit], |row| {
            Ok(serde_json::json!({
                "rule_id": row.get::<_, String>(0)?,
                "rule_name": row.get::<_, String>(1)?,
                "affected": row.get::<_, i64>(2)?,
                "detail": row.get::<_, Option<String>>(3)?,
                "occurred_at": row.get::<_, i64>(4)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

pub fn on_event(app: &AppHandle, state: &AppState, event: &FsEvent) {
    let path = match event {
        FsEvent::Created { path } | FsEvent::Modified { path } => path,
        _ => return,
    };
    let p = PathBuf::from(path);
    if !p.is_file() {
        return;
    }

    // Snapshot rules under the lock, drop the lock before running actions to
    // avoid holding the SQLite mutex across IO.
    let rules: Vec<RuleRecord> = {
        let conn = state.db.conn.lock();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id,name,enabled,trigger,conditions,actions,created_at,updated_at FROM automation_rules WHERE enabled = 1",
        ) else {
            return;
        };
        stmt.query_map([], |row| {
            let trig: String = row.get(3)?;
            let cond: String = row.get(4)?;
            let acts: String = row.get(5)?;
            Ok(RuleRecord {
                rule: Rule {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    enabled: true,
                    trigger: serde_json::from_str(&trig).unwrap_or(Value::Null),
                    conditions: serde_json::from_str(&cond).unwrap_or_default(),
                    actions: serde_json::from_str(&acts).unwrap_or_default(),
                },
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map(|i| i.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
    };

    for rec in rules {
        let folder = rec
            .rule
            .trigger
            .get("folder")
            .and_then(|v| v.as_str())
            .map(PathBuf::from);
        let inside = folder.as_ref().map(|f| p.starts_with(f)).unwrap_or(false);
        if !inside {
            continue;
        }
        if !matches_conditions(&p, &rec.rule.conditions) {
            continue;
        }
        if let Err(e) = run_actions(&p, &rec.rule.actions, state, app) {
            tracing::warn!("rule {} failed on {}: {e}", rec.rule.name, p.display());
            continue;
        }
        record_history(state, &rec.rule, 1, "fs_event");
    }
}

fn matches_conditions(p: &Path, conditions: &[Value]) -> bool {
    let meta = match std::fs::metadata(p) {
        Ok(m) => m,
        Err(_) => return false,
    };
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let name = p
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    conditions.iter().all(|c| match c.get("type").and_then(|v| v.as_str()) {
        Some("ext_in") => c
            .get("values")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().any(|v| v.as_str().map(|s| s.eq_ignore_ascii_case(&ext)).unwrap_or(false)))
            .unwrap_or(true),
        Some("name_contains") => c
            .get("value")
            .and_then(|v| v.as_str())
            .map(|s| name.to_lowercase().contains(&s.to_lowercase()))
            .unwrap_or(true),
        Some("size_lt") => c
            .get("bytes")
            .and_then(|v| v.as_u64())
            .map(|b| meta.len() < b)
            .unwrap_or(true),
        Some("size_gt") => c
            .get("bytes")
            .and_then(|v| v.as_u64())
            .map(|b| meta.len() > b)
            .unwrap_or(true),
        Some("older_than_days") => c
            .get("days")
            .and_then(|v| v.as_i64())
            .and_then(|d| {
                meta.modified().ok().map(|t| {
                    let secs = t
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs() as i64;
                    Utc::now().timestamp() - secs > d * 86_400
                })
            })
            .unwrap_or(true),
        _ => true,
    })
}

fn run_actions(p: &Path, actions: &[Value], state: &AppState, app: &AppHandle) -> AppResult<()> {
    for action in actions {
        let kind = action.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match kind {
            "move" => {
                if let Some(to) = action.get("to").and_then(|v| v.as_str()) {
                    let dest = ensure_dir(to)?.join(p.file_name().unwrap_or_default());
                    std::fs::rename(p, &dest)?;
                }
            }
            "copy" => {
                if let Some(to) = action.get("to").and_then(|v| v.as_str()) {
                    let dest = ensure_dir(to)?.join(p.file_name().unwrap_or_default());
                    std::fs::copy(p, dest)?;
                }
            }
            "rename" => {
                if let Some(tpl) = action.get("template").and_then(|v| v.as_str()) {
                    let new_name = render_template(tpl, p);
                    if let Some(parent) = p.parent() {
                        std::fs::rename(p, parent.join(new_name))?;
                    }
                }
            }
            "tag" => {
                if let Some(name) = action.get("name").and_then(|v| v.as_str()) {
                    let conn = state.db.conn.lock();
                    let now = Utc::now().timestamp();
                    conn.execute(
                        "INSERT OR IGNORE INTO tags(name,color,created_at) VALUES(?1,?2,?3)",
                        rusqlite::params![name, "#3B82F6", now],
                    )?;
                    let id: i64 = conn.query_row(
                        "SELECT id FROM tags WHERE name=?1",
                        [name],
                        |r| r.get(0),
                    )?;
                    conn.execute(
                        "INSERT OR IGNORE INTO file_tags(path,tag_id) VALUES(?1,?2)",
                        rusqlite::params![p.to_string_lossy().to_string(), id],
                    )?;
                }
            }
            "delete" => {
                trash::delete(p).ok();
            }
            "shell" => {
                if let Some(cmd) = action.get("cmd").and_then(|v| v.as_str()) {
                    #[cfg(unix)]
                    {
                        let _ = std::process::Command::new("sh").arg("-c").arg(cmd).status();
                    }
                    #[cfg(windows)]
                    {
                        let _ = std::process::Command::new("cmd").args(["/C", cmd]).status();
                    }
                }
            }
            _ => {}
        }
    }
    let _ = app.emit("automation:action", serde_json::json!({"path": p.to_string_lossy()}));
    Ok(())
}

fn render_template(tpl: &str, p: &Path) -> String {
    let date = Local::now().format("%Y-%m-%d").to_string();
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = p
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    let name = format!("{stem}{ext}");
    tpl.replace("{date}", &date)
        .replace("{name}", &name)
        .replace("{stem}", &stem)
        .replace("{ext}", ext.trim_start_matches('.'))
}

fn ensure_dir(path: &str) -> AppResult<PathBuf> {
    let p = PathBuf::from(path);
    std::fs::create_dir_all(&p)?;
    Ok(p)
}

fn record_history(state: &AppState, rule: &Rule, affected: usize, source: &str) {
    let conn = state.db.conn.lock();
    let _ = conn.execute(
        "INSERT INTO automation_history(rule_id,rule_name,affected,detail,occurred_at) VALUES(?1,?2,?3,?4,?5)",
        rusqlite::params![rule.id, rule.name, affected as i64, source, Utc::now().timestamp()],
    );
}
