//! Runs the production backend without creating a WebView. Useful for CI Native Messaging tests.
use tauri::Listener;
fn main() {
    if let Some(origin) = std::env::args().nth(1).filter(|arg| arg.starts_with("chrome-extension://")) {
        if let Err(error) = crowdash_extension_bridge::run_host(&origin, None) { eprintln!("{error}"); std::process::exit(1); }
        return;
    }
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let app = crowdash_lib::desktop_builder().build(context).expect("backend integration server");
    app.listen("job_event", |event| eprintln!("job_event: {}", event.payload()));
    app.run(|_, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event { api.prevent_exit(); }
    });
}
