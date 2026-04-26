// Generic WebDAV provider — works with Nextcloud, ownCloud, Apache mod_dav,
// Synology, etc. Config:
//   { "endpoint":"https://dav.example.com/remote.php/dav/files/me",
//     "username":"...","password":"..." }

use super::{CloudFile, CloudProvider};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize, Debug, Clone)]
struct Config {
    endpoint: String,
    username: String,
    password: String,
}

pub struct WebDavProvider {
    cfg: Config,
}

impl WebDavProvider {
    pub fn from_config(cfg: &serde_json::Value) -> AppResult<Self> {
        let parsed: Config = serde_json::from_value(cfg.clone())
            .map_err(|e| AppError::Other(format!("invalid webdav config: {e}")))?;
        Ok(Self { cfg: parsed })
    }

    fn url(&self, path: &str) -> String {
        let p = path.trim_start_matches('/');
        format!("{}/{}", self.cfg.endpoint.trim_end_matches('/'), p)
    }
}

#[async_trait]
impl CloudProvider for WebDavProvider {
    async fn list(&self, path: &str) -> AppResult<Vec<CloudFile>> {
        let body = r#"<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>"#;
        let url = self.url(path);
        let res = reqwest::Client::new()
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .basic_auth(&self.cfg.username, Some(&self.cfg.password))
            .header("Depth", "1")
            .header("Content-Type", "application/xml")
            .body(body)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("webdav {}", res.status())));
        }
        let xml = res.text().await.map_err(|e| AppError::Other(e.to_string()))?;
        Ok(parse_propfind(&xml, path))
    }

    async fn download(&self, path: &str, to_local: &Path) -> AppResult<()> {
        let res = reqwest::Client::new()
            .get(self.url(path))
            .basic_auth(&self.cfg.username, Some(&self.cfg.password))
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("webdav {}", res.status())));
        }
        if let Some(parent) = to_local.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(to_local, res.bytes().await.map_err(|e| AppError::Other(e.to_string()))?)?;
        Ok(())
    }

    async fn upload(&self, from_local: &Path, remote_path: &str) -> AppResult<()> {
        let bytes = tokio::fs::read(from_local).await.map_err(|e| AppError::Other(e.to_string()))?;
        let res = reqwest::Client::new()
            .put(self.url(remote_path))
            .basic_auth(&self.cfg.username, Some(&self.cfg.password))
            .body(bytes)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("webdav {}", res.status())));
        }
        Ok(())
    }

    async fn delete(&self, path: &str) -> AppResult<()> {
        let res = reqwest::Client::new()
            .delete(self.url(path))
            .basic_auth(&self.cfg.username, Some(&self.cfg.password))
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        if !res.status().is_success() {
            return Err(AppError::Other(format!("webdav {}", res.status())));
        }
        Ok(())
    }
}

// Tiny XML parser tuned to the propfind response shape. We avoid pulling in a
// full XML stack since we only need a handful of tags.
fn parse_propfind(xml: &str, base: &str) -> Vec<CloudFile> {
    let mut out = Vec::new();
    let lower = xml.to_lowercase();
    let mut idx = 0;
    while let Some(rel) = lower[idx..].find("<d:response") {
        let start = idx + rel;
        let end = lower[start..]
            .find("</d:response>")
            .map(|e| start + e)
            .unwrap_or(lower.len());
        let block = &xml[start..end];
        let href = take_between(block, "<d:href>", "</d:href>").unwrap_or_default();
        let size = take_between(block, "<d:getcontentlength>", "</d:getcontentlength>")
            .and_then(|s| s.trim().parse::<u64>().ok())
            .unwrap_or(0);
        let modified_raw = take_between(block, "<d:getlastmodified>", "</d:getlastmodified>");
        let is_dir = block.contains("<d:collection")
            || block.contains("<d:collection/>")
            || block.contains("<D:collection");
        let name = href
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_string();
        if !name.is_empty() && !href.ends_with(base) {
            out.push(CloudFile {
                id: href.clone(),
                name,
                path: href,
                is_dir,
                size,
                modified: modified_raw
                    .as_deref()
                    .and_then(|s| chrono::DateTime::parse_from_rfc2822(s.trim()).ok())
                    .map(|d| d.timestamp()),
            });
        }
        idx = end + "</d:response>".len();
    }
    out
}

fn take_between(s: &str, a: &str, b: &str) -> Option<String> {
    let lower = s.to_lowercase();
    let i = lower.find(a)? + a.len();
    let j = lower[i..].find(b)? + i;
    Some(s[i..j].to_string())
}
