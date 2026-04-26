use crate::error::AppResult;
use crate::state::AppState;
use chrono::Utc;
use serde::Serialize;
use serde_json::Value;
use tauri::State;

#[derive(Serialize)]
pub struct Workspace {
    pub id: i64,
    pub name: String,
    pub state: Value,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub async fn save_workspace(
    state: State<'_, AppState>,
    name: String,
    payload: Value,
) -> AppResult<i64> {
    let conn = state.db.conn.lock();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO workspaces(name,state,created_at,updated_at) VALUES(?1,?2,?3,?3)",
        rusqlite::params![name, payload.to_string(), now],
    )?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub async fn list_workspaces(state: State<'_, AppState>) -> AppResult<Vec<Workspace>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT id,name,state,created_at,updated_at FROM workspaces ORDER BY updated_at DESC")?;
    let rows = stmt
        .query_map([], |row| {
            let s: String = row.get(2)?;
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                state: serde_json::from_str(&s).unwrap_or(Value::Null),
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn update_workspace(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    payload: Option<Value>,
) -> AppResult<()> {
    let conn = state.db.conn.lock();
    let now = Utc::now().timestamp();
    if let Some(n) = name {
        conn.execute(
            "UPDATE workspaces SET name=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![n, now, id],
        )?;
    }
    if let Some(p) = payload {
        conn.execute(
            "UPDATE workspaces SET state=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![p.to_string(), now, id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_workspace(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    state
        .db
        .conn
        .lock()
        .execute("DELETE FROM workspaces WHERE id=?1", [id])?;
    Ok(())
}
