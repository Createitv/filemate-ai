use crate::error::AppResult;
use crate::state::AppState;
use chrono::Utc;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct Bookmark {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub group_name: Option<String>,
    pub sort_order: i64,
    pub created_at: i64,
}

#[tauri::command]
pub async fn add_bookmark(
    state: State<'_, AppState>,
    path: String,
    name: String,
    group: Option<String>,
) -> AppResult<i64> {
    let conn = state.db.conn.lock();
    conn.execute(
        "INSERT INTO bookmarks(path,name,group_name,created_at) VALUES(?1,?2,?3,?4) \
         ON CONFLICT(path) DO UPDATE SET name=excluded.name, group_name=excluded.group_name",
        rusqlite::params![path, name, group, Utc::now().timestamp()],
    )?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub async fn remove_bookmark(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    state
        .db
        .conn
        .lock()
        .execute("DELETE FROM bookmarks WHERE id = ?1", [id])?;
    Ok(())
}

#[tauri::command]
pub async fn list_bookmarks(state: State<'_, AppState>) -> AppResult<Vec<Bookmark>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT id,path,name,group_name,sort_order,created_at FROM bookmarks ORDER BY sort_order, created_at",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Bookmark {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                group_name: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn reorder_bookmark(
    state: State<'_, AppState>,
    id: i64,
    sort_order: i64,
) -> AppResult<()> {
    state
        .db
        .conn
        .lock()
        .execute("UPDATE bookmarks SET sort_order=?2 WHERE id=?1", [id, sort_order])?;
    Ok(())
}
