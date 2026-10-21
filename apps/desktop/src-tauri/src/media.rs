// media.rs — Análise de URLs e arquivos locais via yt-dlp e ffprobe

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;

use crate::hardware::{find_ffprobe, find_ytdlp};

// ─── Estruturas retornadas ao frontend ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VideoStream {
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AudioStream {
    pub codec: String,
    pub channels: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    pub source: String,
    pub title: String,
    #[serde(rename = "durationSec")]
    pub duration_sec: f64,
    #[serde(rename = "thumbnailUrl", skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<VideoStream>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<AudioStream>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<ImageInfo>,
    #[serde(rename = "estimatedSizeBytes", skip_serializing_if = "Option::is_none")]
    pub estimated_size_bytes: Option<u64>,
    #[serde(rename = "availableQualities", skip_serializing_if = "Option::is_none")]
    pub available_qualities: Option<Vec<String>>,
    #[serde(rename = "requiresLogin", skip_serializing_if = "Option::is_none")]
    pub requires_login: Option<bool>,
    pub suggestions: Vec<String>,
    #[serde(rename = "canStreamCopyTo", skip_serializing_if = "Option::is_none")]
    pub can_stream_copy_to: Option<Vec<String>>,
    // Coleções
    #[serde(rename = "collectionType", skip_serializing_if = "Option::is_none")]
    pub collection_type: Option<String>,
    #[serde(rename = "channelName", skip_serializing_if = "Option::is_none")]
    pub channel_name: Option<String>,
    #[serde(rename = "itemCount", skip_serializing_if = "Option::is_none")]
    pub item_count: Option<u32>,
    #[serde(rename = "canonicalUrl", skip_serializing_if = "Option::is_none")]
    pub canonical_url: Option<String>,
    #[serde(rename = "playlistUrl", skip_serializing_if = "Option::is_none")]
    pub playlist_url: Option<String>,
}

// ─── Análise de URL ───────────────────────────────────────────────────────────

pub async fn analyze_url(url: &str) -> Result<MediaInfo> {
    use crowdash_download_core::{classify_url, read_metadata, MediaUrl};
    let ytdlp = find_ytdlp();
    match classify_url(url)? {
        MediaUrl::Channel { url, name } => {
            // One flat entry is enough to resolve a channel name. Never enumerate its catalog here.
            let json = read_metadata(&ytdlp, &url, true).await?;
            let channel_name = json["channel"].as_str().or_else(|| json["uploader"].as_str()).unwrap_or(&name).to_string();
            Ok(MediaInfo {
                source: "url".into(), title: format!("Canal: {channel_name}"),
                channel_name: Some(channel_name), collection_type: Some("channel".into()),
                canonical_url: Some(url), suggestions: vec!["download".into()],
                ..MediaInfo::empty()
            })
        }
        MediaUrl::Playlist { url } => {
            let json = read_metadata(&ytdlp, &url, true).await?;
            // playlist_count is provider metadata; entries.len() is only our one-entry sample.
            let count = json["playlist_count"].as_u64().and_then(|n| u32::try_from(n).ok());
            Ok(MediaInfo {
                source: "url".into(), title: json["title"].as_str().unwrap_or("Playlist").into(),
                collection_type: Some("playlist".into()), item_count: count,
                canonical_url: Some(url), suggestions: vec!["download".into()],
                ..MediaInfo::empty()
            })
        }
        MediaUrl::Video { url, playlist_url } => {
            let json = read_metadata(&ytdlp, &url, false).await?;
            let mut info = parse_ytdlp_single_video(&json, &url)?;
            info.canonical_url = Some(url);
            info.playlist_url = playlist_url;
            Ok(info)
        }
    }
}

