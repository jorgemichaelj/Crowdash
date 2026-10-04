// hardware.rs — Detecção de GPU/encoder disponível

use serde::{Deserialize, Serialize};
use std::process::Command;

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
    let output = Command::new(&ffmpeg)
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

/// Localiza o binário ffmpeg no PATH ou em locais conhecidos
pub fn find_ffmpeg() -> String {
    // Primeiro: PATH padrão
    if which::which("ffmpeg").is_ok() {
        return "ffmpeg".to_string();
    }

    // Segundo: localização típica do winget/yt-dlp
    let candidates = [
        r"C:\Users\Michael\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe",
        r"C:\Program Files\yt-dlp\ffmpeg.exe",
        r"C:\Windows\yt-dlp\ffmpeg.exe",
    ];

    for candidate in &candidates {
        if std::path::Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }

    // Terceiro: procurar em AppData\Local\Microsoft\WinGet\Packages
    if let Some(local) = dirs::data_local_dir() {
        let winget_dir = local.join("Microsoft\\WinGet\\Packages");
        if let Ok(entries) = std::fs::read_dir(&winget_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.contains("ffmpeg") || name.contains("yt-dlp") {
                    let candidate = entry.path().join("ffmpeg.exe");
                    if candidate.exists() {
                        return candidate.to_string_lossy().to_string();
                    }
                    // Busca recursiva um nível mais fundo
                    if let Ok(sub) = std::fs::read_dir(entry.path()) {
                        for se in sub.flatten() {
                            let bin = se.path().join("bin").join("ffmpeg.exe");
                            if bin.exists() {
                                return bin.to_string_lossy().to_string();
                            }
                            let direct = se.path().join("ffmpeg.exe");
                            if direct.exists() {
                                return direct.to_string_lossy().to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    tracing::warn!("ffmpeg não encontrado — usando 'ffmpeg' e esperando que esteja no PATH");
    "ffmpeg".to_string()
}

/// Localiza o binário ffprobe
pub fn find_ffprobe() -> String {
    if which::which("ffprobe").is_ok() {
        return "ffprobe".to_string();
    }

    // Tentar no mesmo diretório do ffmpeg
    let ffmpeg_path = find_ffmpeg();
    if ffmpeg_path != "ffmpeg" {
        let probe = std::path::Path::new(&ffmpeg_path)
            .parent()
            .map(|p| p.join("ffprobe.exe"));
        if let Some(p) = probe {
            if p.exists() {
                return p.to_string_lossy().to_string();
            }
        }
    }

    "ffprobe".to_string()
}

/// Localiza yt-dlp
pub fn find_ytdlp() -> String {
    if which::which("yt-dlp").is_ok() {
        return "yt-dlp".to_string();
    }

    // Tentar localização winget
    let candidates = [
        r"C:\Users\Michael\AppData\Local\Microsoft\WinGet\Packages\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\yt-dlp.exe",
    ];

    for candidate in &candidates {
        if std::path::Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }

    if let Some(local) = dirs::data_local_dir() {
        let winget_dir = local.join("Microsoft\\WinGet\\Packages");
        if let Ok(entries) = std::fs::read_dir(&winget_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.starts_with("yt-dlp.yt-dlp") {
                    let candidate = entry.path().join("yt-dlp.exe");
                    if candidate.exists() {
                        return candidate.to_string_lossy().to_string();
                    }
                }
            }
        }
    }

    "yt-dlp".to_string()
}
