// Dropbox API v2 client. Config:
//   { "access_token":"...","refresh_token":"...","app_key":"...",
//     "app_secret":"...","expires_at":0 }

use super::{CloudFile, CloudProvider};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use parking_lot::Mutex;
use serde::Deserialize;
use std::path::Path;

const API: &str = "https://api.dropboxapi.com/2";
const CONTENT: &str = "https://content.dropboxapi.com/2";
const TOKEN: &str = "https://api.dropbox.com/oauth2/token";

#[derive(Deserialize, Debug, Clone)]
struct Config {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    app_key: Option<String>,
    #[serde(default)]
    app_secret: Option<String>,
    #[serde(default)]
    expires_at: i64,
}

pub struct DropboxProvider {
    cfg: Mutex<Config>,
}

impl DropboxProvider {
    pub fn from_config(cfg: &serde_json::Value) -> AppResult<Self> {
        let parsed: Config = serde_json::from_value(cfg.clone())
            .map_err(|e| AppError::Other(format!("invalid dropbox config: {e}")))?;
        Ok(Self {
            cfg: Mutex::new(parsed),
        })
    }

    async fn token(&self) -> AppResult<String> {
        let (token, expires_at, refresh, key, secret) = {
            let c = self.cfg.lock();
            (
                c.access_token.clone(),
                c.expires_at,
                c.refresh_token.clone(),
                c.app_key.clone(),
                c.app_secret.clone(),
            )
        };
        if chrono::Utc::now().timestamp() < expires_at - 30 || expires_at == 0 {
            return Ok(token);
        }
        let (Some(rt), Some(ak), Some(asec)) = (refresh, key, secret) else {
            return Ok(token);
        };
        #[derive(Deserialize)]
        struct R {
            access_token: String,
            expires_in: i64,
        }
        let res = reqwest::Client::new()
            .post(TOKEN)
            .basic_auth(ak, Some(asec))
            .form(&[("grant_type", "refresh_token"), ("refresh_token", rt.as_str())])
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

fn norm(path: &str) -> String {
    if path.is_empty() || path == "/" {
        "".into()
    } else if path.starts_with('/') {
        path.into()
    } else {
        format!("/{}", path)
    }
}

#[derive(Deserialize)]
struct ListResp {
    entries: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    #[serde(rename = ".tag")]
    tag: String,
    name: String,
    path_display: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    server_modified: Option<String>,
}

#[async_trait]
impl CloudProvider for DropboxProvider {
    async fn list(&self, path: &str) -> AppResult<Vec<CloudFile>> {
        let token = self.token().await?;
        let body = serde_json::json!({"path": norm(path), "recursive": false, "limit": 1000});
        let res = reqwest::Client::new()
            .post(format!("{API}/files/list_folder"))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!(
                "dropbox {}: {}",
                res.status(),
                res.text().await.unwrap_or_default()
            )));
        }
        let parsed: ListResp = res.json().await.map_err(|e| AppError::Other(e.to_string()))?;
        Ok(parsed
            .entries
            .into_iter()
            .map(|e| CloudFile {
                id: e.path_display.clone(),
                name: e.name,
                path: e.path_display,
                is_dir: e.tag == "folder",
                size: e.size,
                modified: e
                    .server_modified
                    .as_deref()
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|d| d.timestamp()),
            })
            .collect())
    }

    async fn download(&self, path: &str, to_local: &Path) -> AppResult<()> {
        let token = self.token().await?;
        let arg = serde_json::json!({"path": norm(path)}).to_string();
        let res = reqwest::Client::new()
            .post(format!("{CONTENT}/files/download"))
            .bearer_auth(token)
            .header("Dropbox-API-Arg", arg)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("dropbox {}", res.status())));
        }
        if let Some(parent) = to_local.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(to_local, res.bytes().await.map_err(|e| AppError::Other(e.to_string()))?)?;
        Ok(())
    }

    async fn upload(&self, from_local: &Path, remote_path: &str) -> AppResult<()> {
        let token = self.token().await?;
        let bytes = tokio::fs::read(from_local).await.map_err(|e| AppError::Other(e.to_string()))?;
        let arg = serde_json::json!({
            "path": norm(remote_path),
            "mode": "overwrite",
            "autorename": false,
            "mute": true,
        })
        .to_string();
        let res = reqwest::Client::new()
            .post(format!("{CONTENT}/files/upload"))
            .bearer_auth(token)
            .header("Dropbox-API-Arg", arg)
            .header("Content-Type", "application/octet-stream")
            .body(bytes)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("dropbox {}", res.status())));
        }
        Ok(())
    }

    async fn delete(&self, path: &str) -> AppResult<()> {
        let token = self.token().await?;
        let body = serde_json::json!({"path": norm(path)});
        let res = reqwest::Client::new()
            .post(format!("{API}/files/delete_v2"))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("dropbox {}", res.status())));
        }
        Ok(())
    }
}