fn parse_ytdlp_single_video(json: &Value, _url: &str) -> Result<MediaInfo> {
    let title = json["title"].as_str().unwrap_or("Vídeo").to_string();
    let duration_sec = json["duration"].as_f64().unwrap_or(0.0);
    let thumbnail_url = json["thumbnail"].as_str().map(String::from);
    let ext = json["ext"].as_str().unwrap_or("mp4").to_string();
    let filesize = json["filesize"].as_u64().or_else(|| json["filesize_approx"].as_u64());

    // Extrair qualidades disponíveis
    let mut qualities: Vec<String> = vec!["best".to_string()];
    if let Some(formats) = json["formats"].as_array() {
        let mut heights: Vec<u32> = formats
            .iter()
            .filter_map(|f| f["height"].as_u64())
            .map(|h| h as u32)
            .collect();
        heights.sort();
        heights.dedup();
        for h in heights.iter().rev() {
            let q = match h {
                h if *h >= 1080 => "1080p",
                h if *h >= 720 => "720p",
                h if *h >= 480 => "480p",
                _ => continue,
            };
            if !qualities.contains(&q.to_string()) {
                qualities.push(q.to_string());
            }
        }
    }

    // Verificar se precisa login
    let requires_login = json["age_limit"].as_u64().map(|a| a >= 18).unwrap_or(false);

    // Streams de vídeo e áudio
    let video = Some(VideoStream {
        codec: json["vcodec"].as_str().unwrap_or("h264").replace("none", "h264"),
        width: json["width"].as_u64().unwrap_or(1920) as u32,
        height: json["height"].as_u64().unwrap_or(1080) as u32,
        fps: json["fps"].as_f64().unwrap_or(30.0),
    });

    let audio = Some(AudioStream {
        codec: json["acodec"].as_str().unwrap_or("aac").replace("none", "aac"),
        channels: 2,
    });

    Ok(MediaInfo {
        source: "url".to_string(),
        title,
        duration_sec,
        thumbnail_url,
        container: Some(ext.clone()),
        category: Some("video".to_string()),
        video,
        audio,
        estimated_size_bytes: filesize,
        available_qualities: Some(qualities),
        requires_login: if requires_login { Some(true) } else { None },
        suggestions: vec!["download".to_string()],
        can_stream_copy_to: Some(vec!["mp4".to_string(), "mkv".to_string()]),
        ..MediaInfo::empty()
    })
}

// ─── Análise de arquivo local (ffprobe) ───────────────────────────────────────

pub fn analyze_file(path: &str) -> Result<MediaInfo> {
    let lower = path.to_lowercase();
    let ext = std::path::Path::new(&lower)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    // Imagens: não precisam de ffprobe
    let image_exts = ["webp", "png", "jpg", "jpeg", "ico", "avif", "bmp", "gif", "tiff", "svg"];
    if image_exts.contains(&ext.as_str()) {
        return analyze_image_file(path, &ext);
    }

    // Áudio e vídeo: usar ffprobe
    let ffprobe = find_ffprobe();
    let output = Command::new(&ffprobe)
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .output()
        .map_err(|e| anyhow!("Falha ao executar ffprobe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("ffprobe falhou: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: Value = serde_json::from_str(&stdout)
        .map_err(|e| anyhow!("Falha ao parsear ffprobe JSON: {}", e))?;

    parse_ffprobe_output(&json, path, &ext)
}

fn analyze_image_file(path: &str, ext: &str) -> Result<MediaInfo> {
    let file_name = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("imagem")
        .to_string();

    let file_size = std::fs::metadata(path).ok().map(|m| m.len());

    // Tentar ler dimensões via ffprobe se disponível
    let (width, height) = read_image_dimensions_ffprobe(path).unwrap_or((0, 0));

    let suggestions = vec!["convert".to_string()];
    let can_copy = match ext {
        "png" => vec!["jpeg".to_string(), "webp".to_string(), "ico".to_string()],
        "jpg" | "jpeg" => vec!["png".to_string(), "webp".to_string()],
        "webp" => vec!["png".to_string(), "jpeg".to_string(), "ico".to_string()],
        _ => vec!["png".to_string(), "jpeg".to_string()],
    };

    Ok(MediaInfo {
        source: "file".to_string(),
        title: file_name,
        duration_sec: 0.0,
        container: Some(ext.to_string()),
        category: Some("image".to_string()),
        image: Some(ImageInfo { width, height }),
        estimated_size_bytes: file_size,
        suggestions,
        can_stream_copy_to: Some(can_copy),
        ..MediaInfo::empty()
    })
}

fn read_image_dimensions_ffprobe(path: &str) -> Option<(u32, u32)> {
    let ffprobe = find_ffprobe();
    let output = Command::new(&ffprobe)
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            path,
        ])
        .output()
        .ok()?;

    let json: Value = serde_json::from_slice(&output.stdout).ok()?;
    let streams = json["streams"].as_array()?;
    let video = streams.iter().find(|s| s["codec_type"] == "video")?;
    let w = video["width"].as_u64()? as u32;
    let h = video["height"].as_u64()? as u32;
    Some((w, h))
}

