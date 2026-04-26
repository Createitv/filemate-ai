// Cross-platform file system watcher built on `notify` (FSEvents on macOS,
// ReadDirectoryChangesW on Windows, inotify on Linux). Events are debounced
// then forwarded to the frontend over the `fs:event` Tauri event channel.
//
// The same event stream feeds the automation engine, so creating a rule that
// watches a folder doesn't need a second OS-level watcher.

use crate::error::AppResult;
use crate::state::AppState;
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FsEvent {
    Created { path: String },
    Modified { path: String },
    Removed { path: String },
    Renamed { from: String, to: String },
    Other { path: String },
}

pub struct WatcherHandle {
    pub root: PathBuf,
    pub stop_tx: mpsc::Sender<()>,
}

#[tauri::command]
pub async fn watch_dir(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> AppResult<()> {
    stop_existing(&state);
    let p = PathBuf::from(&path);
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let app_for_thread = app.clone();
    let watch_path = p.clone();

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<DebounceEventResult>();
        let mut debouncer = match new_debouncer(Duration::from_millis(250), None, move |res| {
            let _ = tx.send(res);
        }) {
            Ok(d) => d,
            Err(e) => {
                tracing::error!("watcher init failed: {e}");
                return;
            }
        };
        if let Err(e) = debouncer.watcher().watch(&watch_path, RecursiveMode::Recursive) {
            tracing::error!("watch failed: {e}");
            return;
        }

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(events)) => {
                    for ev in events {
                        for fe in to_fs_events(&ev.event, &ev.paths) {
                            let _ = app_for_thread.emit("fs:event", &fe);
                            // forward to automation engine + filename index (best-effort)
                            if let Some(state) = app_for_thread.try_state::<AppState>() {
                                crate::automation::on_event(&app_for_thread, &state, &fe);
                                state.filename_index.apply_event(&fe);
                            }
                        }
                    }
                }
                Ok(Err(errs)) => {
                    for e in errs {
                        tracing::warn!("watcher errors: {e:?}");
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => break,
            }
        }
    });

    *state.watcher.lock() = Some(WatcherHandle {
        root: p,
        stop_tx,
    });
    Ok(())
}

#[tauri::command]
pub async fn unwatch(state: State<'_, AppState>) -> AppResult<()> {
    stop_existing(&state);
    Ok(())
}

fn stop_existing(state: &AppState) {
    if let Some(handle) = state.watcher.lock().take() {
        let _ = handle.stop_tx.send(());
    }
}

fn to_fs_events(event: &notify::Event, paths: &[PathBuf]) -> Vec<FsEvent> {
    use notify::EventKind::*;
    let to_str = |p: &Path| p.to_string_lossy().to_string();
    match &event.kind {
        Create(_) => paths.iter().map(|p| FsEvent::Created { path: to_str(p) }).collect(),
        Modify(notify::event::ModifyKind::Name(_)) if paths.len() == 2 => vec![FsEvent::Renamed {
            from: to_str(&paths[0]),
            to: to_str(&paths[1]),
        }],
        Modify(_) => paths.iter().map(|p| FsEvent::Modified { path: to_str(p) }).collect(),
        Remove(_) => paths.iter().map(|p| FsEvent::Removed { path: to_str(p) }).collect(),
        _ => paths.iter().map(|p| FsEvent::Other { path: to_str(p) }).collect(),
    }
}
