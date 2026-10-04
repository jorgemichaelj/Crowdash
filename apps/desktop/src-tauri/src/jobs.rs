// jobs.rs — Gerenciador de fila de jobs, spawn de FFmpeg/yt-dlp, eventos via Tauri

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use chrono::Utc;

use crate::settings::AppSettings;
use crate::hardware::{find_ffmpeg, find_ytdlp, find_ffprobe};

// ─── Tipos de Jobs ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserFacingError {
    pub code: String,
    pub title: String,
    pub message: String,
    #[serde(rename = "technicalDetails", skip_serializing_if = "Option::is_none")]
    pub technical_details: Option<String>,
    pub retryable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadOptions {
    pub mode: String,    // "video" | "audio"
    pub quality: String, // "best" | "1080p" | "720p" | "480p"
    pub container: String, // "mp4" | "mkv" | "mp3" | "m4a"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperationOptions {
    pub op: String, // "convert" | "trim" | "compress" | "extractAudio"
    // convert
    pub container: Option<String>,
    pub category: Option<String>,
    // trim
    #[serde(rename = "startSec")]
    pub start_sec: Option<f64>,
    #[serde(rename = "endSec")]
    pub end_sec: Option<f64>,
    pub precise: Option<bool>,
    // compress
    #[serde(rename = "targetSizeMB")]
    pub target_size_mb: Option<f64>,
    // extractAudio
    pub format: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum JobInput {
    Url {
        url: String,
        title: Option<String>,
        options: DownloadOptions,
    },
    File {
        path: String,
        name: Option<String>,
        options: FileOperationOptions,
    },
    Batch {
        title: String,
        #[serde(rename = "itemCount")]
        item_count: u32,
        #[serde(rename = "batchType")]
        batch_type: String,
        options: DownloadOptions,
        // URL do canal/playlist (passada como campo extra)
        url: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    #[serde(rename = "type")]
    pub job_type: String,
    pub status: JobStatus,
    pub origin: String,
    pub input: JobInput,
    #[serde(rename = "outputPath", skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    pub progress: f64,
    #[serde(rename = "speedBytesPerSec", skip_serializing_if = "Option::is_none")]
    pub speed_bytes_per_sec: Option<u64>,
    #[serde(rename = "etaSeconds", skip_serializing_if = "Option::is_none")]
    pub eta_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<UserFacingError>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "startedAt", skip_serializing_if = "Option::is_none")]
    pub started_at: Option<i64>,
    #[serde(rename = "finishedAt", skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<i64>,
    pub logs: Vec<String>,
}

