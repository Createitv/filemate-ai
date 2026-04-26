// Cloud provider trait + dispatch. Account configs are stored in the
// `cloud_accounts` table as JSON; the frontend creates accounts via
// `add_cloud_account`, then calls list/upload/download with the account id.

pub mod s3;
pub mod onedrive;
pub mod gdrive;
pub mod dropbox;
pub mod webdav;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use async_trait::async_trait;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CloudFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<i64>,
}

#[async_trait]
pub trait CloudProvider: Send + Sync {
    async fn list(&self, path: &str) -> AppResult<Vec<CloudFile>>;
    async fn download(&self, path: &str, to_local: &std::path::Path) -> AppResult<()>;
    async fn upload(&self, from_local: &std::path::Path, remote_path: &str) -> AppResult<()>;
    async fn delete(&self, path: &str) -> AppResult<()>;
    async fn presigned_url(&self, path: &str, expires_secs: u64) -> AppResult<String> {
        let _ = (path, expires_secs);
        Err(AppError::NotImplemented("presigned not supported"))
    }
}

#[derive(Serialize)]
pub struct CloudAccount {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub config: Value,
    pub created_at: i64,
}

#[tauri::command]
pub async fn add_cloud_account(
    state: State<'_, AppState>,
    provider: String,
    name: String,
    config: Value,
) -> AppResult<String> {
    let id = Uuid::new_v4().to_string();
    let conn = state.db.conn.lock();
    conn.execute(
        "INSERT INTO cloud_accounts(id,provider,name,config,created_at) VALUES(?1,?2,?3,?4,?5)",
        rusqlite::params![id, provider, name, config.to_string(), Utc::now().timestamp()],
    )?;
    Ok(id)
}

#[tauri::command]
pub async fn list_cloud_accounts(state: State<'_, AppState>) -> AppResult<Vec<CloudAccount>> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT id,provider,name,config,created_at FROM cloud_accounts ORDER BY created_at",
    )?;
    let rows = stmt
        .query_map([], |row| {
            let cfg: String = row.get(3)?;
            Ok(CloudAccount {
                id: row.get(0)?,
                provider: row.get(1)?,
                name: row.get(2)?,
                config: serde_json::from_str(&cfg).unwrap_or(Value::Null),
                created_at: row.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn delete_cloud_account(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state
        .db
        .conn
        .lock()
        .execute("DELETE FROM cloud_accounts WHERE id=?1", [id])?;
    Ok(())
}

fn load_account(state: &AppState, id: &str) -> AppResult<CloudAccount> {
    let conn = state.db.conn.lock();
    let mut stmt = conn.prepare(
        "SELECT id,provider,name,config,created_at FROM cloud_accounts WHERE id=?1",
    )?;
    let acc = stmt
        .query_row([id], |row| {
            let cfg: String = row.get(3)?;
            Ok(CloudAccount {
                id: row.get(0)?,
                provider: row.get(1)?,
                name: row.get(2)?,
                config: serde_json::from_str(&cfg).unwrap_or(Value::Null),
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(acc)
}

async fn provider_for(account: &CloudAccount) -> AppResult<Box<dyn CloudProvider>> {
    match account.provider.as_str() {
        "s3" => Ok(Box::new(s3::S3Provider::from_config(&account.config)?)),
        "onedrive" => Ok(Box::new(onedrive::OneDriveProvider::from_config(&account.config)?)),
        "gdrive" => Ok(Box::new(gdrive::GDriveProvider::from_config(&account.config)?)),
        "dropbox" => Ok(Box::new(dropbox::DropboxProvider::from_config(&account.config)?)),
        "webdav" => Ok(Box::new(webdav::WebDavProvider::from_config(&account.config)?)),
        other => Err(AppError::Other(format!("unknown provider: {other}"))),
    }
}

#[tauri::command]
pub async fn cloud_list(
    state: State<'_, AppState>,
    account_id: String,
    path: String,
) -> AppResult<Vec<CloudFile>> {
    let acc = load_account(&state, &account_id)?;
    let p = provider_for(&acc).await?;
    p.list(&path).await
}

#[tauri::command]
pub async fn cloud_download(
    state: State<'_, AppState>,
    account_id: String,
    remote_path: String,
    local_path: String,
) -> AppResult<()> {
    let acc = load_account(&state, &account_id)?;
    let p = provider_for(&acc).await?;
    p.download(&remote_path, std::path::Path::new(&local_path))
        .await
}

#[tauri::command]
pub async fn cloud_upload(
    state: State<'_, AppState>,
    account_id: String,
    local_path: String,
    remote_path: String,
) -> AppResult<()> {
    let acc = load_account(&state, &account_id)?;
    let p = provider_for(&acc).await?;
    p.upload(std::path::Path::new(&local_path), &remote_path).await
}

#[tauri::command]
pub async fn cloud_delete(
    state: State<'_, AppState>,
    account_id: String,
    path: String,
) -> AppResult<()> {
    let acc = load_account(&state, &account_id)?;
    let p = provider_for(&acc).await?;
    p.delete(&path).await
}

#[tauri::command]
pub async fn cloud_presigned(
    state: State<'_, AppState>,
    account_id: String,
    path: String,
    expires_secs: u64,
) -> AppResult<String> {
    let acc = load_account(&state, &account_id)?;
    let p = provider_for(&acc).await?;
    p.presigned_url(&path, expires_secs).await
}