fn parse_ffprobe_output(json: &Value, path: &str, ext: &str) -> Result<MediaInfo> {
    let file_name = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("arquivo")
        .to_string();

    let format = &json["format"];
    let duration_sec = format["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);
    let file_size = format["size"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .or_else(|| std::fs::metadata(path).ok().map(|m| m.len()));
    let container_fmt = format["format_name"]
        .as_str()
        .unwrap_or(ext)
        .split(',')
        .next()
        .unwrap_or(ext)
        .to_string();

    let streams = json["streams"].as_array().cloned().unwrap_or_default();

    let mut video_stream: Option<VideoStream> = None;
    let mut audio_stream: Option<AudioStream> = None;

    for stream in &streams {
        match stream["codec_type"].as_str() {
            Some("video") if video_stream.is_none() => {
                let fps_str = stream["r_frame_rate"].as_str().unwrap_or("30/1");
                let fps = parse_fps(fps_str);
                video_stream = Some(VideoStream {
                    codec: stream["codec_name"].as_str().unwrap_or("h264").to_string(),
                    width: stream["width"].as_u64().unwrap_or(0) as u32,
                    height: stream["height"].as_u64().unwrap_or(0) as u32,
                    fps,
                });
            }
            Some("audio") if audio_stream.is_none() => {
                audio_stream = Some(AudioStream {
                    codec: stream["codec_name"].as_str().unwrap_or("aac").to_string(),
                    channels: stream["channels"].as_u64().unwrap_or(2) as u32,
                });
            }
            _ => {}
        }
    }

    let (category, suggestions, can_copy) = if video_stream.is_some() {
        let copy = match ext {
            "mkv" => vec!["mkv".to_string(), "mp4".to_string()],
            "mp4" => vec!["mp4".to_string(), "mkv".to_string()],
            _ => vec!["mp4".to_string()],
        };
        (
            "video",
            vec!["convert".to_string(), "compress".to_string(), "extractAudio".to_string()],
            copy,
        )
    } else {
        (
            "audio",
            vec!["convert".to_string()],
            vec!["mp3".to_string(), "m4a".to_string(), "wav".to_string()],
        )
    };

    Ok(MediaInfo {
        source: "file".to_string(),
        title: file_name,
        duration_sec,
        container: Some(container_fmt),
        category: Some(category.to_string()),
        video: video_stream,
        audio: audio_stream,
        estimated_size_bytes: file_size,
        suggestions,
        can_stream_copy_to: Some(can_copy),
        ..MediaInfo::empty()
    })
}

fn parse_fps(fps_str: &str) -> f64 {
    let parts: Vec<&str> = fps_str.split('/').collect();
    if parts.len() == 2 {
        let num = parts[0].parse::<f64>().unwrap_or(30.0);
        let den = parts[1].parse::<f64>().unwrap_or(1.0);
        if den > 0.0 { num / den } else { 30.0 }
    } else {
        fps_str.parse::<f64>().unwrap_or(30.0)
    }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

impl MediaInfo {
    pub fn empty() -> Self {
        MediaInfo {
            source: String::new(),
            title: String::new(),
            duration_sec: 0.0,
            thumbnail_url: None,
            container: None,
            category: None,
            video: None,
            audio: None,
            image: None,
            estimated_size_bytes: None,
            available_qualities: None,
            requires_login: None,
            suggestions: vec![],
            can_stream_copy_to: None,
            collection_type: None,
            channel_name: None,
            item_count: None,
            canonical_url: None,
            playlist_url: None,
        }
    }
}
