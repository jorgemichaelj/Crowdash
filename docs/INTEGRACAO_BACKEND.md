# Guia de Integração com o Backend Real — Crowdash

> Referência dos contratos iniciais. O backend Tauri e a conexão Native Messaging já estão implementados; consulte [downloads do YouTube](DOWNLOADS_YOUTUBE.md) e [extensão](EXTENSAO.md) para o funcionamento atual.
Este documento especifica todos os contratos, interfaces e pontos de integração que o futuro backend (Rust/Tauri, FFmpeg, yt-dlp e Native Messaging Host) precisará implementar para substituir a camada de simulação sem alterar nenhuma linha da interface visual.

---

## 1. Contrato `BackendClient` (`packages/shared/src/backend/types.ts`)

A UI consome exclusivamente a interface `BackendClient` através do hook `useBackend()` e do `BackendProvider`. Para ativar o backend real, basta fornecer uma implementação `TauriBackendClient` no lugar do `MockBackendClient`.

### 1.1 Métodos a Implementar

| Método | Entrada | Saída | Responsabilidade Real |
|---|---|---|---|
| `analyzeUrl(url)` | `string` | `Promise<MediaInfo>` | Invoca `yt-dlp --dump-json` ou similar para obter metadados, durações, resoluções e miniaturas. |
| `analyzeFile(path)` | `string` | `Promise<MediaInfo>` | Executa `ffprobe` no arquivo local para inspecionar codecs, canais e compatibilidade com stream copy. |
| `enqueue(input, origin)` | `JobInput, JobOrigin?` | `Promise<Job>` | Insere o Job no `JobManager` do Core Rust (execução serial com gerenciamento seguro de processos). |
| `cancel(jobId)` | `string` | `Promise<void>` | Envia sinal de encerramento gracioso ao processo do job e remove arquivos temporários parciais. |
| `retry(jobId)` | `string` | `Promise<Job>` | Reinicia uma tarefa falha ou cancelada. |
| `remove(jobId)` | `string` | `Promise<void>` | Remove o histórico da tarefa da base local. |
| `listJobs()` | *nenhum* | `Promise<Job[]>` | Retorna todos os jobs persistidos no SQLite/JSON local do Core. |
| `subscribe(handler)` | `(event: JobEvent) => void` | `() => void` | Registra listener de eventos emitidos via Tauri Events (`STARTED`, `PROGRESS`, `COMPLETED`, `ERROR`, `CANCELLED`). |
| `getSettings()` | *nenhum* | `Promise<AppSettings>` | Lê as configurações salvas em `%LocalAppData%\Crowdash\settings.json`. |
| `updateSettings(patch)` | `Partial<AppSettings>` | `Promise<AppSettings>` | Salva as alterações de configuração no disco. |
| `getHardwareInfo()` | *nenhum* | `Promise<HardwareInfo>` | Executa um teste rápido de encode em GPU para verificar suporte a NVENC / AMF / QSV. |
| `checkForUpdate()` | *nenhum* | `Promise<UpdateInfo \| null>` | Consulta endpoint de releases para checar novas versões do app ou yt-dlp. |
| `revealInFolder(path)` | `string` | `Promise<void>` | Abre o explorer do Windows com o arquivo selecionado (`explorer.exe /select,...`). |
| `pickOutputFolder()` | *nenhum* | `Promise<string \| null>` | Abre o seletor nativo de diretórios do sistema operacional. |

---

## 2. Contrato `HostClient` e Native Messaging (`packages/shared/src/protocol/types.ts`)

A extensão conversa com o binário host fino do Windows via Native Messaging (STREAMS stdin/stdout com mensagens prefixadas pelo comprimento em 32-bit uint).

- O host deve validar o manifesto da extensão com `allowed_origins: ["chrome-extension://<EXTENSION_ID>/"]`.
- O tamanho máximo da mensagem transmitida é limitado a 1 MB.
- Nenhuma credencial ou cookie em texto puro deve trafegar em logs ou registros públicos.
- Ao receber `HandoffRequest`, o host repassa ao app desktop via socket IPC local autenticado.
