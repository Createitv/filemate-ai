// OneDrive personal/business via Microsoft Graph API.
// Config schema:
//   { "client_id":"...", "tenant":"common",
//     "access_token":"...","refresh_token":"...","expires_at": 0 }
// Provide a `client_id` from your Azure App Registration (public client,
// redirect_uri http://localhost:43621). The frontend handles the OAuth dance
// (auth code with PKCE); this module just consumes the resulting tokens.

use super::{CloudFile, CloudProvider};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::Deserialize;
use std::path::Path;

const GRAPH_ROOT: &str = "https://graph.microsoft.com/v1.0/me/drive";

#[derive(Deserialize, Debug, Clone)]
struct Config {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    expires_at: i64,
}

pub struct OneDriveProvider {
    cfg: Config,
}

impl OneDriveProvider {
    pub fn from_config(cfg: &serde_json::Value) -> AppResult<Self> {
        let parsed: Config = serde_json::from_value(cfg.clone())
            .map_err(|e| AppError::Other(format!("invalid onedrive config: {e}")))?;
        Ok(Self { cfg: parsed })
    }

    fn client(&self) -> reqwest::Client {
        reqwest::Client::new()
    }

    fn auth(&self) -> String {
        format!("Bearer {}", self.cfg.access_token)
    }

    fn item_url(&self, path: &str) -> String {
        let trimmed = path.trim_matches('/');
        if trimmed.is_empty() {
            format!("{GRAPH_ROOT}/root")
        } else {
            format!("{GRAPH_ROOT}/root:/{}", urlencoding::encode(trimmed))
        }
    }
}

#[derive(Deserialize)]
struct GraphChildren {
    value: Vec<GraphItem>,
}

#[derive(Deserialize)]
struct GraphItem {
    id: String,
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(rename = "lastModifiedDateTime", default)]
    last_modified: Option<String>,
    folder: Option<serde_json::Value>,
    #[serde(rename = "parentReference")]
    parent_reference: Option<ParentRef>,
}

#[derive(Deserialize)]
struct ParentRef {
    path: Option<String>,
}

#[async_trait]
impl CloudProvider for OneDriveProvider {
    async fn list(&self, path: &str) -> AppResult<Vec<CloudFile>> {
        let url = format!("{}/children", self.item_url(path));
        let res = self
            .client()
            .get(url)
            .header("Authorization", self.auth())
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("onedrive {}", res.status())));
        }
        let parsed: GraphChildren = res
            .json()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        Ok(parsed
            .value
            .into_iter()
            .map(|it| {
                let parent = it
                    .parent_reference
                    .and_then(|p| p.path)
                    .unwrap_or_default()
                    .trim_start_matches("/drive/root:")
                    .to_string();
                let path = if parent.is_empty() {
                    format!("/{}", it.name)
                } else {
                    format!("{}/{}", parent, it.name)
                };
                CloudFile {
                    id: it.id,
                    name: it.name,
                    path,
                    is_dir: it.folder.is_some(),
                    size: it.size,
                    modified: it
                        .last_modified
                        .as_deref()
                        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                        .map(|d| d.timestamp()),
                }
            })
            .collect())
    }

    async fn download(&self, path: &str, to_local: &Path) -> AppResult<()> {
        let url = format!("{}/content", self.item_url(path));
        let res = self
            .client()
            .get(url)
            .header("Authorization", self.auth())
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("onedrive {}", res.status())));
        }
        if let Some(parent) = to_local.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let bytes = res.bytes().await.map_err(|e| AppError::Other(e.to_string()))?;
        std::fs::write(to_local, &bytes)?;
        Ok(())
    }

    async fn upload(&self, from_local: &Path, remote_path: &str) -> AppResult<()> {
        let url = format!("{}/content", self.item_url(remote_path));
        let bytes = tokio::fs::read(from_local)
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        let res = self
            .client()
            .put(url)
            .header("Authorization", self.auth())
            .header("Content-Type", "application/octet-stream")
            .body(bytes)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!(
                "onedrive upload {}: {}",
                res.status(),
                res.text().await.unwrap_or_default()
            )));
        }
        Ok(())
    }

    async fn delete(&self, path: &str) -> AppResult<()> {
        let url = self.item_url(path);
        let res = self
            .client()
            .delete(url)
            .header("Authorization", self.auth())
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("onedrive {}", res.status())));
        }
        Ok(())
    }
}
