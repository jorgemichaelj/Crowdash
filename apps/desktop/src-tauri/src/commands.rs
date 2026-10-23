// commands.rs — Handlers Tauri expostos ao frontend via invoke()

use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;
use serde_json::Value;

use crate::jobs::{JobInput, JobManager, run_job};
use crate::media;
use crate::settings::SettingsStore;
use crate::hardware::detect_hardware;

type MgrState = Arc<Mutex<JobManager>>;
type SettState = Arc<Mutex<SettingsStore>>;

// ─── analyzeUrl ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn analyze_url(url: String) -> Result<Value, String> {
    media::analyze_url(&url).await
        .map(|info| serde_json::to_value(info).unwrap())
        .map_err(|e| map_error_code(&e.to_string()))
}

// ─── analyzeFile ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn analyze_file(path: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        media::analyze_file(&path)
            .map(|info| serde_json::to_value(info).unwrap())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── enqueueJob ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn enqueue_job(
    input: Value,
    origin: Option<String>,
    manager: State<'_, MgrState>,
) -> Result<Value, String> {
    let input: JobInput = serde_json::from_value(input).map_err(|e| e.to_string())?;
    let job = enqueue_input(input, origin.as_deref().unwrap_or("desktop"), manager.inner().clone()).await;
    Ok(serde_json::to_value(job).unwrap())
}

pub(crate) async fn enqueue_input(input: JobInput, origin: &str, manager: Arc<Mutex<JobManager>>) -> crate::jobs::Job {
    let (job, start_worker) = {
        let mut mgr = manager.lock().await;
        let job = mgr.enqueue(input, origin);
        let start = !mgr.queue_active;
        if start { mgr.queue_active = true; }
        (job, start)
    };
    if start_worker { tokio::spawn(async move { process_queue(manager).await; }); }
    job
}

/// Processa a fila serial: pega o próximo pending, executa, repete
async fn process_queue(manager: Arc<Mutex<JobManager>>) {
    loop {
        let next_id = {
            let mut mgr = manager.lock().await;
            match mgr.next_pending() {
                Some(id) => Some(id),
                None => { mgr.queue_active = false; None }
            }
        };

        let Some(job_id) = next_id else { break };

        run_job(job_id, manager.clone()).await;
    }
}

// ─── cancelJob ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cancel_job(
    job_id: String,
    manager: State<'_, MgrState>,
) -> Result<(), String> {
    use crate::jobs::{JobStatus, JobEvent};
    use chrono::Utc;

    let mut mgr = manager.lock().await;

    // The runner polls this job's status and kills its own child process. Cancelling
    // a queued item must never kill the process belonging to another running item.

    if let Some(job) = mgr.get_job_mut(&job_id) {
        if job.status == JobStatus::Running || job.status == JobStatus::Pending {
            job.status = JobStatus::Cancelled;
            job.finished_at = Some(Utc::now().timestamp_millis());
            job.logs.push(format!(
                "[{}] Operação cancelada pelo usuário.",
                chrono::Local::now().format("%H:%M:%S")
            ));
        }
    }

    mgr.emit_event(JobEvent::Cancelled { job_id });
    Ok(())
}

// ─── retryJob ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn retry_job(
    job_id: String,
    manager: State<'_, MgrState>,
) -> Result<Value, String> {
    use crate::jobs::JobStatus;

    let mgr_clone = manager.inner().clone();

    let start_worker = {
        let mut mgr = manager.lock().await;
        let job = mgr.get_job_mut(&job_id).ok_or("Job não encontrado")?;
        if !matches!(job.status, JobStatus::Failed | JobStatus::Cancelled) {
            return Err("Somente tarefas com falha ou canceladas podem ser repetidas".into());
        }
        job.status = JobStatus::Pending;
        job.progress = 0.0;
        job.error = None;
        job.started_at = None;
        job.finished_at = None;
        job.logs.push("Reiniciando tarefa...".into());
        let start = !mgr.queue_active;
        if start { mgr.queue_active = true; }
        start
    };
    if start_worker {
        tokio::spawn(async move { process_queue(mgr_clone).await; });
    }

    let mgr = manager.lock().await;
    let job = mgr.get_job(&job_id).ok_or("Job não encontrado")?;
    Ok(serde_json::to_value(job).unwrap())
}

// ─── removeJob ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn remove_job(
    job_id: String,
    manager: State<'_, MgrState>,
) -> Result<(), String> {
    let mut mgr = manager.lock().await;
    mgr.remove_job(&job_id);
    Ok(())
}

// ─── listJobs ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_jobs(manager: State<'_, MgrState>) -> Result<Value, String> {
    let mgr = manager.lock().await;
    let jobs = mgr.list_jobs();
    Ok(serde_json::to_value(jobs).unwrap())
}

// ─── getSettings ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_settings(settings: State<'_, SettState>) -> Result<Value, String> {
    let store = settings.lock().await;
    Ok(serde_json::to_value(&store.settings).unwrap())
}

// ─── updateSettings ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn update_settings(
    patch: Value,
    settings: State<'_, SettState>,
    manager: State<'_, MgrState>,
) -> Result<Value, String> {
    let new_settings = {
        let mut store = settings.lock().await;
        store.update(patch).map_err(|e| e.to_string())?
    };

    // Sincronizar com JobManager
    {
        let mut mgr = manager.lock().await;
        mgr.update_settings(new_settings.clone());
    }

    Ok(serde_json::to_value(&new_settings).unwrap())
}

// ─── getHardwareInfo ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_hardware_info() -> Result<Value, String> {
    let info = tokio::task::spawn_blocking(detect_hardware)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(info).unwrap())
}

// ─── checkForUpdate ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_for_update() -> Result<Value, String> {
    // Por ora retorna null (sem atualização disponível)
    // Implementação real: usar tauri-plugin-updater
    Ok(Value::Null)
}

// ─── revealInFolder ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn reveal_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(std::path::Path::new(&path).parent().unwrap_or_else(|| std::path::Path::new("/")))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn map_error_code(err: &str) -> String {
    if err.contains("LOGIN_REQUIRED") {
        serde_json::json!({
            "code": "LOGIN_REQUIRED",
            "title": "Login necessário",
            "message": "Este conteúdo requer autenticação. Configure sua sessão nas Configurações.",
            "technicalDetails": err,
            "retryable": true
        }).to_string()
    } else if err.contains("UNSUPPORTED_FORMAT") {
        serde_json::json!({
            "code": "UNSUPPORTED_FORMAT",
            "title": "Formato não suportado",
            "message": "Este link não contém mídia que o Crowdash consegue processar.",
            "technicalDetails": err,
            "retryable": false
        }).to_string()
    } else if err.contains("NETWORK") {
        serde_json::json!({
            "code": "NETWORK",
            "title": "Falha de rede",
            "message": "Verifique sua conexão e tente novamente.",
            "technicalDetails": err,
            "retryable": true
        }).to_string()
    } else {
        serde_json::json!({
            "code": "UNKNOWN",
            "title": "Erro ao analisar URL",
            "message": "Não foi possível reconhecer o conteúdo deste link.",
            "technicalDetails": err,
            "retryable": true
        }).to_string()
    }
}
