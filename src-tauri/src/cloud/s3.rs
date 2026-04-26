// Real S3 / S3-compatible provider built on the `s3` crate (rust-s3).
// Account config schema:
//   { "endpoint": "https://s3.us-east-1.amazonaws.com",
//     "region":   "us-east-1",
//     "bucket":   "my-bucket",
//     "access_key": "...",
//     "secret_key": "...",
//     "path_style": false }

use super::{CloudFile, CloudProvider};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use s3::creds::Credentials;
use s3::{Bucket, Region};
use serde::Deserialize;
use std::path::Path;
use std::time::Duration;

#[derive(Deserialize, Debug)]
struct Config {
    endpoint: String,
    region: String,
    bucket: String,
    access_key: String,
    secret_key: String,
    #[serde(default)]
    path_style: bool,
}

pub struct S3Provider {
    bucket: Bucket,
}

impl S3Provider {
    pub fn from_config(cfg: &serde_json::Value) -> AppResult<Self> {
        let parsed: Config = serde_json::from_value(cfg.clone())
            .map_err(|e| AppError::Other(format!("invalid s3 config: {e}")))?;
        let region = Region::Custom {
            region: parsed.region.clone(),
            endpoint: parsed.endpoint.clone(),
        };
        let creds = Credentials::new(
            Some(&parsed.access_key),
            Some(&parsed.secret_key),
            None,
            None,
            None,
        )
        .map_err(|e| AppError::Other(e.to_string()))?;
        let mut bucket = Bucket::new(&parsed.bucket, region, creds)
            .map_err(|e| AppError::Other(e.to_string()))?;
        if parsed.path_style {
            bucket.set_path_style();
        }
        Ok(Self { bucket: *bucket })
    }
}

#[async_trait]
impl CloudProvider for S3Provider {
    async fn list(&self, path: &str) -> AppResult<Vec<CloudFile>> {
        let prefix = path.trim_start_matches('/').to_string();
        let results = self
            .bucket
            .list(prefix, Some("/".to_string()))
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        let mut out = Vec::new();
        for r in results {
            for cp in r.common_prefixes.unwrap_or_default() {
                out.push(CloudFile {
                    id: cp.prefix.clone(),
                    name: cp.prefix.trim_end_matches('/').rsplit('/').next().unwrap_or("").to_string(),
                    path: cp.prefix.clone(),
                    is_dir: true,
                    size: 0,
                    modified: None,
                });
            }
            for o in r.contents {
                out.push(CloudFile {
                    id: o.key.clone(),
                    name: o.key.rsplit('/').next().unwrap_or("").to_string(),
                    path: o.key.clone(),
                    is_dir: false,
                    size: o.size,
                    modified: chrono::DateTime::parse_from_rfc3339(&o.last_modified)
                        .ok()
                        .map(|dt| dt.timestamp()),
                });
            }
        }
        Ok(out)
    }

    async fn download(&self, path: &str, to_local: &Path) -> AppResult<()> {
        let key = path.trim_start_matches('/');
        if let Some(parent) = to_local.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = tokio::fs::File::create(to_local)
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        self.bucket
            .get_object_to_writer(key, &mut out)
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        Ok(())
    }

    async fn upload(&self, from_local: &Path, remote_path: &str) -> AppResult<()> {
        let key = remote_path.trim_start_matches('/');
        let bytes = tokio::fs::read(from_local)
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        let mime = mime_guess::from_path(from_local)
            .first_or_octet_stream()
            .to_string();
        self.bucket
            .put_object_with_content_type(key, &bytes, &mime)
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        Ok(())
    }

    async fn delete(&self, path: &str) -> AppResult<()> {
        let key = path.trim_start_matches('/');
        self.bucket
            .delete_object(key)
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        Ok(())
    }

    async fn presigned_url(&self, path: &str, expires_secs: u64) -> AppResult<String> {
        let key = path.trim_start_matches('/');
        self.bucket
            .presign_get(key, expires_secs as u32, None)
            .await
            .map_err(|e| AppError::Other(e.to_string()))
    }
}

#[allow(dead_code)]
fn _ensure_send() {
    fn assert_send<T: Send>() {}
    assert_send::<S3Provider>();
    let _ = Duration::from_secs(0);
}
