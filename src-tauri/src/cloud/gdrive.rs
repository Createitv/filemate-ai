// Google Drive v3 client. Config:
//   { "access_token":"...", "refresh_token":"...", "client_id":"...",
//     "client_secret":"...", "expires_at":0 }
// Token refresh is performed automatically when expired.

use super::{CloudFile, CloudProvider};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use parking_lot::Mutex;
use serde::Deserialize;
use std::path::Path;

const API: &str = "https://www.googleapis.com/drive/v3";
const UPLOAD: &str = "https://www.googleapis.com/upload/drive/v3";
const TOKEN: &str = "https://oauth2.googleapis.com/token";

#[derive(Deserialize, Debug, Clone)]
struct Config {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    client_secret: Option<String>,
    #[serde(default)]
    expires_at: i64,
}

pub struct GDriveProvider {
    cfg: Mutex<Config>,
}

impl GDriveProvider {
    pub fn from_config(cfg: &serde_json::Value) -> AppResult<Self> {
        let parsed: Config = serde_json::from_value(cfg.clone())
            .map_err(|e| AppError::Other(format!("invalid gdrive config: {e}")))?;
        Ok(Self {
            cfg: Mutex::new(parsed),
        })
    }

    async fn ensure_token(&self) -> AppResult<String> {
        let (token, expires_at, refresh, cid, csec) = {
            let c = self.cfg.lock();
            (
                c.access_token.clone(),
                c.expires_at,
                c.refresh_token.clone(),
                c.client_id.clone(),
                c.client_secret.clone(),
            )
        };
        if chrono::Utc::now().timestamp() < expires_at - 30 || expires_at == 0 {
            return Ok(token);
        }
        let (Some(rt), Some(cid), Some(csec)) = (refresh, cid, csec) else {
            return Ok(token);
        };
        #[derive(Deserialize)]
        struct R {
            access_token: String,
            expires_in: i64,
        }
        let res = reqwest::Client::new()
            .post(TOKEN)
            .form(&[
                ("client_id", cid.as_str()),
                ("client_secret", csec.as_str()),
                ("refresh_token", rt.as_str()),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        let parsed: R = res.json().await.map_err(|e| AppError::Other(e.to_string()))?;
        let mut c = self.cfg.lock();
        c.access_token = parsed.access_token.clone();
        c.expires_at = chrono::Utc::now().timestamp() + parsed.expires_in;
        Ok(parsed.access_token)
    }
}

#[derive(Deserialize)]
struct ListResp {
    files: Vec<DriveFile>,
}

#[derive(Deserialize)]
struct DriveFile {
    id: String,
    name: String,
    #[serde(rename = "mimeType")]
    mime_type: String,
    #[serde(default)]
    size: Option<String>,
    #[serde(rename = "modifiedTime", default)]
    modified_time: Option<String>,
}

async fn resolve_id(client: &reqwest::Client, token: &str, path: &str) -> AppResult<String> {
    let p = path.trim_matches('/');
    if p.is_empty() {
        return Ok("root".to_string());
    }
    let mut parent = "root".to_string();
    for seg in p.split('/') {
        let q = format!(
            "'{parent}' in parents and name='{}' and trashed=false",
            seg.replace('\'', "\\'")
        );
        let res = client
            .get(format!("{API}/files"))
            .bearer_auth(token)
            .query(&[("q", q.as_str()), ("fields", "files(id,name,mimeType)")])
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        let parsed: ListResp = res.json().await.map_err(|e| AppError::Other(e.to_string()))?;
        let next = parsed
            .files
            .into_iter()
            .next()
            .ok_or_else(|| AppError::Path(format!("not found: {seg}")))?;
        parent = next.id;
    }
    Ok(parent)
}

#[async_trait]
impl CloudProvider for GDriveProvider {
    async fn list(&self, path: &str) -> AppResult<Vec<CloudFile>> {
        let token = self.ensure_token().await?;
        let client = reqwest::Client::new();
        let parent_id = resolve_id(&client, &token, path).await?;
        let q = format!("'{parent_id}' in parents and trashed=false");
        let res = client
            .get(format!("{API}/files"))
            .bearer_auth(&token)
            .query(&[
                ("q", q.as_str()),
                ("fields", "files(id,name,mimeType,size,modifiedTime)"),
                ("pageSize", "1000"),
            ])
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        let parsed: ListResp = res.json().await.map_err(|e| AppError::Other(e.to_string()))?;
        Ok(parsed
            .files
            .into_iter()
            .map(|f| CloudFile {
                id: f.id.clone(),
                name: f.name.clone(),
                path: format!("{}/{}", path.trim_end_matches('/'), f.name),
                is_dir: f.mime_type == "application/vnd.google-apps.folder",
                size: f.size.as_deref().and_then(|s| s.parse().ok()).unwrap_or(0),
                modified: f
                    .modified_time
                    .as_deref()
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|d| d.timestamp()),
            })
            .collect())
    }

    async fn download(&self, path: &str, to_local: &Path) -> AppResult<()> {
        let token = self.ensure_token().await?;
        let client = reqwest::Client::new();
        let id = resolve_id(&client, &token, path).await?;
        let res = client
            .get(format!("{API}/files/{id}?alt=media"))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if let Some(parent) = to_local.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(to_local, res.bytes().await.map_err(|e| AppError::Other(e.to_string()))?)?;
        Ok(())
    }

    async fn upload(&self, from_local: &Path, remote_path: &str) -> AppResult<()> {
        let token = self.ensure_token().await?;
        let client = reqwest::Client::new();
        let bytes = tokio::fs::read(from_local).await.map_err(|e| AppError::Other(e.to_string()))?;
        let name = std::path::Path::new(remote_path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let parent_dir = std::path::Path::new(remote_path).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
        let parent_id = resolve_id(&client, &token, &parent_dir).await?;
        let metadata = serde_json::json!({"name": name, "parents": [parent_id]});
        let mime = mime_guess::from_path(from_local).first_or_octet_stream().to_string();
        let part_meta = reqwest::multipart::Part::text(metadata.to_string())
            .mime_str("application/json")
            .map_err(|e| AppError::Other(e.to_string()))?;
        let part_data = reqwest::multipart::Part::bytes(bytes)
            .mime_str(&mime)
            .map_err(|e| AppError::Other(e.to_string()))?;
        let form = reqwest::multipart::Form::new()
            .part("metadata", part_meta)
            .part("file", part_data);
        let res = client
            .post(format!("{UPLOAD}/files?uploadType=multipart"))
            .bearer_auth(&token)
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("gdrive {}", res.status())));
        }
        Ok(())
    }

    async fn delete(&self, path: &str) -> AppResult<()> {
        let token = self.ensure_token().await?;
        let client = reqwest::Client::new();
        let id = resolve_id(&client, &token, path).await?;
        let res = client
            .delete(format!("{API}/files/{id}"))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("gdrive {}", res.status())));
        }
        Ok(())
    }
}