// ─── Eventos emitidos ao frontend ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JobEvent {
    Started { #[serde(rename = "jobId")] job_id: String },
    Progress {
        #[serde(rename = "jobId")] job_id: String,
        progress: f64,
        #[serde(rename = "speedBytesPerSec", skip_serializing_if = "Option::is_none")]
        speed_bytes_per_sec: Option<u64>,
        #[serde(rename = "etaSeconds", skip_serializing_if = "Option::is_none")]
        eta_seconds: Option<u64>,
    },
    Completed {
        #[serde(rename = "jobId")] job_id: String,
        #[serde(rename = "outputPath")] output_path: String,
    },
    Error {
        #[serde(rename = "jobId")] job_id: String,
        error: UserFacingError,
    },
    Cancelled { #[serde(rename = "jobId")] job_id: String },
}

// ─── JobManager ───────────────────────────────────────────────────────────────

pub struct JobManager {
    jobs: HashMap<String, Job>,
    app: AppHandle,
    pub settings: AppSettings,
    pub running_pid: Option<u32>, // PID do processo filho atual
}

impl JobManager {
    pub fn new(app: AppHandle, settings: AppSettings) -> Self {
        JobManager {
            jobs: HashMap::new(),
            app,
            settings,
            running_pid: None,
        }
    }

    pub fn list_jobs(&self) -> Vec<Job> {
        let mut jobs: Vec<Job> = self.jobs.values().cloned().collect();
        jobs.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        jobs
    }

    pub fn enqueue(&mut self, input: JobInput, origin: &str) -> Job {
        let job_type = match &input {
            JobInput::Url { .. } => "download",
            JobInput::File { options, .. } => &options.op,
            JobInput::Batch { .. } => "batchDownload",
        }
        .to_string();

        let job = Job {
            id: format!("job_{}", Uuid::new_v4().to_string().replace("-", "")[..8].to_string()),
            job_type,
            status: JobStatus::Pending,
            origin: origin.to_string(),
            input,
            output_path: None,
            progress: 0.0,
            speed_bytes_per_sec: None,
            eta_seconds: None,
            encoder: None,
            error: None,
            created_at: Utc::now().timestamp_millis(),
            started_at: None,
            finished_at: None,
            logs: vec![format!(
                "[{}] Tarefa criada e adicionada à fila.",
                chrono::Local::now().format("%H:%M:%S")
            )],
        };

        let id = job.id.clone();
        self.jobs.insert(id.clone(), job.clone());
        job
    }

    pub fn get_job_mut(&mut self, id: &str) -> Option<&mut Job> {
        self.jobs.get_mut(id)
    }

    pub fn get_job(&self, id: &str) -> Option<&Job> {
        self.jobs.get(id)
    }

    pub fn remove_job(&mut self, id: &str) {
        self.jobs.remove(id);
    }

    pub fn next_pending(&self) -> Option<String> {
        let mut jobs: Vec<&Job> = self.jobs.values()
            .filter(|j| j.status == JobStatus::Pending)
            .collect();
        jobs.sort_by_key(|j| j.created_at);
        jobs.first().map(|j| j.id.clone())
    }

    pub fn any_running(&self) -> bool {
        self.jobs.values().any(|j| j.status == JobStatus::Running)
    }

    pub fn update_settings(&mut self, settings: AppSettings) {
        self.settings = settings;
    }

    pub fn emit_event(&self, event: JobEvent) {
        if let Err(e) = self.app.emit("job_event", &event) {
            tracing::error!("Falha ao emitir evento: {}", e);
        }
    }
}

// ─── Lógica de execução (chamada de forma assíncrona) ─────────────────────────

pub async fn run_job(
    job_id: String,
    manager: Arc<Mutex<JobManager>>,
) {
    // Marcar como running
    {
        let mut mgr = manager.lock().await;
        if let Some(job) = mgr.get_job_mut(&job_id) {
            job.status = JobStatus::Running;
            job.started_at = Some(Utc::now().timestamp_millis());
            job.logs.push(format!(
                "[{}] Iniciando processamento...",
                chrono::Local::now().format("%H:%M:%S")
            ));
        }
        let event = JobEvent::Started { job_id: job_id.clone() };
        mgr.emit_event(event);
    }

    // Obter dados do job
    let (input, output_folder, hw_accel) = {
        let mgr = manager.lock().await;
        let job = match mgr.get_job(&job_id) {
            Some(j) => j.clone(),
            None => return,
        };
        (job.input.clone(), mgr.settings.output_folder.clone(), mgr.settings.hardware_acceleration.clone())
    };

    let result = match &input {
        JobInput::Url { url, options, .. } => {
            run_download_job(&job_id, url, options, &output_folder, manager.clone()).await
        }
        JobInput::File { path, options, .. } => {
            run_file_job(&job_id, path, options, &output_folder, &hw_accel, manager.clone()).await
        }
        JobInput::Batch { url, options, title, batch_type, .. } => {
            let url = url.clone().unwrap_or_default();
            run_batch_job(&job_id, &url, options, &output_folder, batch_type, manager.clone()).await
        }
    };

    // Processar resultado
    {
        let mut mgr = manager.lock().await;
        match result {
            Ok(output_path) => {
                if let Some(job) = mgr.get_job_mut(&job_id) {
                    if job.status == JobStatus::Cancelled {
                        return;
                    }
                    job.status = JobStatus::Completed;
                    job.progress = 100.0;
                    job.output_path = Some(output_path.clone());
                    job.finished_at = Some(Utc::now().timestamp_millis());
                    job.logs.push(format!(
                        "[{}] Concluído. Arquivo: {}",
                        chrono::Local::now().format("%H:%M:%S"),
                        output_path
                    ));
                }
                mgr.emit_event(JobEvent::Completed {
                    job_id: job_id.clone(),
                    output_path,
                });
            }
            Err(e) => {
                let error_str = e.to_string();
                let user_error = map_error_to_user_facing(&error_str);

                if let Some(job) = mgr.get_job_mut(&job_id) {
                    if job.status == JobStatus::Cancelled {
                        return;
                    }
                    job.status = JobStatus::Failed;
                    job.error = Some(user_error.clone());
                    job.finished_at = Some(Utc::now().timestamp_millis());
                    job.logs.push(format!(
                        "[{}] Erro: {}",
                        chrono::Local::now().format("%H:%M:%S"),
                        error_str
                    ));
                }
                mgr.emit_event(JobEvent::Error {
                    job_id: job_id.clone(),
                    error: user_error,
                });
            }
        }
    }
}

// ─── Download (yt-dlp) ────────────────────────────────────────────────────────

async fn run_download_job(
    job_id: &str,
    url: &str,
    options: &DownloadOptions,
    output_folder: &str,
    manager: Arc<Mutex<JobManager>>,
) -> Result<String> {
    let ytdlp = find_ytdlp();
    let output_template = format!("{}\\%(title)s.%(ext)s", output_folder);

    // Montar argumentos do yt-dlp
    let mut args: Vec<String> = vec![
        "--no-warnings".to_string(),
        "--progress".to_string(),
        "--newline".to_string(),
        "--no-playlist".to_string(),
    ];

    if options.mode == "audio" {
        args.extend([
            "-x".to_string(),
            "--audio-format".to_string(),
            options.container.clone(),
            "--audio-quality".to_string(),
            "0".to_string(),
        ]);
    } else {
        // Qualidade de vídeo
        let format_str = match options.quality.as_str() {
            "1080p" => "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
            "720p"  => "bestvideo[height<=720]+bestaudio/best[height<=720]",
            "480p"  => "bestvideo[height<=480]+bestaudio/best[height<=480]",
            _       => "bestvideo+bestaudio/best",
        };
        args.extend([
            "-f".to_string(),
            format_str.to_string(),
            "--merge-output-format".to_string(),
            options.container.clone(),
        ]);
    }

    args.extend([
        "-o".to_string(),
        output_template.clone(),
        url.to_string(),
    ]);

    emit_log(job_id, &format!("yt-dlp {}", args.join(" ")), manager.clone()).await;

    run_with_progress(job_id, &ytdlp, &args, ProgressParser::YtDlp, manager.clone()).await?;

    // Descobrir arquivo de saída
    let output_file = find_latest_file(output_folder)?;
    Ok(output_file)
}

// ─── Batch Download (canal/playlist) ─────────────────────────────────────────

async fn run_batch_job(
    job_id: &str,
    url: &str,
    options: &DownloadOptions,
    output_folder: &str,
    batch_type: &str,
    manager: Arc<Mutex<JobManager>>,
) -> Result<String> {
    let ytdlp = find_ytdlp();
    let output_template = format!("{}\\%(playlist_title)s\\%(playlist_index)s - %(title)s.%(ext)s", output_folder);

    let mut args: Vec<String> = vec![
        "--no-warnings".to_string(),
        "--progress".to_string(),
        "--newline".to_string(),
        "--yes-playlist".to_string(),
    ];

    if options.mode == "audio" {
        args.extend([
            "-x".to_string(),
            "--audio-format".to_string(),
            options.container.clone(),
            "--audio-quality".to_string(),
            "0".to_string(),
        ]);
    } else {
        let format_str = match options.quality.as_str() {
            "1080p" => "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
            "720p"  => "bestvideo[height<=720]+bestaudio/best[height<=720]",
            "480p"  => "bestvideo[height<=480]+bestaudio/best[height<=480]",
            _       => "bestvideo+bestaudio/best",
        };
        args.extend([
            "-f".to_string(),
            format_str.to_string(),
            "--merge-output-format".to_string(),
            options.container.clone(),
        ]);
    }

    args.extend([
        "-o".to_string(),
        output_template.clone(),
        url.to_string(),
    ]);

    emit_log(job_id, &format!("Baixando {} {}...", batch_type, url), manager.clone()).await;
    run_with_progress(job_id, &ytdlp, &args, ProgressParser::YtDlp, manager.clone()).await?;

    Ok(output_folder.to_string())
}

// ─── Operações de arquivo (FFmpeg) ───────────────────────────────────────────

async fn run_file_job(
    job_id: &str,
    input_path: &str,
    options: &FileOperationOptions,
    output_folder: &str,
    hw_accel: &str,
    manager: Arc<Mutex<JobManager>>,
) -> Result<String> {
    let ffmpeg = find_ffmpeg();

    // Obter duração total via ffprobe para calcular progresso
    let total_duration = get_duration_secs(input_path);

    let stem = std::path::Path::new(input_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");

    let (output_path, args) = match options.op.as_str() {
        "convert" => build_convert_args(input_path, options, output_folder, stem, hw_accel)?,
        "trim"    => build_trim_args(input_path, options, output_folder, stem)?,
        "compress" => build_compress_args(input_path, options, output_folder, stem, hw_accel, total_duration)?,
        "extractAudio" => build_extract_audio_args(input_path, options, output_folder, stem)?,
        op => return Err(anyhow!("Operação desconhecida: {}", op)),
    };

    emit_log(job_id, &format!("ffmpeg {}", args.join(" ")), manager.clone()).await;

    run_with_progress(
        job_id,
        &ffmpeg,
        &args,
        ProgressParser::FFmpeg { total_duration },
        manager.clone(),
    ).await?;

    Ok(output_path)
}

fn build_convert_args(
    input: &str, options: &FileOperationOptions,
    output_folder: &str, stem: &str, hw_accel: &str,
) -> Result<(String, Vec<String>)> {
    let container = options.container.as_deref().unwrap_or("mp4");
    let category = options.category.as_deref().unwrap_or("video");

    let output = format!("{}\\{}.{}", output_folder, stem, container);

    let mut args: Vec<String> = vec![
        "-y".to_string(),
        "-i".to_string(),
        input.to_string(),
    ];

    // Imagens: usar ffmpeg diretamente (simples)
    if category == "image" {
        match container {
            "ico" => {
                // ICO precisa de escala específica
                args.extend(["-vf".to_string(), "scale=256:256".to_string()]);
            }
            "jpeg" | "jpg" => {
                args.extend(["-q:v".to_string(), "2".to_string()]);
            }
            _ => {}
        }
        args.push(output.clone());
        return Ok((output, args));
    }

    // Áudio
    if category == "audio" {
        match container {
            "mp3"  => args.extend(["-codec:a".to_string(), "libmp3lame".to_string(), "-q:a".to_string(), "2".to_string()]),
            "m4a"  => args.extend(["-codec:a".to_string(), "aac".to_string(), "-b:a".to_string(), "192k".to_string()]),
            "wav"  => args.extend(["-codec:a".to_string(), "pcm_s16le".to_string()]),
            "flac" => args.extend(["-codec:a".to_string(), "flac".to_string()]),
            "ogg"  => args.extend(["-codec:a".to_string(), "libvorbis".to_string()]),
            "aac"  => args.extend(["-codec:a".to_string(), "aac".to_string()]),
            _ => args.extend(["-codec:a".to_string(), "copy".to_string()]),
        }
        args.push(output.clone());
        return Ok((output, args));
    }

    // Vídeo: escolher encoder
    let video_codec = if hw_accel == "auto" {
        detect_best_video_encoder(container)
    } else {
        "libx264".to_string()
    };

    args.extend([
        "-codec:v".to_string(),
        video_codec,
        "-codec:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        "192k".to_string(),
        "-movflags".to_string(),
        "+faststart".to_string(),
    ]);
    args.push(output.clone());

    Ok((output, args))
}

fn build_trim_args(
    input: &str, options: &FileOperationOptions,
    output_folder: &str, stem: &str,
) -> Result<(String, Vec<String>)> {
    let ext = std::path::Path::new(input)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
    let output = format!("{}\\{}_cortado.{}", output_folder, stem, ext);

    let start = options.start_sec.unwrap_or(0.0);
    let end = options.end_sec.unwrap_or(60.0);
    let duration = end - start;
    let precise = options.precise.unwrap_or(false);

    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        format!("{:.3}", start),
        "-i".to_string(),
        input.to_string(),
        "-t".to_string(),
        format!("{:.3}", duration),
    ];

    if precise {
        // Re-encode para corte preciso
        args.extend([
            "-codec:v".to_string(), "libx264".to_string(),
            "-codec:a".to_string(), "aac".to_string(),
        ]);
    } else {
        // Stream copy para corte rápido
        args.extend([
            "-codec".to_string(), "copy".to_string(),
        ]);
    }

    args.push(output.clone());
    Ok((output, args))
}

fn build_compress_args(
    input: &str, options: &FileOperationOptions,
    output_folder: &str, stem: &str, hw_accel: &str,
    total_duration: f64,
) -> Result<(String, Vec<String>)> {
    let ext = std::path::Path::new(input)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
    let output = format!("{}\\{}_comprimido.{}", output_folder, stem, ext);

    let target_mb = options.target_size_mb.unwrap_or(16.0);
    // Calcular bitrate total: target_bytes / duration_secs
    let target_bytes = target_mb * 1024.0 * 1024.0;
    let target_bitrate_kbps = if total_duration > 0.0 {
        ((target_bytes * 8.0) / total_duration / 1000.0) as u64
    } else {
        2000
    };

    let audio_bitrate = 128u64;
    let video_bitrate = target_bitrate_kbps.saturating_sub(audio_bitrate);

    let video_codec = if hw_accel == "auto" {
        detect_best_video_encoder(ext)
    } else {
        "libx264".to_string()
    };

    let args = vec![
        "-y".to_string(),
        "-i".to_string(),
        input.to_string(),
        "-codec:v".to_string(), video_codec,
        "-b:v".to_string(), format!("{}k", video_bitrate),
        "-codec:a".to_string(), "aac".to_string(),
        "-b:a".to_string(), format!("{}k", audio_bitrate),
        "-movflags".to_string(), "+faststart".to_string(),
        output.clone(),
    ];

    Ok((output, args))
}

fn build_extract_audio_args(
    input: &str, options: &FileOperationOptions,
    output_folder: &str, stem: &str,
) -> Result<(String, Vec<String>)> {
    let fmt = options.format.as_deref().unwrap_or("mp3");
    let output = format!("{}\\{}.{}", output_folder, stem, fmt);

    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        input.to_string(),
        "-vn".to_string(), // sem vídeo
    ];

    match fmt {
        "mp3"  => args.extend(["-codec:a".to_string(), "libmp3lame".to_string(), "-q:a".to_string(), "2".to_string()]),
        "m4a"  => args.extend(["-codec:a".to_string(), "aac".to_string(), "-b:a".to_string(), "192k".to_string()]),
        "wav"  => args.extend(["-codec:a".to_string(), "pcm_s16le".to_string()]),
        "flac" => args.extend(["-codec:a".to_string(), "flac".to_string()]),
        _ => args.extend(["-codec:a".to_string(), "copy".to_string()]),
    }

    args.push(output.clone());
    Ok((output, args))
}

