//! Desktop side of the Chrome/Edge Native Messaging connection.
use anyhow::{anyhow, Result};
use crowdash_extension_bridge::{Endpoint, EndpointGuard, Request, RequestBody, MAX_MESSAGE, failure};
use serde::Serialize;
use serde_json::{json, Value};
use std::{collections::{HashMap, VecDeque}, sync::Arc};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpStream, sync::Mutex};
use crate::jobs::{JobInput, JobManager};

pub struct ExtensionState {
    registration_error: std::sync::Mutex<Option<String>>,
    pending_actions: Mutex<VecDeque<Value>>,
    responses: Mutex<HashMap<String, Value>>,
    _guard: EndpointGuard,
}

pub fn start(app: &AppHandle) -> Result<()> {
    let registration_error = crowdash_extension_bridge::register_host(&std::env::current_exe()?).err().map(|e| e.to_string());
    let (listener, endpoint, guard) = crowdash_extension_bridge::listen()?;
    listener.set_nonblocking(true)?;
    app.manage(ExtensionState { registration_error: std::sync::Mutex::new(registration_error), pending_actions: Mutex::new(VecDeque::new()), responses: Mutex::new(HashMap::new()), _guard: guard });
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(listener) { Ok(l) => l, Err(e) => { tracing::error!("Não foi possível iniciar a conexão da extensão: {e}"); return; } };
        let slots = Arc::new(tokio::sync::Semaphore::new(16));
        loop {
            let Ok((socket, _)) = listener.accept().await else { break; };
            let Ok(permit) = slots.clone().try_acquire_owned() else { continue; };
            let app = app.clone(); let endpoint = endpoint.clone();
            tauri::async_runtime::spawn(async move {
                let _permit = permit;
                let _ = tokio::time::timeout(std::time::Duration::from_secs(5), serve(socket, app, endpoint)).await;
            });
        }
    });
    Ok(())
}

async fn serve(mut socket: TcpStream, app: AppHandle, endpoint: Endpoint) -> Result<()> {
    let length = socket.read_u32_le().await? as usize;
    if length == 0 || length > MAX_MESSAGE { return Err(anyhow!("Mensagem inválida")); }
    let mut data = vec![0u8; length]; socket.read_exact(&mut data).await?;
    let envelope: Value = serde_json::from_slice(&data)?;
    let response = if !endpoint.authorize(envelope["token"].as_str().unwrap_or("")) {
        failure("invalid", "Conexão local não autorizada")
    } else {
        let request: Request = serde_json::from_value(envelope["request"].clone())?;
        match request.validate() { Err(error) => failure(&request.id, error), Ok(()) => handle(&app, request).await }
    };
    let data = serde_json::to_vec(&response)?;
    socket.write_u32_le(data.len() as u32).await?; socket.write_all(&data).await?; socket.flush().await?;
    Ok(())
}

async fn handle(app: &AppHandle, request: Request) -> Value {
    if matches!(request.body, RequestBody::Ping) { return json!({"v":1,"id":request.id,"ok":true,"status":"connected"}); }
    let state = app.state::<ExtensionState>();
    let mut responses = state.responses.lock().await;
    if let Some(response) = responses.get(&request.id) { return response.clone(); }
    let RequestBody::Handoff { payload } = request.body else { unreachable!() };
    let response = if payload.action.as_deref() == Some("analyze") {
        state.pending_actions.lock().await.push_back(json!({"type":"analyze","url":payload.media_url}));
        let _ = app.emit("extension:action", ());
        json!({"v":1,"id":request.id,"ok":true,"opened":true})
    } else {
        let input = json!({"kind":"url","url":payload.media_url,"title":payload.title,"options":payload.preset});
        match serde_json::from_value::<JobInput>(input) {
            Ok(input) => {
                let manager = app.state::<Arc<Mutex<JobManager>>>().inner().clone();
                let job = crate::commands::enqueue_input(input, "extension", manager).await;
                state.pending_actions.lock().await.push_back(json!({"type":"queue"}));
                let _ = app.emit("extension:action", ());
                json!({"v":1,"id":request.id,"ok":true,"jobId":job.id})
            }
            Err(error) => failure(&request.id, error),
        }
    };
    if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus(); }
    if responses.len() >= 256 { responses.clear(); }
    responses.insert(request.id, response.clone());
    response
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionSetup { registered: bool, extension_id: String, folder_available: bool, error: Option<String> }
fn extension_folder(app: &AppHandle) -> Result<std::path::PathBuf> {
    let installed = app.path().resource_dir()?.join("extension");
    if installed.join("manifest.json").is_file() { return Ok(installed); }
    #[cfg(debug_assertions)] {
        let dev = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../extension/dist");
        if dev.join("manifest.json").is_file() { return Ok(dev); }
    }
    Err(anyhow!("O pacote da extensão não foi encontrado. Reinstale o CrowDash."))
}
#[tauri::command]
pub fn extension_setup(app: AppHandle, state: State<'_, ExtensionState>) -> ExtensionSetup {
    let error = state.registration_error.lock().unwrap().clone();
    ExtensionSetup { registered: error.is_none(), extension_id: crowdash_extension_bridge::extension_id(), folder_available: extension_folder(&app).is_ok(), error }
}
#[tauri::command]
pub fn connect_extension(state: State<'_, ExtensionState>) -> Result<(), String> {
    let result = std::env::current_exe().map_err(anyhow::Error::from).and_then(|exe| crowdash_extension_bridge::register_host(&exe));
    *state.registration_error.lock().unwrap() = result.as_ref().err().map(ToString::to_string);
    result.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn take_extension_action(state: State<'_, ExtensionState>) -> Result<Option<Value>, String> { Ok(state.pending_actions.lock().await.pop_front()) }
#[tauri::command]
pub fn open_extension_folder(app: AppHandle) -> Result<(), String> {
    let folder = extension_folder(&app).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")] let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")] let mut command = std::process::Command::new("open");
    #[cfg(target_os = "linux")] let mut command = std::process::Command::new("xdg-open");
    command.arg(folder).spawn().map_err(|e| e.to_string())?; Ok(())
}
