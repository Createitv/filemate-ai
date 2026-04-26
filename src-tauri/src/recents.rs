use crate::error::AppResult;
use crate::state::AppState;
use chrono::Utc;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct RecentEntry {
    pub path: String,
    pub name: String,
    pub accessed_at: i64,
    pub is_dir: bool,
}

#[tauri::command]
pub async fn touch_recent(
    state: State<'_, AppState>,
    path: String,
    name: String,
    is_dir: bool,
) -> AppResult<()> {
    let conn = state.db.conn.lock();
    conn.execute(
        "INSERT INTO recents(path,name,accessed_at,is_dir) VALUES(?1,?2,?3,?4) \
         ON CONFLICT(path) DO UPDATE SET accessed_at=excluded.accessed_at, name=excluded.name",
        rusqlite::params![path, name, Utc::now().timestamp(), is_dir as i32],
    )?;
    // keep last 200
    conn.execute(
        "DELETE FROM recents WHERE path NOT IN (SELECT path FROM recents ORDER BY accessed_at DESC LIMIT 200)",
        [],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn list_recents(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> AppResult<Vec<RecentEntry>> {
    let limit = limit.unwrap_or(50);
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT path,name,accessed_at,is_dir FROM recents ORDER BY accessed_at DESC LIMIT ?1",
    )?;
    let rows = stmt
        .query_map([limit], |row| {
            Ok(RecentEntry {
                path: row.get(0)?,
                name: row.get(1)?,
                accessed_at: row.get(2)?,
                is_dir: row.get::<_, i32>(3)? != 0,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn clear_recents(state: State<'_, AppState>) -> AppResult<()> {
    state.db.conn.lock().execute("DELETE FROM recents", [])?;
    Ok(())
}
