// FileMate AI — Tauri 2 backend.
// Each domain lives in its own module; this file wires them into the Tauri
// builder, opens the SQLite database and the Tantivy index, and registers
// every #[tauri::command] handler the frontend can call.

mod ai;
mod ai_analyze;
mod archive;
mod automation;
mod batch;
mod bookmarks;
mod cleanup;
mod cloud;
mod db;
mod disk;
mod encryption;
mod error;
mod fs;
mod oauth;
mod open_with;
mod preview;
mod recents;
mod search;
mod filename_index;
mod settings;
mod state;
mod tags;
mod terminal;
mod version;
mod watcher;
mod workspaces;

use crate::db::Db;
use crate::search::Index;
use crate::state::AppState;
use tauri::Manager;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "filemate_ai_lib=info,warn".into()),
        )
        .with_target(false)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("filemate"));
            std::fs::create_dir_all(&data_dir)?;
            let db = Db::open(&data_dir.join("filemate.db"))?;
            let index = Index::open(&data_dir.join("index"))?;
            let state = AppState::new(db, index);
            app.manage(state);
            // Restore persisted filename index, or scan $HOME in the
            // background so search is responsive shortly after launch.
            filename_index::spawn_startup_scan(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            // fs
            fs::list_dir,
            fs::home_dir,
            fs::list_user_dirs,
            fs::create_folder,
            fs::rename_entry,
            fs::delete_to_trash,
            fs::copy_entry,
            fs::move_entry,
            fs::metadata,
            fs::open_path,
            open_with::list_installed_apps,
            open_with::get_app_icon,
            open_with::open_with,
            open_with::open_with_dialog,
            open_with::reveal_in_folder,
            // disk
            disk::list_disks,
            cleanup::cache_dirs,
            cleanup::trash_stats,
            cleanup::clear_cache_dir,
            cleanup::empty_trash,
            cleanup::old_files_in,
            cleanup::clear_old_files_in,
            // settings
            settings::get_setting,
            settings::set_setting,
            settings::list_settings,
            // recents
            recents::touch_recent,
            recents::list_recents,
            recents::clear_recents,
            // bookmarks
            bookmarks::add_bookmark,
            bookmarks::remove_bookmark,
            bookmarks::list_bookmarks,
            bookmarks::reorder_bookmark,
            // tags
            tags::create_tag,
            tags::list_tags,
            tags::delete_tag,
            tags::assign_tag,
            tags::unassign_tag,
            tags::tags_of,
            tags::paths_with_tag,
            // workspaces
            workspaces::save_workspace,
            workspaces::list_workspaces,
            workspaces::update_workspace,
            workspaces::delete_workspace,
            // search
            search::index_directory,
            search::remove_path_from_index,
            search::search_index,
            search::search_filenames,
            filename_index::build_filename_index,
            filename_index::filename_index_status,
            filename_index::query_filename_index,
            // watcher
            watcher::watch_dir,
            watcher::unwatch,
            // automation
            automation::save_rule,
            automation::list_rules,
            automation::delete_rule,
            automation::run_rule,
            automation::list_automation_history,
            // version
            version::create_version,
            version::list_versions,
            version::restore_version,
            version::diff_versions,
            version::delete_version,
            // ai
            ai::ai_chat,
            ai::ai_chat_stream,
            ai::ai_embed,
            ai::ai_parse_intent,
            ai::ai_health,
            ai::ai_provider_save,
            ai::ai_provider_list,
            ai::ai_provider_delete,
            ai::ai_provider_set_active,
            ai::ai_provider_test,
            ai_analyze::analyze_folder_summary,
            ai_analyze::analyze_folder,
            ai_analyze::analyze_folder_stream,
            // cloud
            cloud::add_cloud_account,
            cloud::list_cloud_accounts,
            cloud::delete_cloud_account,
            cloud::cloud_list,
            cloud::cloud_download,
            cloud::cloud_upload,
            cloud::cloud_delete,
            cloud::cloud_presigned,
            // oauth
            oauth::oauth_start,
            // encryption
            encryption::encrypt_file,
            encryption::decrypt_file,
            encryption::encrypt_text,
            encryption::decrypt_text,
            // archive
            archive::list_zip,
            archive::extract_zip,
            archive::create_zip,
            // batch
            batch::batch_rename_preview,
            batch::batch_rename_apply,
            batch::find_duplicates,
            batch::sha256_file,
            // terminal
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            // preview
            preview::preview_file,
            preview::read_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FileMate AI");
}
