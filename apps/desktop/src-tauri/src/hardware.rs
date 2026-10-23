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

/// Tenta detectar GPU via ffmpeg -encoders
pub fn detect_hardware() -> HardwareInfo {
    let ffmpeg = find_ffmpeg();
    let output = crate::tools::command(&ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .output();

    let Ok(output) = output else {
        tracing::warn!("ffmpeg não encontrado ou falhou — usando CPU");
        return HardwareInfo::default();
    };

    let text = String::from_utf8_lossy(&output.stdout).to_lowercase();

    if text.contains("h264_nvenc") {
        tracing::info!("GPU detectada: NVIDIA (NVENC)");
        return HardwareInfo {
            gpu: "nvidia".to_string(),
            encoder: "nvenc".to_string(),
        };
    }

    if text.contains("h264_amf") {
        tracing::info!("GPU detectada: AMD (AMF)");
        return HardwareInfo {
            gpu: "amd".to_string(),
            encoder: "amf".to_string(),
        };
    }

    if text.contains("h264_qsv") {
        tracing::info!("GPU detectada: Intel (QSV)");
        return HardwareInfo {
            gpu: "intel".to_string(),
            encoder: "qsv".to_string(),
        };
    }

    tracing::info!("Nenhuma GPU de hardware detectada — usando CPU");
    HardwareInfo::default()
}

/// Installed binaries take priority; development can use tools from PATH.
pub fn find_ffmpeg() -> String { crate::tools::find("ffmpeg") }
pub fn find_ffprobe() -> String { crate::tools::find("ffprobe") }
pub fn find_ytdlp() -> String { crate::tools::find("yt-dlp") }
