// Generic OAuth 2.0 helper used by the cloud providers.
// Implements the Authorization Code with PKCE flow against a localhost
// loopback redirect, which works for OneDrive, Google Drive, and Dropbox.
//
// Frontend calls `oauth_start` to receive an `auth_url`, opens it in the
// system browser, and the user's browser is redirected back to
// http://127.0.0.1:<port>/callback where this module captures the code,
// exchanges it for tokens, and returns them.

use crate::error::{AppError, AppResult};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OAuthFlow {
    pub provider: String,
    pub client_id: String,
    pub authorize_url: String,
    pub token_url: String,
    pub redirect_uri: String,
    pub scope: String,
    #[serde(default)]
    pub client_secret: Option<String>,
    #[serde(default)]
    pub extra: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
    pub scope: Option<String>,
    pub token_type: Option<String>,
}

fn random_b64(len: usize) -> String {
    let mut buf = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(&buf)
}

fn pkce_pair() -> (String, String) {
    let verifier = random_b64(64);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

#[tauri::command]
pub async fn oauth_start(app: AppHandle, flow: OAuthFlow) -> AppResult<OAuthTokens> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| AppError::Other(e.to_string()))?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::Other(e.to_string()))?
        .port();
    listener
        .set_nonblocking(true)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let redirect = format!("http://127.0.0.1:{port}{}", "/callback");

    let (verifier, challenge) = pkce_pair();
    let state = random_b64(16);

    let mut url = url::Url::parse(&flow.authorize_url).map_err(|e| AppError::Other(e.to_string()))?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("client_id", &flow.client_id);
        q.append_pair("response_type", "code");
        q.append_pair("redirect_uri", &redirect);
        q.append_pair("scope", &flow.scope);
        q.append_pair("code_challenge", &challenge);
        q.append_pair("code_challenge_method", "S256");
        q.append_pair("state", &state);
        for (k, v) in &flow.extra {
            q.append_pair(k, v);
        }
    }
    let _ = app.emit("oauth:open_url", url.as_str());
    let _ = opener::open_browser(url.as_str());

    let deadline = std::time::Instant::now() + Duration::from_secs(300);
    let listener = Arc::new(listener);
    let captured = loop {
        if std::time::Instant::now() > deadline {
            return Err(AppError::Other("oauth timeout".into()));
        }
        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(captured) = handle_callback(stream) {
                    break captured;
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(AppError::Io(e)),
        }
    };

    if captured.state != state {
        return Err(AppError::Other("oauth state mismatch".into()));
    }

    let mut form: Vec<(&str, String)> = vec![
        ("grant_type", "authorization_code".to_string()),
        ("code", captured.code.clone()),
        ("client_id", flow.client_id.clone()),
        ("redirect_uri", redirect.clone()),
        ("code_verifier", verifier),
    ];
    if let Some(sec) = &flow.client_secret {
        form.push(("client_secret", sec.clone()));
    }
    let res = reqwest::Client::new()
        .post(&flow.token_url)
        .form(&form)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;
    let status = res.status();
    let body: serde_json::Value = res.json().await.map_err(|e| AppError::Other(e.to_string()))?;
    if !status.is_success() {
        return Err(AppError::Other(format!("token endpoint {status}: {body}")));
    }
    let access_token = body
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Other("no access_token".into()))?
        .to_string();
    let refresh_token = body
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(String::from);
    let expires_in = body.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3600);
    Ok(OAuthTokens {
        access_token,
        refresh_token,
        expires_at: chrono::Utc::now().timestamp() + expires_in,
        scope: body.get("scope").and_then(|v| v.as_str()).map(String::from),
        token_type: body.get("token_type").and_then(|v| v.as_str()).map(String::from),
    })
}

struct Captured {
    code: String,
    state: String,
}

fn handle_callback(mut stream: TcpStream) -> Option<Captured> {
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    reader.read_line(&mut request_line).ok()?;
    let path = request_line.split_whitespace().nth(1)?.to_string();
    // discard rest of request
    let mut buf = [0u8; 1024];
    while let Ok(n) = (&mut reader).read(&mut buf) {
        if n < buf.len() {
            break;
        }
    }
    let url = url::Url::parse(&format!("http://localhost{path}")).ok()?;
    let mut code = None;
    let mut state = None;
    for (k, v) in url.query_pairs() {
        if k == "code" {
            code = Some(v.to_string());
        } else if k == "state" {
            state = Some(v.to_string());
        }
    }
    let html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Done</title></head><body style='font-family: -apple-system, sans-serif; padding: 40px; text-align:center;'><h2>FileMate AI 已获取授权</h2><p>你可以关闭本窗口返回应用。</p></body></html>";
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    Some(Captured {
        code: code?,
        state: state?,
    })
}
