// FileMate AI — Tauri backend
// Frontend talks to Rust via #[tauri::command] handlers.
// Real file-system / AI / version-control logic will be added incrementally.

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![app_version])
        .run(tauri::generate_context!())
        .expect("error while running FileMate AI");
}
