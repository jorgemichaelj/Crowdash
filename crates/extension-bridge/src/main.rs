//! Standalone protocol diagnostic host. The installed application uses the same library.
fn main() {
    let origin = std::env::args().nth(1).unwrap_or_default();
    if let Err(error) = crowdash_extension_bridge::run_host(&origin, None) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
