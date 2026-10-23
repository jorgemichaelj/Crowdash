#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]
fn main() {
    if let Some(origin) = std::env::args().nth(1).filter(|arg| arg.starts_with("chrome-extension://")) {
        let executable = std::env::current_exe().ok();
        if let Err(error) = crowdash_extension_bridge::run_host(&origin, executable.as_deref()) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    crowdash_lib::run();
}
