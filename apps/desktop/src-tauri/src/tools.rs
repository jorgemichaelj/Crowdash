//! Resolve installed tools before any machine-wide PATH entry.
use std::{path::{Path, PathBuf}, sync::OnceLock};

static RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn command(binary: impl AsRef<std::ffi::OsStr>) -> std::process::Command {
    let command = std::process::Command::new(binary);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        let mut command = command;
        command.creation_flags(0x08000000);
        return command;
    }
    #[cfg(not(windows))]
    command
}

pub fn configure(resource_dir: PathBuf) {
    let _ = RESOURCE_DIR.set(resource_dir);
}

fn from_bundle(resource_dir: &Path, name: &str) -> Option<PathBuf> {
    let file = resource_dir.join("runtime").join(format!("{name}.exe"));
    file.is_file().then_some(file)
}

pub fn find(name: &str) -> String {
    if let Some(path) = RESOURCE_DIR.get().and_then(|dir| from_bundle(dir, name)) {
        return path.to_string_lossy().into_owned();
    }
    which::which(name).map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| name.into())
}

pub fn ytdlp_args() -> Vec<String> {
    let mut args = Vec::new();
    let ffmpeg = PathBuf::from(find("ffmpeg"));
    if ffmpeg.is_file() {
        args.extend(["--ffmpeg-location".into(), ffmpeg.to_string_lossy().into_owned()]);
    }
    let deno = PathBuf::from(find("deno"));
    if deno.is_file() {
        args.extend(["--js-runtimes".into(), format!("deno:{}", deno.display())]);
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn packaged_tools_are_found_in_install_paths_containing_spaces() {
        let root = std::env::temp_dir().join(format!("CrowDash tools {}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("runtime")).unwrap();
        std::fs::write(root.join("runtime/ffmpeg.exe"), b"test fixture").unwrap();
        assert_eq!(from_bundle(&root, "ffmpeg"), Some(root.join("runtime/ffmpeg.exe")));
        assert_eq!(from_bundle(&root, "ffprobe"), None);
        std::fs::remove_dir_all(root).unwrap();
    }
}
