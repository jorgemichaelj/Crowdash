// jobs.rs — Gerenciador de fila de jobs, spawn de FFmpeg/yt-dlp, eventos via Tauri

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use chrono::Utc;
use crowdash_download_core::{classify_url, channel_plan, format_args, step_args, ChannelSelection, DownloadStep, MediaUrl};
use std::path::Path;

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
        item_count: Option<u32>,
        #[serde(rename = "batchType")]
        batch_type: String,
        options: DownloadOptions,
        url: String,
        selection: Option<ChannelSelection>,
        #[serde(rename = "channelName")]
        channel_name: Option<String>,
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
    pub queue_active: bool,
    pub running_pid: Option<u32>, // PID do processo filho atual
}

impl JobManager {
    pub fn new(app: AppHandle, settings: AppSettings) -> Self {
        JobManager {
            jobs: HashMap::new(),
            app,
            settings,
            running_pid: None,
            queue_active: false,
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
        JobInput::Batch { url, options, batch_type, selection, channel_name, .. } => {
            run_batch_job(&job_id, url, options, &output_folder, batch_type, *selection, channel_name.as_deref(), manager.clone()).await
        }
    };

    // Processar resultado
    {
        let mut mgr = manager.lock().await;
        match result {
            Ok(output_path) => {
                if let Some(job) = mgr.get_job_mut(&job_id) {
                    if job.status != JobStatus::Running {
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
                    if job.status != JobStatus::Running {
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
    let MediaUrl::Video { url, .. } = classify_url(url)? else {
        return Err(anyhow!("URL_INVALID: escolha explicitamente uma playlist ou um canal"));
    };
    std::fs::create_dir_all(output_folder)?;
    let mut args: Vec<String> = ["--ignore-config", "--no-warnings", "--no-simulate", "--progress", "--newline", "--no-playlist", "--socket-timeout", "30", "--retries", "3", "--windows-filenames"].map(String::from).to_vec();
    args.extend(format_args(&options.mode, &options.quality, &options.container)?);
    args.extend(["-P".into(), output_folder.into(), "-o".into(), "%(title)s [%(id)s].%(ext)s".into(), "--print".into(), "after_move:CROWDASH_FILE:%(filepath)s".into(), "--".into(), url]);
    run_with_progress(job_id, &find_ytdlp(), &args, ProgressParser::YtDlp, manager).await?
        .ok_or_else(|| anyhow!("Nenhum arquivo de saída foi informado pelo yt-dlp"))
}

// ─── Batch Download (canal/playlist) ─────────────────────────────────────────

async fn run_batch_job(
    job_id: &str,
    url: &str,
    options: &DownloadOptions,
    output_folder: &str,
    batch_type: &str,
    selection: Option<ChannelSelection>,
    channel_name: Option<&str>,
    manager: Arc<Mutex<JobManager>>,
) -> Result<String> {
    let (root, steps) = if batch_type == "channel" {
        let MediaUrl::Channel { name, .. } = classify_url(url)? else { return Err(anyhow!("URL_INVALID")); };
        channel_plan(url, channel_name.unwrap_or(&name), selection.ok_or_else(|| anyhow!("Selecione o conteúdo do canal"))?, Path::new(output_folder))?
    } else if batch_type == "playlist" {
        let MediaUrl::Playlist { url } = classify_url(url)? else { return Err(anyhow!("URL_INVALID")); };
        (Path::new(output_folder).to_path_buf(), vec![DownloadStep { url, folder: Path::new(output_folder).join("playlists"), playlists: true, thumbnails: false, thumbnail_only: false, posts: false }])
    } else { return Err(anyhow!("Tipo de coleção inválido")); };
    for (index, step) in steps.iter().enumerate() {
        if is_cancelled(job_id, &manager).await { return Err(anyhow!("CANCELLED")); }
        std::fs::create_dir_all(&step.folder)?;
        if step.thumbnails && !step.thumbnail_only {
            std::fs::create_dir_all(root.join("thumbs"))?;
        }
        emit_log(job_id, &format!("Etapa {}/{}: {}", index + 1, steps.len(), step.folder.display()), manager.clone()).await;
        let result = if step.posts {
            export_posts(job_id, url, &step.folder, manager.clone()).await
        } else {
            let args = step_args(step, &options.mode, &options.quality, &options.container)?;
            run_with_progress(job_id, &find_ytdlp(), &args, ProgressParser::YtDlp, manager.clone()).await.map(|_| ())
        };
        if let Err(error) = result {
            let message = error.to_string();
            // Channels need not have every tab; skip only a confirmed absent section.
            if selection == Some(ChannelSelection::All) && (message.contains("SECTION_UNAVAILABLE") || message.contains("does not have a") || message.contains("doesn't have a")) {
                emit_log(job_id, &format!("Seção não disponível neste canal: {}", step.url), manager.clone()).await;
            } else { return Err(error); }
        }
    }
    Ok(root.to_string_lossy().into_owned())
}

async fn is_cancelled(job_id: &str, manager: &Arc<Mutex<JobManager>>) -> bool {
    let mgr = manager.lock().await;
    mgr.get_job(job_id).is_none_or(|j| j.status != JobStatus::Running)
}

async fn export_posts(job_id: &str, url: &str, folder: &Path, manager: Arc<Mutex<JobManager>>) -> Result<()> {
    use crowdash_download_core::posts::{PostsClient, save_posts};
    use std::collections::HashSet;
    let (client, mut page) = PostsClient::open(url).await?;
    let mut posts = Vec::new();
    let mut seen_posts = HashSet::new();
    let mut seen_tokens = HashSet::new();
    loop {
        for mut post in page.posts {
            if is_cancelled(job_id, &manager).await { return Err(anyhow!("CANCELLED")); }
            if !seen_posts.insert(post.id.clone()) { continue; }
            for (index, url) in post.images.iter().enumerate() {
                let images = folder.join("imagens");
                std::fs::create_dir_all(&images)?;
                let (data, extension) = client.image(url).await?;
                let file = format!("{}-{}.{}", post.id, index + 1, extension);
                std::fs::write(images.join(&file), data)?;
                post.local_images.push(format!("imagens/{file}"));
            }
            posts.push(post);
        }
        // Save each completed page so an interrupted export retains its progress.
        save_posts(folder, &posts)?;
        emit_log(job_id, &format!("{} publicações exportadas", posts.len()), manager.clone()).await;
        let Some(token) = page.continuation else { break; };
        if !seen_tokens.insert(token.clone()) { return Err(anyhow!("A paginação das publicações se repetiu; exportação parcial preservada")); }
        if is_cancelled(job_id, &manager).await { return Err(anyhow!("CANCELLED")); }
        page = client.next_page(&token).await?;
    }
    Ok(())
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
) -> Result<Option<String>> {
    use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
    async fn read_lines<R: AsyncRead + Unpin>(stream: R, sender: tokio::sync::mpsc::Sender<String>) {
        let mut lines = BufReader::new(stream).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if sender.send(line).await.is_err() { break; }
        }
    }
    if is_cancelled(job_id, &manager).await { return Err(anyhow!("CANCELLED")); }
    let mut child = tokio::process::Command::new(binary).args(args)
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped())
        .spawn().map_err(|e| anyhow!("Falha ao iniciar {}: {}", binary, e))?;
    manager.lock().await.running_pid = child.id();
    let (sender, mut receiver) = tokio::sync::mpsc::channel(128);
    let stdout_task = tokio::spawn(read_lines(child.stdout.take().unwrap(), sender.clone()));
    let stderr_task = tokio::spawn(read_lines(child.stderr.take().unwrap(), sender));
    let mut poll = tokio::time::interval(std::time::Duration::from_millis(200));
    let mut output_path = None;
    let mut diagnostics = std::collections::VecDeque::new();
    loop {
        tokio::select! {
            _ = poll.tick() => {
                if is_cancelled(job_id, &manager).await {
                    #[cfg(target_os = "windows")]
                    if let Some(pid) = child.id() {
                        let _ = tokio::process::Command::new("taskkill").args(["/T", "/F", "/PID", &pid.to_string()]).output().await;
                    }
                    let _ = child.kill().await;
                    stdout_task.abort(); stderr_task.abort();
                    manager.lock().await.running_pid = None;
                    return Err(anyhow!("CANCELLED"));
                }
            }
            line = receiver.recv() => {
                let Some(line) = line else { break; };
                if let Some(path) = line.strip_prefix("CROWDASH_FILE:") { output_path = Some(path.to_string()); }
                let progress = match parser {
                    ProgressParser::FFmpeg { total_duration } => parse_ffmpeg_progress(&line, total_duration),
                    ProgressParser::YtDlp => parse_ytdlp_progress(&line),
                };
                if let Some(progress) = progress {
                    let mut mgr = manager.lock().await;
                    if let Some(job) = mgr.get_job_mut(job_id) { job.progress = progress; }
                    mgr.emit_event(JobEvent::Progress { job_id: job_id.into(), progress, speed_bytes_per_sec: None, eta_seconds: None });
                }
                if diagnostics.len() >= 20 { diagnostics.pop_front(); }
                diagnostics.push_back(line);
            }
        }
    }
    let status = child.wait().await;
    manager.lock().await.running_pid = None;
    let status = status.map_err(|e| anyhow!("Erro ao aguardar processo: {}", e))?;
    if !status.success() {
        return Err(anyhow!("Processo saiu com código {}: {}", status.code().unwrap_or(-1), diagnostics.into_iter().collect::<Vec<_>>().join("\n")));
    }
    Ok(output_path)
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
    if err.contains("POSTS_UNAVAILABLE") || err.contains("SECTION_UNAVAILABLE") {
        return UserFacingError {
            code: "UNSUPPORTED_FORMAT".into(), title: "Conteúdo do canal indisponível".into(),
            message: "A seção escolhida não está disponível publicamente ou o YouTube mudou o formato das publicações. Resultados parciais foram preservados.".into(),
            technical_details: Some(err.into()), retryable: false,
        };
    }
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
