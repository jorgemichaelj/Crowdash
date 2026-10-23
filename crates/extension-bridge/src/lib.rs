//! Chrome Native Messaging and the authenticated per-user desktop connection.
use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use url::Url;

pub const MAX_MESSAGE: usize = 1024 * 1024;
pub const HOST_NAME: &str = "com.crowdash.host";

pub fn extension_id() -> String {
    serde_json::from_str::<Value>(include_str!(
        "../../../packages/shared/src/protocol/nativeHost.json"
    ))
    .expect("native host config")["extensionId"]
        .as_str()
        .expect("extension ID")
        .into()
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Preset {
    pub mode: String,
    pub quality: String,
    pub container: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffPayload {
    pub media_url: String,
    pub page_url: String,
    pub title: Option<String>,
    pub kind: String,
    pub action: Option<String>,
    pub preset: Preset,
    #[serde(default)]
    pub use_browser_session: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RequestBody {
    Ping,
    Handoff { payload: HandoffPayload },
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Request {
    pub v: u8,
    pub id: String,
    #[serde(flatten)]
    pub body: RequestBody,
}

impl Request {
    pub fn validate(&self) -> Result<()> {
        if self.v != 1
            || self.id.is_empty()
            || self.id.len() > 128
            || !self
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
        {
            bail!("Mensagem inválida ou versão de protocolo incompatível.");
        }
        if let RequestBody::Handoff { payload: p } = &self.body {
            for value in [&p.media_url, &p.page_url] {
                let url = Url::parse(value)?;
                if value.len() > 16384
                    || !matches!(url.scheme(), "http" | "https")
                    || url.host_str().is_none()
                    || !url.username().is_empty()
                    || url.password().is_some()
                {
                    bail!("Use uma URL HTTP ou HTTPS válida.");
                }
            }
            if p.title.as_ref().is_some_and(|s| s.chars().count() > 512)
                || !matches!(p.kind.as_str(), "direct" | "hls" | "dash" | "page")
            {
                bail!("Mídia inválida.");
            }
            if p.action
                .as_ref()
                .is_some_and(|a| !matches!(a.as_str(), "download" | "analyze"))
            {
                bail!("Ação inválida.");
            }
            if p.use_browser_session {
                bail!("O envio de cookies de sessão não está habilitado nesta versão.");
            }
            if !matches!(
                p.preset.quality.as_str(),
                "best" | "1080p" | "720p" | "480p"
            ) || !(match p.preset.mode.as_str() {
                "video" => matches!(p.preset.container.as_str(), "mp4" | "mkv"),
                "audio" => matches!(p.preset.container.as_str(), "mp3" | "m4a"),
                _ => false,
            }) {
                bail!("Formato de download inválido.");
            }
        }
        Ok(())
    }
}

pub fn failure(id: &str, message: impl ToString) -> Value {
    json!({"v":1,"id":id,"ok":false,"error":{"code":"NETWORK","title":"Conexão com o CrowDash","message":message.to_string(),"retryable":true}})
}

/// Chrome uses a 32-bit little-endian UTF-8 byte length. stdout is protocol only.
pub fn read_frame<R: Read>(reader: &mut R) -> Result<Option<Value>> {
    let mut header = [0u8; 4];
    loop {
        match reader.read(&mut header[..1]) {
            Ok(0) => return Ok(None),
            Ok(_) => break,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e.into()),
        }
    }
    reader
        .read_exact(&mut header[1..])
        .context("Cabeçalho incompleto")?;
    let len = u32::from_le_bytes(header) as usize;
    if len == 0 || len > MAX_MESSAGE {
        bail!("Tamanho de mensagem inválido");
    }
    let mut bytes = vec![0u8; len];
    reader
        .read_exact(&mut bytes)
        .context("Mensagem incompleta")?;
    Ok(Some(serde_json::from_slice(&bytes)?))
}
pub fn write_frame<W: Write>(writer: &mut W, value: &Value) -> Result<()> {
    let data = serde_json::to_vec(value)?;
    if data.len() > MAX_MESSAGE {
        bail!("Mensagem muito grande");
    }
    writer.write_all(&(data.len() as u32).to_le_bytes())?;
    writer.write_all(&data)?;
    writer.flush()?;
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Endpoint {
    pub port: u16,
    pub token: String,
}
impl Endpoint {
    pub fn authorize(&self, token: &str) -> bool {
        token.len() == self.token.len()
            && token
                .bytes()
                .zip(self.token.bytes())
                .fold(0u8, |v, (a, b)| v | (a ^ b))
                == 0
    }
}

pub fn bridge_dir() -> Result<PathBuf> {
    Ok(dirs::config_dir()
        .ok_or_else(|| anyhow!("Pasta de configuração indisponível"))?
        .join("Crowdash")
        .join("native-messaging"))
}
fn endpoint_path() -> Result<PathBuf> {
    Ok(bridge_dir()?.join("endpoint.json"))
}
fn private_dir(dir: &Path) -> Result<()> {
    fs::create_dir_all(dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}
fn write_private(path: &Path, data: &[u8]) -> Result<()> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(data)?;
    file.sync_all()?;
    Ok(())
}

pub struct EndpointGuard {
    path: PathBuf,
    token: String,
}
impl Drop for EndpointGuard {
    fn drop(&mut self) {
        if fs::read(&self.path)
            .ok()
            .and_then(|d| serde_json::from_slice::<Endpoint>(&d).ok())
            .is_some_and(|e| e.authorize(&self.token))
        {
            let _ = fs::remove_file(&self.path);
        }
    }
}

pub fn listen() -> Result<(TcpListener, Endpoint, EndpointGuard)> {
    private_dir(&bridge_dir()?)?;
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let endpoint = Endpoint {
        port: listener.local_addr()?.port(),
        token: uuid::Uuid::new_v4().simple().to_string(),
    };
    let path = endpoint_path()?;
    let temp = path.with_file_name(format!("endpoint-{}.tmp", uuid::Uuid::new_v4()));
    write_private(&temp, &serde_json::to_vec(&endpoint)?)?;
    #[cfg(windows)]
    {
        if path.exists() {
            fs::remove_file(&path)?;
        }
    }
    fs::rename(&temp, &path)?;
    Ok((
        listener,
        endpoint.clone(),
        EndpointGuard {
            path,
            token: endpoint.token,
        },
    ))
}

fn endpoint() -> Result<Endpoint> {
    let path = endpoint_path()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(&path)?.permissions().mode() & 0o077 != 0 {
            bail!("Configuração local com permissões inválidas");
        }
    }
    let endpoint: Endpoint = serde_json::from_slice(&fs::read(path)?)?;
    if endpoint.port == 0 || endpoint.token.len() < 32 {
        bail!("Conexão local inválida");
    }
    Ok(endpoint)
}

fn forward(request: &Request) -> Result<Value> {
    forward_to(request, &endpoint()?)
}

fn forward_to(request: &Request, endpoint: &Endpoint) -> Result<Value> {
    let address = SocketAddr::from(([127, 0, 0, 1], endpoint.port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    write_frame(
        &mut stream,
        &json!({"token":endpoint.token,"request":request}),
    )?;
    read_frame(&mut stream)?.ok_or_else(|| anyhow!("O aplicativo encerrou a conexão"))
}

pub fn run_host(origin: &str, launcher: Option<&Path>) -> Result<()> {
    if origin.trim_end_matches('/') != format!("chrome-extension://{}", extension_id()) {
        bail!("Origem de extensão não autorizada");
    }
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut reader = stdin.lock();
    let mut writer = stdout.lock();
    while let Some(value) = read_frame(&mut reader)? {
        let id = value["id"].as_str().unwrap_or("invalid").to_string();
        let request = serde_json::from_value::<Request>(value)
            .and_then(|r| r.validate().map(|_| r).map_err(serde::de::Error::custom));
        let response = match request {
            Err(error) => failure(&id, error),
            Ok(request) => {
                let mut result = forward(&request);
                if result.is_err() && matches!(request.body, RequestBody::Handoff { .. }) {
                    if let Some(path) = launcher {
                        // Never inherit the protocol pipes when opening the GUI process.
                        std::process::Command::new(path)
                            .stdin(std::process::Stdio::null())
                            .stdout(std::process::Stdio::null())
                            .stderr(std::process::Stdio::null())
                            .spawn()?;
                        let deadline = Instant::now() + Duration::from_secs(12);
                        while Instant::now() < deadline {
                            std::thread::sleep(Duration::from_millis(200));
                            result = forward(&request);
                            if result.is_ok() {
                                break;
                            }
                        }
                    }
                }
                result.unwrap_or_else(|_| failure(&id, "Abra o CrowDash e tente novamente. O aplicativo não respondeu à conexão local."))
            }
        };
        write_frame(&mut writer, &response)?;
    }
    Ok(())
}

pub fn host_manifest(executable: &Path) -> Result<Value> {
    if !executable.is_absolute() || !executable.is_file() {
        bail!("Executável do CrowDash não encontrado");
    }
    Ok(
        json!({"name":HOST_NAME,"description":"CrowDash desktop bridge","path":executable.to_string_lossy(),"type":"stdio","allowed_origins":[format!("chrome-extension://{}/",extension_id())]}),
    )
}

pub fn register_host(executable: &Path) -> Result<()> {
    let config = dirs::config_dir().ok_or_else(|| anyhow!("Pasta de configuração indisponível"))?;
    private_dir(&bridge_dir()?)?;
    let manifest = serde_json::to_vec_pretty(&host_manifest(executable)?)?;
    #[cfg(target_os = "windows")]
    {
        let path = bridge_dir()?.join(format!("{HOST_NAME}.json"));
        fs::write(&path, manifest)?;
        for browser in ["Google\\Chrome", "Microsoft\\Edge", "Chromium"] {
            let key = format!("HKCU\\Software\\{browser}\\NativeMessagingHosts\\{HOST_NAME}");
            let output = std::process::Command::new("reg.exe")
                .args(["add", &key, "/ve", "/t", "REG_SZ", "/d"])
                .arg(&path)
                .arg("/f")
                .output()?;
            if !output.status.success() {
                bail!("Não foi possível registrar a extensão no navegador");
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        #[cfg(target_os = "linux")]
        let browsers = [
            config.join("google-chrome"),
            config.join("chromium"),
            config.join("microsoft-edge"),
        ];
        #[cfg(target_os = "macos")]
        let browsers = [
            config.join("Google/Chrome"),
            config.join("Chromium"),
            config.join("Microsoft Edge"),
        ];
        for browser in browsers {
            let folder = browser.join("NativeMessagingHosts");
            fs::create_dir_all(&folder)?;
            fs::write(folder.join(format!("{HOST_NAME}.json")), &manifest)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_frames_use_utf8_bytes_and_support_multiple_messages() {
        let value = json!({"title":"música 🐦"});
        let mut data = Vec::new();
        write_frame(&mut data, &value).unwrap();
        write_frame(&mut data, &json!({"v":1})).unwrap();
        assert_eq!(
            u32::from_le_bytes(data[..4].try_into().unwrap()) as usize,
            serde_json::to_vec(&value).unwrap().len()
        );
        let mut input = &data[..];
        assert_eq!(read_frame(&mut input).unwrap().unwrap(), value);
        assert_eq!(read_frame(&mut input).unwrap().unwrap()["v"], 1);
        assert!(read_frame(&mut input).unwrap().is_none());
    }
    #[test]
    fn rejects_oversized_truncated_and_invalid_frames() {
        assert!(read_frame(&mut &((MAX_MESSAGE + 1) as u32).to_le_bytes()[..]).is_err());
        assert!(read_frame(&mut &[1, 0][..]).is_err());
        assert!(read_frame(&mut &[3, 0, 0, 0, b'{'][..]).is_err());
        assert!(read_frame(&mut &[0, 0, 0, 0][..]).is_err());
    }
    #[test]
    fn rejects_browser_cookie_forwarding_and_invalid_urls() {
        let mut request = json!({"v":1,"id":"req-1","type":"handoff","payload":{"mediaUrl":"https://example.com/video.mp4","pageUrl":"https://example.com","kind":"direct","preset":{"mode":"video","quality":"best","container":"mp4"},"useBrowserSession":false}});
        assert!(serde_json::from_value::<Request>(request.clone())
            .unwrap()
            .validate()
            .is_ok());
        request["payload"]["useBrowserSession"] = json!(true);
        assert!(serde_json::from_value::<Request>(request.clone())
            .unwrap()
            .validate()
            .is_err());
        request["payload"]["useBrowserSession"] = json!(false);
        request["payload"]["mediaUrl"] = json!("file:///private");
        assert!(serde_json::from_value::<Request>(request)
            .unwrap()
            .validate()
            .is_err());
    }
    #[test]
    fn endpoint_requires_matching_secret() {
        let e = Endpoint {
            port: 1234,
            token: "a".repeat(32),
        };
        assert!(!e.authorize(&"b".repeat(32)));
        assert!(!e.authorize("a"));
        assert!(e.authorize(&"a".repeat(32)));
    }
    #[test]
    fn rejects_other_extensions_before_reading_stdin() {
        assert!(run_host("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/", None).is_err());
    }
    #[test]
    fn forwards_authenticated_requests_over_a_real_local_socket() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let endpoint = Endpoint {
            port: listener.local_addr().unwrap().port(),
            token: "test-secret-32-bytes-long-for-fixture".into(),
        };
        let expected = endpoint.clone();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let envelope = read_frame(&mut socket).unwrap().unwrap();
            assert!(expected.authorize(envelope["token"].as_str().unwrap()));
            assert_eq!(envelope["request"]["type"], "ping");
            write_frame(
                &mut socket,
                &json!({"v":1,"id":"roundtrip","ok":true,"status":"connected"}),
            )
            .unwrap();
        });
        let request: Request =
            serde_json::from_value(json!({"v":1,"id":"roundtrip","type":"ping"})).unwrap();
        assert_eq!(
            forward_to(&request, &endpoint).unwrap()["status"],
            "connected"
        );
        server.join().unwrap();
    }
    #[test]
    fn native_manifest_allows_only_the_fixed_extension() {
        let manifest = host_manifest(&std::env::current_exe().unwrap()).unwrap();
        assert_eq!(manifest["name"], HOST_NAME);
        assert_eq!(
            manifest["allowed_origins"],
            json!([format!("chrome-extension://{}/", extension_id())])
        );
        assert!(std::path::Path::new(manifest["path"].as_str().unwrap()).is_absolute());
    }
    #[test]
    fn refuses_unknown_protocol_versions_and_incompatible_formats() {
        let request: Request =
            serde_json::from_value(json!({"v":2,"id":"test","type":"ping"})).unwrap();
        assert!(request.validate().is_err());
        let request: Request = serde_json::from_value(json!({"v":1,"id":"test","type":"handoff","payload":{"mediaUrl":"https://example.com/video.mp4","pageUrl":"https://example.com","kind":"direct","preset":{"mode":"audio","quality":"best","container":"mp4"},"useBrowserSession":false}})).unwrap();
        assert!(request.validate().is_err());
    }
}
