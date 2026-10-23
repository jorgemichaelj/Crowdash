// Crowdash — Backend Tauri 2
// Módulo raiz: registra todos os submodulos e monta o app Tauri

mod commands;
mod jobs;
mod media;
mod settings;
mod hardware;
mod extension;

use tauri::Manager;
use jobs::JobManager;
use settings::SettingsStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "crowdash=debug,warn".into()),
        )
        .init();

    desktop_builder()
        .run(tauri::generate_context!())
        .expect("Erro ao iniciar o Crowdash");
}

/// Shared production builder, also usable by the headless backend integration runner.
pub fn desktop_builder() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let settings = SettingsStore::load(app.handle()).unwrap_or_default();
            let job_manager = JobManager::new(app.handle().clone(), settings.settings.clone());
            app.manage(std::sync::Arc::new(tokio::sync::Mutex::new(settings)));
            app.manage(std::sync::Arc::new(tokio::sync::Mutex::new(job_manager)));
            extension::start(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            extension::extension_setup,
            extension::connect_extension,
            extension::open_extension_folder,
            extension::take_extension_action,
            commands::analyze_url,
            commands::analyze_file,
            commands::enqueue_job,
            commands::cancel_job,
            commands::retry_job,
            commands::remove_job,
            commands::list_jobs,
            commands::get_settings,
            commands::update_settings,
            commands::get_hardware_info,
            commands::check_for_update,
            commands::reveal_in_folder,
        ])
}