// ─── Execução com progresso ───────────────────────────────────────────────────

enum ProgressParser {
    FFmpeg { total_duration: f64 },
    YtDlp,
}

async fn run_with_progress(
    job_id: &str,
    binary: &str,
    args: &[String],
    parser: ProgressParser,
    manager: Arc<Mutex<JobManager>>,
) -> Result<()> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command as TokioCommand;

    let mut child = TokioCommand::new(binary)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| anyhow!("Falha ao iniciar {}: {}", binary, e))?;

    let pid = child.id();

    // Registrar PID para cancelamento futuro
    {
        let mut mgr = manager.lock().await;
        mgr.running_pid = pid;
    }

    let stderr = child.stderr.take().expect("stderr");
    let mut lines = BufReader::new(stderr).lines();

    let jid = job_id.to_string();
    let mgr_clone = manager.clone();

    // Processar saída linha a linha
    while let Ok(Some(line)) = lines.next_line().await {
        // Verificar se foi cancelado
        {
            let mgr = mgr_clone.lock().await;
            if let Some(job) = mgr.get_job(&jid) {
                if job.status == JobStatus::Cancelled {
                    let _ = child.kill().await;
                    return Ok(());
                }
            }
        }

        let progress = match &parser {
            ProgressParser::FFmpeg { total_duration } => {
                parse_ffmpeg_progress(&line, *total_duration)
            }
            ProgressParser::YtDlp => parse_ytdlp_progress(&line),
        };

        if let Some(pct) = progress {
            let mut mgr = mgr_clone.lock().await;
            if let Some(job) = mgr.get_job_mut(&jid) {
                job.progress = pct;
            }
            mgr.emit_event(JobEvent::Progress {
                job_id: jid.clone(),
                progress: pct,
                speed_bytes_per_sec: None,
                eta_seconds: None,
            });
        }
    }

    let status = child.wait().await
        .map_err(|e| anyhow!("Erro ao aguardar processo: {}", e))?;

    // Limpar PID
    {
        let mut mgr = manager.lock().await;
        mgr.running_pid = None;
    }

    if !status.success() {
        let code = status.code().unwrap_or(-1);
        return Err(anyhow!("Processo saiu com código {}", code));
    }

    Ok(())
}

