// PTY-backed terminal sessions. Frontend opens a session, receives
// `terminal:data` events with raw output, and writes input via
// `terminal_write`. Sessions are addressed by id (uuid string).

use crate::error::{AppError, AppResult};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::Read;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn std::io::Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

static SESSIONS: Lazy<Mutex<HashMap<String, Arc<Mutex<Session>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn terminal_open(
    app: AppHandle,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> AppResult<String> {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: rows.unwrap_or(40),
            cols: cols.unwrap_or(120),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Other(e.to_string()))?;

    let shell = if cfg!(target_os = "windows") {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    };
    let mut cmd = CommandBuilder::new(shell);
    if let Some(cwd) = cwd {
        cmd.cwd(cwd);
    }
    let child = pair.slave.spawn_command(cmd).map_err(|e| AppError::Other(e.to_string()))?;
    drop(pair.slave);

    let id = Uuid::new_v4().to_string();
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::Other(e.to_string()))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| AppError::Other(e.to_string()))?;

    let session = Arc::new(Mutex::new(Session {
        master: pair.master,
        writer,
        child,
    }));
    SESSIONS.lock().insert(id.clone(), Arc::clone(&session));

    let id_for_thread = id.clone();
    let app_for_thread = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_for_thread.emit(
                        "terminal:data",
                        serde_json::json!({"id": id_for_thread, "data": chunk}),
                    );
                }
            }
        }
        let _ = app_for_thread.emit(
            "terminal:exit",
            serde_json::json!({"id": id_for_thread}),
        );
        SESSIONS.lock().remove(&id_for_thread);
    });

    Ok(id)
}

#[tauri::command]
pub async fn terminal_write(id: String, data: String) -> AppResult<()> {
    let session = SESSIONS
        .lock()
        .get(&id)
        .cloned()
        .ok_or_else(|| AppError::Other("session not found".into()))?;
    let mut s = session.lock();
    use std::io::Write;
    s.writer
        .write_all(data.as_bytes())
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_resize(id: String, cols: u16, rows: u16) -> AppResult<()> {
    let session = SESSIONS
        .lock()
        .get(&id)
        .cloned()
        .ok_or_else(|| AppError::Other("session not found".into()))?;
    let s = session.lock();
    s.master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_close(id: String) -> AppResult<()> {
    if let Some(session) = SESSIONS.lock().remove(&id) {
        let mut s = session.lock();
        let _ = s.child.kill();
    }
    Ok(())
}
