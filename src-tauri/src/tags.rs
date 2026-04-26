use crate::error::AppResult;
use crate::state::AppState;
use chrono::Utc;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub created_at: i64,
}

#[tauri::command]
pub async fn create_tag(state: State<'_, AppState>, name: String, color: String) -> AppResult<i64> {
    let conn = state.db.conn.lock();
    conn.execute(
        "INSERT INTO tags(name,color,created_at) VALUES(?1,?2,?3) \
         ON CONFLICT(name) DO UPDATE SET color=excluded.color",
        rusqlite::params![name, color, Utc::now().timestamp()],
    )?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub async fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<Tag>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare("SELECT id,name,color,created_at FROM tags ORDER BY name")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn delete_tag(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    state.db.conn.lock().execute("DELETE FROM tags WHERE id=?1", [id])?;
    Ok(())
}

#[tauri::command]
pub async fn assign_tag(state: State<'_, AppState>, path: String, tag_id: i64) -> AppResult<()> {
    state.db.conn.lock().execute(
        "INSERT OR IGNORE INTO file_tags(path,tag_id) VALUES(?1,?2)",
        rusqlite::params![path, tag_id],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn unassign_tag(state: State<'_, AppState>, path: String, tag_id: i64) -> AppResult<()> {
    state.db.conn.lock().execute(
        "DELETE FROM file_tags WHERE path=?1 AND tag_id=?2",
        rusqlite::params![path, tag_id],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn tags_of(state: State<'_, AppState>, path: String) -> AppResult<Vec<Tag>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT t.id,t.name,t.color,t.created_at FROM tags t \
         JOIN file_tags ft ON ft.tag_id = t.id WHERE ft.path = ?1",
    )?;
    let rows = stmt
        .query_map([path], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn paths_with_tag(state: State<'_, AppState>, tag_id: i64) -> AppResult<Vec<String>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare("SELECT path FROM file_tags WHERE tag_id=?1")?;
    let rows = stmt
        .query_map([tag_id], |row| row.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}