fn parse_ffmpeg_progress(line: &str, total_duration: f64) -> Option<f64> {
    // FFmpeg escreve: "frame=  123 fps= 30 q=28.0 size=   1234kB time=00:00:05.00 ..."
    if !line.contains("time=") { return None; }

    let time_part = line.split("time=").nth(1)?;
    let time_str = time_part.split_whitespace().next()?;

    // Parsear HH:MM:SS.ms
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 3 { return None; }

    let hours: f64 = parts[0].parse().ok()?;
    let minutes: f64 = parts[1].parse().ok()?;
    let seconds: f64 = parts[2].parse().ok()?;
    let elapsed = hours * 3600.0 + minutes * 60.0 + seconds;

    if total_duration <= 0.0 { return None; }

    let pct = (elapsed / total_duration * 100.0).min(99.0);
    Some(pct)
}

fn parse_ytdlp_progress(line: &str) -> Option<f64> {
    // yt-dlp escreve: "[download]  42.3% of 123.45MiB ..."
    if !line.contains("[download]") || !line.contains('%') { return None; }

    let pct_part = line.split('%').next()?;
    let pct_str = pct_part.split_whitespace().last()?;
    let pct: f64 = pct_str.parse().ok()?;
    Some(pct.min(99.0))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn get_duration_secs(path: &str) -> f64 {
    let ffprobe = find_ffprobe();
    let output = std::process::Command::new(&ffprobe)
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            path,
        ])
        .output();

    let Ok(out) = output else { return 0.0 };
    let json: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap_or_default();
    json["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse().ok())
        .unwrap_or(0.0)
}

