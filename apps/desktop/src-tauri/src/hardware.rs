// hardware.rs — Detecção de GPU/encoder disponível

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareInfo {
    pub gpu: String,    // "nvidia" | "amd" | "intel" | "none"
    pub encoder: String, // "nvenc" | "amf" | "qsv" | "cpu"
}

impl Default for HardwareInfo {
    fn default() -> Self {
        HardwareInfo {
            gpu: "none".to_string(),
            encoder: "cpu".to_string(),
        }
    }
}

/// Test actual encoding support; listing encoders only reports compile-time features.
pub fn detect_hardware() -> HardwareInfo {
    static HARDWARE: std::sync::OnceLock<HardwareInfo> = std::sync::OnceLock::new();
    HARDWARE.get_or_init(probe_hardware).clone()
}

fn probe_hardware() -> HardwareInfo {
    let output = crate::tools::command(find_ffmpeg()).args(["-hide_banner", "-encoders"]).output();
    let Ok(output) = output else { return HardwareInfo::default(); };
    let available = String::from_utf8_lossy(&output.stdout);
    for (codec, gpu, encoder) in [("h264_nvenc", "nvidia", "nvenc"), ("h264_amf", "amd", "amf"), ("h264_qsv", "intel", "qsv")] {
        if !available.contains(codec) { continue; }
        let child = crate::tools::command(find_ffmpeg())
            .args(["-v", "error", "-f", "lavfi", "-i", "color=black:s=128x128:r=1", "-frames:v", "1", "-an", "-c:v", codec, "-f", "null", "-"])
            .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn();
        let Ok(mut child) = child else { continue; };
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        loop {
            match child.try_wait() {
                Ok(Some(status)) if status.success() => return HardwareInfo { gpu: gpu.into(), encoder: encoder.into() },
                Ok(Some(_)) => break,
                Err(_) => { let _ = child.kill(); let _ = child.wait(); break; },
                _ if std::time::Instant::now() >= deadline => { let _ = child.kill(); let _ = child.wait(); break; },
                _ => std::thread::sleep(std::time::Duration::from_millis(25)),
            }
        }
    }
    HardwareInfo::default()
}

/// Installed binaries take priority; development can use tools from PATH.
pub fn find_ffmpeg() -> String { crate::tools::find("ffmpeg") }
pub fn find_ffprobe() -> String { crate::tools::find("ffprobe") }
pub fn find_ytdlp() -> String { crate::tools::find("yt-dlp") }
