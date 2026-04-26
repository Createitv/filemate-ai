// Application settings persisted to SQLite, exposed as key/value JSON.
// Frontend can `get_setting`/`set_setting` to keep things like theme +
// language synchronized with the store on startup.

use crate::error::AppResult;
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn get_setting(state: State<'_, AppState>, key: String) -> AppResult<Option<Value>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let res = stmt
        .query_row([&key], |row| row.get::<_, String>(0))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());
    Ok(res)
}

#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, key: String, value: Value) -> AppResult<()> {
    let conn = state.db.conn.lock();
    conn.execute(
        "INSERT INTO settings(key,value) VALUES(?1,?2) \
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        rusqlite::params![key, value.to_string()],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn list_settings(state: State<'_, AppState>) -> AppResult<Vec<(String, Value)>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare("SELECT key,value FROM settings")?;
    let rows = stmt
        .query_map([], |row| {
            let k: String = row.get(0)?;
            let v: String = row.get(1)?;
            Ok((k, v))
        })?
        .filter_map(|r| r.ok())
        .filter_map(|(k, v)| serde_json::from_str(&v).ok().map(|val| (k, val)))
        .collect();
    Ok(rows)
}