fn find_latest_file(folder: &str) -> Result<String> {
    let dir = std::fs::read_dir(folder)
        .map_err(|e| anyhow!("Falha ao listar pasta de saída: {}", e))?;

    let mut entries: Vec<(std::time::SystemTime, std::path::PathBuf)> = dir
        .flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            if meta.is_file() {
                let modified = meta.modified().ok()?;
                Some((modified, e.path()))
            } else {
                None
            }
        })
        .collect();

    entries.sort_by(|a, b| b.0.cmp(&a.0));

    entries.first()
        .map(|(_, p)| p.to_string_lossy().to_string())
        .ok_or_else(|| anyhow!("Nenhum arquivo encontrado na pasta de saída"))
}

fn detect_best_video_encoder(container: &str) -> String {
    // Tentar NVENC primeiro
    let test = std::process::Command::new(find_ffmpeg())
        .args(["-hide_banner", "-encoders"])
        .output();

    if let Ok(out) = test {
        let txt = String::from_utf8_lossy(&out.stdout).to_lowercase();
        if container != "webm" {
            if txt.contains("h264_nvenc") { return "h264_nvenc".to_string(); }
            if txt.contains("h264_amf")  { return "h264_amf".to_string(); }
            if txt.contains("h264_qsv")  { return "h264_qsv".to_string(); }
        } else {
            if txt.contains("vp9_vaapi") { return "vp9_vaapi".to_string(); }
        }
    }

    if container == "webm" {
        "libvpx-vp9".to_string()
    } else {
        "libx264".to_string()
    }
}

async fn emit_log(job_id: &str, msg: &str, manager: Arc<Mutex<JobManager>>) {
    let mut mgr = manager.lock().await;
    if let Some(job) = mgr.get_job_mut(job_id) {
        job.logs.push(format!(
            "[{}] {}",
            chrono::Local::now().format("%H:%M:%S"),
            msg
        ));
    }
}

fn map_error_to_user_facing(err: &str) -> UserFacingError {
    if err.contains("LOGIN_REQUIRED") || err.contains("403") || err.contains("Sign in") {
        UserFacingError {
            code: "LOGIN_REQUIRED".to_string(),
            title: "Login necessário".to_string(),
            message: "Este conteúdo requer autenticação. Acesse as Configurações e conecte sua conta.".to_string(),
            technical_details: Some(err.to_string()),
            retryable: true,
        }
    } else if err.contains("UNSUPPORTED_FORMAT") || err.contains("not supported") {
        UserFacingError {
            code: "UNSUPPORTED_FORMAT".to_string(),
            title: "Formato não suportado".to_string(),
            message: "Este tipo de arquivo não pode ser processado pelo Crowdash.".to_string(),
            technical_details: Some(err.to_string()),
            retryable: false,
        }
    } else if err.contains("NETWORK") || err.contains("Connection") || err.contains("network") {
        UserFacingError {
            code: "NETWORK".to_string(),
            title: "Falha de rede".to_string(),
            message: "Verifique sua conexão com a internet e tente novamente.".to_string(),
            technical_details: Some(err.to_string()),
            retryable: true,
        }
    } else if err.contains("ENOSPC") || err.contains("no space") || err.contains("disk") {
        UserFacingError {
            code: "DISK_FULL".to_string(),
            title: "Sem espaço em disco".to_string(),
            message: "O disco de destino está cheio. Libere espaço e tente novamente.".to_string(),
            technical_details: Some(err.to_string()),
            retryable: false,
        }
    } else {
        UserFacingError {
            code: "UNKNOWN".to_string(),
            title: "Erro inesperado".to_string(),
            message: "Ocorreu um problema durante o processamento. Tente novamente.".to_string(),
            technical_details: Some(err.to_string()),
            retryable: true,
        }
    }
}
