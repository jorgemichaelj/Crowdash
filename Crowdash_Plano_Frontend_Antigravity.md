# TransmuteUtils v2 — Plano de Desenvolvimento (Fase Frontend com Backend Mockado)

> **Instruções para o agente (Antigravity):** leia este documento inteiro antes de escrever código. Ele descreve o produto, a arquitetura, os contratos de dados e as tarefas em ordem. Nesta fase você constrói **somente o frontend** (app desktop e extensão de navegador). **Não implemente FFmpeg, yt-dlp, Native Messaging real, leitura de cookies nem qualquer lógica de backend.** Tudo que dependeria do backend passa por uma interface (`BackendClient`) com uma implementação **mock** que simula o comportamento.

---

## 1. Visão do produto

**Uma ferramenta rápida e simples para baixar, converter, cortar e comprimir mídia.**

Arquitetura final (três peças desacopladas):

```text
┌──────────────────────┐   Native Messaging   ┌──────────────────┐   IPC local   ┌─────────────────────────┐
│ Extensão (MV3)       │ ───────────────────► │ Host (ponte fina)│ ────────────► │ App Desktop + Core      │
│ detecta mídia, popup │ ◄─────────────────── │ binário Windows  │ ◄──────────── │ JobManager, FFmpeg,     │
└──────────────────────┘                      └──────────────────┘               │ yt-dlp                  │
                                                                                 └─────────────────────────┘
```

**Nesta fase** só existem a extensão (UI + detecção simulada) e o app desktop (UI), ambos conversando com mocks.

### Princípios de produto

- Tela principal única, interface minimalista, poucas decisões para o usuário.
- A interface se adapta ao contexto (URL → opções de download; arquivo → converter, cortar, comprimir, extrair áudio).
- Termos técnicos (NVENC, AMF, QSV, bitrate, codec, preset) **nunca** aparecem na tela inicial; ficam em Configurações avançadas.
- Erros técnicos nunca são exibidos crus; sempre uma mensagem amigável com "Tentar novamente" e "Ver detalhes".
- Execução sempre assíncrona; a UI nunca bloqueia.
- Toda operação é um `Job`, com o mesmo ciclo de vida e a mesma apresentação.

---

## 2. Escopo desta fase

### Dentro do escopo

1. Monorepo com app desktop, extensão e pacote compartilhado de tipos/contratos.
2. UI completa do app desktop com dados mockados.
3. UI completa da extensão (popup, estados, detecção simulada).
4. `BackendClient` (interface) + `MockBackendClient` (simulador de jobs, progresso, falhas e cancelamento).
5. Sistema de design, tema escuro/claro, i18n pt-BR, acessibilidade básica.
6. Testes de componentes e do simulador.

### Fora do escopo (não fazer agora)

- Qualquer chamada real a FFmpeg, yt-dlp, GPU, sistema de arquivos ou rede de mídia.
- Native Messaging real, host em Windows, instalador, auto-update real.
- Leitura/transferência de cookies. A UI apenas **representa** o consentimento por site (ver seção 8.4).
- Módulo PDF/OCR (fora do núcleo do produto).
- **Recursos de contorno de paywall, DRM ou controle de acesso.** Não existe, e não deve ser criada, nenhuma opção de "bypass". O app só acessa conteúdo público ou ao qual a conta do próprio usuário já tem acesso.

---

## 3. Stack proposta

> Se já houver uma stack definida no projeto, adapte; a arquitetura e os contratos valem para qualquer uma.

| Camada | Escolha | Motivo |
|---|---|---|
| Gerenciador | pnpm workspaces | monorepo simples |
| Linguagem | TypeScript (strict) | contratos tipados compartilhados |
| App desktop (shell) | **Tauri 2** | leve, instalável em `%LocalAppData%`, bom para spawnar processos depois |
| UI | React 18 + Vite | ecossistema e velocidade |
| Estilo | Tailwind CSS + componentes próprios (ou shadcn/ui) | tokens de design consistentes |
| Estado | Zustand | simples e suficiente |
| Validação | Zod | validar mensagens e configurações |
| Ícones | lucide-react | leve |
| Extensão | Manifest V3 + Vite (plugin CRXJS ou build manual) | Chrome/Edge |
| Testes | Vitest + Testing Library | unidade e componentes |

Pontos obrigatórios:

- TypeScript `strict: true`, ESLint e Prettier configurados.
- Nenhuma string de interface fixa em componentes: tudo em `i18n/pt-BR.ts`.
- Nenhuma chamada ao backend direta em componentes: sempre via hook `useBackend()`.

---

## 4. Estrutura do repositório

```text
transmute-utils/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   └── shared/                      # contratos usados por desktop e extensão
│       └── src/
│           ├── domain/              # Job, MediaInfo, opções, estados
│           ├── protocol/            # mensagens extensão <-> host
│           ├── backend/             # BackendClient (interface) + eventos
│           ├── errors/              # códigos de erro e mensagens amigáveis
│           └── index.ts
├── apps/
│   ├── desktop/
│   │   ├── src-tauri/               # shell Tauri (sem lógica nesta fase)
│   │   └── src/
│   │       ├── app/                 # providers, rotas, tema
│   │       ├── features/
│   │       │   ├── home/            # captura de URL/arquivo + opções contextuais
│   │       │   ├── queue/           # fila e cartões de job
│   │       │   ├── trim/            # editor de corte
│   │       │   ├── compress/        # compressão por tamanho-alvo
│   │       │   ├── subtitles/       # opções de legenda
│   │       │   ├── settings/        # configurações
│   │       │   └── update/          # diálogo de atualização (mock)
│   │       ├── components/          # design system (Button, Card, Progress, ...)
│   │       ├── services/
│   │       │   ├── backend/         # BackendProvider, useBackend
│   │       │   └── mock/            # MockBackendClient + simulador
│   │       ├── stores/              # Zustand (jobs, settings, ui)
│   │       ├── i18n/
│   │       └── styles/
│   └── extension/
│       ├── manifest.json
│       └── src/
│           ├── background/          # service worker (detecção; mock nesta fase)
│           ├── popup/               # UI React do popup
│           ├── content/             # (reservado)
│           ├── services/            # HostClient (interface) + MockHostClient
│           └── i18n/
└── docs/
    └── DECISOES.md                  # registrar decisões e suposições do agente
```

---

## 5. Contratos compartilhados (`packages/shared`)

Implemente exatamente estes tipos (pode refinar nomes, mantendo a semântica).

### 5.1 Domínio

```ts
export type JobType =
  | 'download' | 'convert' | 'trim' | 'compress' | 'extractAudio' | 'subtitle';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type EncoderKind = 'copy' | 'nvenc' | 'amf' | 'qsv' | 'cpu';

export type JobOrigin = 'desktop' | 'extension';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  origin: JobOrigin;
  input: JobInput;
  outputPath?: string;
  progress: number;            // 0..100
  speedBytesPerSec?: number;
  etaSeconds?: number;
  encoder?: EncoderKind;       // exibido só em "detalhes"
  error?: UserFacingError;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  logs: string[];              // log técnico (só em "Ver detalhes")
}

export type JobInput =
  | { kind: 'url'; url: string; title?: string; options: DownloadOptions }
  | { kind: 'file'; path: string; options: FileOperationOptions };

export interface DownloadOptions {
  mode: 'video' | 'audio';
  quality: 'best' | '1080p' | '720p' | '480p';
  container: 'mp4' | 'mkv' | 'mp3' | 'm4a';
  subtitles?: SubtitleOptions;
}

export interface SubtitleOptions {
  download: boolean;
  embed: boolean;
  language: string;            // ex.: 'pt-BR'
  format: 'srt' | 'vtt';
}

export type FileOperationOptions =
  | { op: 'convert'; container: 'mp4' | 'mkv' | 'webm' | 'mp3' | 'm4a' }
  | { op: 'trim'; startSec: number; endSec: number; precise: boolean }
  | { op: 'compress'; targetSizeMB: number; preciseSize: boolean }
  | { op: 'extractAudio'; format: 'mp3' | 'm4a' };
```

### 5.2 Análise de mídia

```ts
export interface MediaInfo {
  source: 'url' | 'file';
  title: string;
  durationSec: number;
  thumbnailUrl?: string;
  container?: string;
  video?: { codec: string; width: number; height: number; fps: number };
  audio?: { codec: string; channels: number };
  estimatedSizeBytes?: number;
  availableQualities?: Array<'best' | '1080p' | '720p' | '480p'>;
  requiresLogin?: boolean;     // conteúdo que exige sessão do usuário
  suggestions: Array<'download' | 'convert' | 'trim' | 'compress' | 'extractAudio'>;
  canStreamCopyTo?: string[];  // containers possíveis sem recodificar
}
```

### 5.3 BackendClient (única porta de entrada para o backend)

```ts
export interface BackendClient {
  analyzeUrl(url: string): Promise<MediaInfo>;
  analyzeFile(path: string): Promise<MediaInfo>;

  enqueue(input: JobInput, origin?: JobOrigin): Promise<Job>;
  cancel(jobId: string): Promise<void>;
  retry(jobId: string): Promise<Job>;
  remove(jobId: string): Promise<void>;
  listJobs(): Promise<Job[]>;

  subscribe(handler: (event: JobEvent) => void): () => void; // retorna unsubscribe

  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  getHardwareInfo(): Promise<HardwareInfo>;
  checkForUpdate(): Promise<UpdateInfo | null>;

  revealInFolder(path: string): Promise<void>;
  pickOutputFolder(): Promise<string | null>;
}

export type JobEvent =
  | { type: 'STARTED'; jobId: string }
  | { type: 'PROGRESS'; jobId: string; progress: number; speedBytesPerSec?: number; etaSeconds?: number }
  | { type: 'COMPLETED'; jobId: string; outputPath: string }
  | { type: 'ERROR'; jobId: string; error: UserFacingError }
  | { type: 'CANCELLED'; jobId: string };

export interface AppSettings {
  outputFolder: string;
  hardwareAcceleration: 'auto' | 'off';
  theme: 'system' | 'dark' | 'light';
  notifyOnComplete: boolean;
  concurrency: 1;                       // fixo em 1 nesta versão
  browserSessions: BrowserSessionConsent[]; // ver seção 8.4
  advanced: {
    showTechnicalLogs: boolean;
    customCodecArgs?: string;           // campo avançado, oculto por padrão
  };
}

export interface HardwareInfo {
  gpu: 'nvidia' | 'amd' | 'intel' | 'none';
  encoder: EncoderKind;                 // detectado uma vez
}

export interface UpdateInfo {
  currentVersion: string;
  newVersion: string;
  notes?: string;
}
```

### 5.4 Erros amigáveis

```ts
export type ErrorCode =
  | 'UNSUPPORTED_FORMAT' | 'LOGIN_REQUIRED' | 'NETWORK' | 'DISK_FULL'
  | 'MEDIA_UNAVAILABLE' | 'ENCODER_FAILED' | 'UNKNOWN';

export interface UserFacingError {
  code: ErrorCode;
  title: string;      // "Não foi possível processar o arquivo."
  message: string;    // "O formato selecionado não é compatível com esta mídia."
  technicalDetails?: string; // mostrado só em "Ver detalhes"
  retryable: boolean;
}
```

Crie um mapa `ErrorCode → título/mensagem` em `errors/` e use-o tanto no desktop quanto na extensão. `LOGIN_REQUIRED` deve explicar que o conteúdo exige que o usuário esteja logado no navegador com uma conta que tenha acesso, e oferecer o caminho legítimo (abrir Configurações → Sessão do navegador).

### 5.5 Protocolo extensão ↔ host (apenas tipos nesta fase)

```ts
export interface HandoffRequest {
  v: 1;
  id: string;
  type: 'handoff';
  payload: {
    mediaUrl: string;
    pageUrl: string;
    title?: string;
    kind: 'direct' | 'hls' | 'dash';
    preset: Pick<DownloadOptions, 'mode' | 'quality' | 'container'>;
    useBrowserSession: boolean;   // só true se houver consentimento para o domínio
  };
}

export type HostResponse =
  | { v: 1; id: string; ok: true; jobId: string }
  | { v: 1; id: string; ok: false; error: UserFacingError };

export type HostStatus = 'connected' | 'disconnected' | 'not_installed';
```

Regras já definidas para a implementação real (documente, não implemente): mensagens só carregam metadados (limite de 1 MB), host registrado com `allowed_origins` restrito ao ID da extensão, e cookies jamais aparecem em logs.

---

## 6. Simulador (`MockBackendClient`)

Implemente em `apps/desktop/src/services/mock/` e reaproveite o núcleo no mock da extensão.

Comportamento obrigatório:

- **Fila serial:** um job `running` por vez; os demais ficam `pending`.
- **Progresso realista:** progresso sobe em passos irregulares, com velocidade variando (ex.: 2 a 12 MB/s) e ETA coerente. Stream copy termina em poucos segundos; recodificação demora mais.
- **Escolha de encoder simulada:** `copy` quando `canStreamCopyTo` contém o container pedido, senão o encoder de `getHardwareInfo()`, senão `cpu`.
- **Cancelamento:** interrompe o timer, marca `cancelled` e emite `CANCELLED`.
- **Falhas determinísticas para testar a UI**, acionadas por padrões na URL ou no nome do arquivo:
  - URL contendo `fail-format` → `UNSUPPORTED_FORMAT`
  - `fail-login` → `LOGIN_REQUIRED` (e `analyzeUrl` retorna `requiresLogin: true`)
  - `fail-net` → `NETWORK` (retryable)
  - `fail-disk` → `DISK_FULL`
- **`analyzeUrl`:** latência simulada (400–900 ms), retorna `MediaInfo` plausível com várias qualidades.
- **`analyzeFile`:** nomes terminando em `.mkv`, `.mp4`, `.webm`, `.mp3` geram `MediaInfo` diferentes, incluindo casos em que stream copy é possível e casos em que não é.
- **Persistência:** histórico e configurações em `localStorage` (apenas no mock).
- **Modo desenvolvedor:** painel oculto (atalho `Ctrl+Shift+D`) para disparar jobs de teste, forçar erros e simular "host desconectado".

---

## 7. App desktop — telas e comportamento

### 7.1 Layout geral

- Janela única, largura mínima ~720 px. Cabeçalho com nome, botão de fila (com contador de jobs ativos) e botão de configurações.
- Tema escuro por padrão, com opção claro/sistema.
- Toasts para eventos rápidos (job concluído, erro, cópia de link).

### 7.2 Home (tela principal)

Elementos:

1. Campo grande: **"Cole uma URL ou arraste um arquivo aqui"**, com área de drag & drop em toda a janela (realce visual ao arrastar).
2. Botão **Processar** (desabilitado até haver entrada válida).
3. Faixa de resumo da escolha atual (ex.: `MP4 • 1080p • Legenda automática`), clicável para editar.

Fluxo contextual:

```text
Entrada
 ├─ URL  → validar → analyzeUrl (skeleton de carregamento) → card com miniatura, título, duração
 │          → opções: [Baixar vídeo ▾ | Só áudio] + qualidade + legenda (colapsável)
 └─ Arquivo → analyzeFile → card com formato/codecs
            → ações contextuais: Converter · Cortar · Comprimir · Extrair áudio
```

Regras:

- Mostrar no máximo 1 linha de resumo técnico (ex.: "MP4 · H.264 · 1920×1080 · 4 min").
- Se `canStreamCopyTo` incluir o destino, mostrar um selo discreto **"Rápido (sem recodificar)"**. Nunca mostrar a palavra "stream copy" fora de detalhes.
- Se `requiresLogin`, exibir aviso amigável com link para Configurações → Sessão do navegador.
- URL inválida: mensagem inline, sem modal.
- Entrada de vários itens: a Home adiciona cada um à fila.

### 7.3 Editor de corte

- Dois campos de tempo (`HH:MM:SS`) sincronizados com uma linha do tempo de duas alças.
- Área de pré-visualização como placeholder (sem player real nesta fase).
- Aviso informativo quando o corte rápido pode ficar impreciso, com um interruptor **"Corte preciso (mais lento)"**.
- Botão **Exportar** envia um `trim` para a fila.
- Validar `início < fim` e limites da duração.

### 7.4 Compressão

- Modo simples: campo **Tamanho desejado (MB)** + botão **Comprimir**.
- Exibir estimativa de qualidade resultante (ex.: "Boa", "Reduzida") com base em tamanho/duração; fórmula do mock: `bitrate_total = (tamanho_alvo × 8) / duração`, descontando áudio e ~3% de overhead.
- Alerta se o alvo for maior que o arquivo original ("O arquivo já é menor que isso").
- Opção avançada recolhível: **"Melhor precisão de tamanho (mais lento)"**.

### 7.5 Legendas

Componente reutilizável (usado na Home e no download): `☑ Baixar legenda`, `☑ Incorporar no vídeo`, seletor de idioma (padrão Português (Brasil)), formato SRT/VTT.

### 7.6 Fila de tarefas

Painel lateral ou página.

Cartão de job:

- Título/arquivo, tipo (ícone), status.
- Barra de progresso, `%`, velocidade, ETA.
- Ações por estado: **Cancelar** (running/pending), **Tentar novamente** (failed retryable/cancelled), **Abrir pasta** (completed), **Remover**.
- Em falha: título e mensagem amigáveis + **Tentar novamente** + **Ver detalhes** (gaveta com log técnico, encoder usado e código de erro).
- Origem: selo discreto "Enviado pelo navegador" quando `origin === 'extension'`.
- Ordenação: running, pending, depois histórico recente. Botão "Limpar concluídos".
- Estado vazio ilustrado e curto.

### 7.7 Configurações

Seções (navegação lateral simples):

1. **Geral:** pasta de saída, tema, notificações ao concluir.
2. **Aceleração de hardware:** `● Automática  ○ Desativada`. Mostrar, em texto simples, o resultado de `getHardwareInfo()` ("Placa gráfica compatível detectada"), sem jargão.
3. **Navegador e sessão:** ver 8.4.
4. **Avançado (recolhida por padrão):** logs técnicos, argumentos personalizados, abrir pasta de logs/cache, limpar cache.
5. **Sobre:** versão, verificar atualizações, links.

### 7.8 Atualização (mock)

Diálogo **"Nova versão disponível"** com versão atual, nova versão e botões **Atualizar** / **Agora não**. Nunca atualizar silenciosamente. Acionável pelo modo desenvolvedor.

### 7.9 Estados globais que precisam existir

Carregando (skeletons), vazio, erro de análise, sem conexão, "app iniciando", diálogo de confirmação ao fechar com jobs em andamento.

---

## 8. Extensão de navegador (MV3)

### 8.1 Manifest

- `manifest_version: 3`.
- Permissões mínimas: `webRequest`, `downloads`, `storage`, `activeTab`, `nativeMessaging`, `notifications` (opcional).
- `host_permissions` apenas conforme necessário para observar requisições de mídia; documentar a justificativa de cada permissão em `docs/DECISOES.md`.
- Observação técnica: `declarativeNetRequest` **não** serve para observar requisições (só bloquear/modificar). A detecção usa `chrome.webRequest` em modo **não bloqueante** (`onResponseStarted` / `onHeadersReceived`), filtrando por `content-type` e extensões (`.m3u8`, `.mpd`, `.mp4`, `.webm`, `.mp3`, `.m4a`).

### 8.2 Service worker (nesta fase)

- Estrutura real de listeners e armazenamento por aba (`chrome.storage.session`), mas alimentada por **detecções simuladas** em modo dev (botão no popup de desenvolvimento ou flag).
- Deduplicar por URL, limpar ao navegar/fechar a aba, atualizar o badge com o número de mídias.
- Classificar cada detecção em `direct`, `hls` ou `dash`.

### 8.3 Popup

Estados obrigatórios:

| Estado | Conteúdo |
|---|---|
| Nenhuma mídia | Mensagem curta e instrução ("Reproduza um vídeo para detectá-lo") |
| Mídias detectadas | Lista de cartões |
| Host desconectado | Aviso discreto + botão "Instalar/Reconectar" (placeholder) |
| Enviando | Estado de carregamento no botão, depois confirmação "Enviado ao TransmuteUtils" |
| Erro | Mensagem amigável (mesmo mapa de erros do shared) |

Cartão de mídia: miniatura/ícone, título da página, resolução, codec, tamanho estimado, tipo (selo), seletor de qualidade/formato, e dois botões:

- **Baixar no navegador** (via `chrome.downloads`): visível **apenas** para `kind: 'direct'`.
- **Abrir no TransmuteUtils**: sempre disponível para `hls`/`dash`; envia `HandoffRequest` pelo `HostClient` (mock nesta fase).

Rodapé: indicador de status do host (`HostStatus`) e atalho para abrir o app.

### 8.4 Sessão do navegador (representação de consentimento)

Esta é a versão **legítima** do item de autenticação. Nesta fase é só UI + modelo de dados.

```ts
export interface BrowserSessionConsent {
  domain: string;              // ex.: "exemplo.com"
  granted: boolean;
  grantedAt?: number;
  browser: 'chrome' | 'edge' | 'firefox';
}
```

Regras de produto:

- O uso de sessão é **opt-in por domínio**, nunca global. Texto de apoio: *"Use a sua própria conta logada no navegador para baixar conteúdo ao qual você já tem acesso."*
- Lista em Configurações → Navegador e sessão com domínio, data da autorização e botão **Revogar**.
- No popup, ao enviar um handoff para um domínio sem consentimento e com `requiresLogin`, pedir confirmação explícita antes de marcar `useBrowserSession: true`.
- A UI deve deixar claro que, sem acesso da conta ao conteúdo, o app **não** conseguirá baixar (mensagem `LOGIN_REQUIRED`).
- **Não** criar opção de "bypass", "contornar" ou equivalente. Conteúdo com DRM ou bloqueado para a conta do usuário simplesmente não é suportado e deve ter mensagem clara.
- Documentar para a fase de backend: cookies trafegam só pelo canal de Native Messaging, entregues ao yt-dlp via arquivo temporário (formato Netscape) com permissão restrita ou stdin, restritos ao domínio da URL, apagados ao fim do job e nunca registrados em log.

---

## 9. Design system e UX

- **Tokens** (cores, espaçamento, raio, tipografia, sombras) em CSS variables, com temas claro e escuro.
- Estética limpa, foco no campo de entrada. Um único botão de ação primária por tela.
- Componentes: `Button`, `IconButton`, `Input`, `DropZone`, `Select`, `Toggle`, `Progress`, `Card`, `Badge`, `Dialog`, `Drawer`, `Toast`, `Tooltip`, `Skeleton`, `EmptyState`, `Timeline` (corte).
- Animações curtas e sutis; respeitar `prefers-reduced-motion`.
- Acessibilidade: navegação por teclado completa, foco visível, `aria-live` para progresso e erros, contraste AA.
- Atalhos: `Ctrl+V` cola URL na Home, `Enter` processa, `Esc` fecha diálogos.
- Todo texto de interface em `i18n/pt-BR.ts`; estrutura pronta para adicionar `en-US` depois.

---

## 10. Plano de execução (ordem obrigatória)

Cada etapa deve terminar compilando, com lint e testes passando, antes de seguir.

### Etapa 0 — Fundação
- [ ] Monorepo pnpm, TypeScript strict, ESLint, Prettier, Vitest.
- [ ] `packages/shared` com todos os tipos da seção 5 e o mapa de erros.
- [ ] Esqueleto de `apps/desktop` (Tauri + Vite + React) e `apps/extension`.
- [ ] `docs/DECISOES.md` criado.

**Aceite:** `pnpm install && pnpm build && pnpm test` funcionam; desktop abre uma janela vazia; extensão carrega sem erros no Chrome/Edge.

### Etapa 1 — Design system e shell
- [ ] Tokens, temas claro/escuro, componentes base com testes.
- [ ] Layout, cabeçalho, roteamento, toasts, i18n.
- [ ] Página de catálogo de componentes (rota `/dev/components`).

**Aceite:** todos os componentes listados na seção 9 renderizam nos dois temas.

### Etapa 2 — Mock backend
- [ ] `BackendProvider`, `useBackend`, `MockBackendClient` com todas as regras da seção 6.
- [ ] Stores de jobs e settings ligadas aos eventos.
- [ ] Painel de modo desenvolvedor.
- [ ] Testes do simulador (fila serial, cancelamento, falhas determinísticas, escolha de encoder).

**Aceite:** é possível enfileirar, cancelar e repetir jobs pelo painel dev e ver os eventos corretos.

### Etapa 3 — Fila e cartões de job
- [ ] Painel de fila, `JobCard` com todos os estados, gaveta "Ver detalhes".
- [ ] Notificação local (toast) ao concluir.

**Aceite:** os 5 estados de job e os 4 tipos de falha são exibidos corretamente com mensagens amigáveis.

### Etapa 4 — Home contextual
- [ ] Campo de URL, `DropZone` global, validações.
- [ ] Fluxo URL (análise, card, opções, legenda) e fluxo arquivo (ações contextuais).
- [ ] Selo "Rápido (sem recodificar)" baseado em `canStreamCopyTo`.

**Aceite:** colar uma URL ou soltar um arquivo mostra as opções corretas e cria jobs na fila.

### Etapa 5 — Corte, compressão e legendas
- [ ] Editor de corte com linha do tempo de duas alças e validações.
- [ ] Compressão com cálculo de bitrate (mock) e avisos.
- [ ] Componente de legendas reutilizável.

**Aceite:** os três recursos geram jobs com as opções corretas em `JobInput`.

### Etapa 6 — Configurações
- [ ] Todas as seções da 7.7, incluindo Navegador e sessão (8.4), com persistência no mock.
- [ ] Diálogo de atualização (mock) e confirmação ao fechar com jobs ativos.

**Aceite:** alterar uma configuração persiste após recarregar; revogar um domínio atualiza a lista.

### Etapa 7 — Extensão
- [ ] Manifest, service worker com listeners reais e detecção simulada.
- [ ] Popup com todos os estados da 8.3.
- [ ] `HostClient` (interface) + `MockHostClient` com respostas de sucesso/erro/desconectado.
- [ ] Botão "Baixar no navegador" via `chrome.downloads` apenas para `direct`.

**Aceite:** na extensão carregada, as mídias simuladas aparecem, o handoff mockado devolve confirmação, e o estado "host desconectado" é tratado.

### Etapa 8 — Acabamento
- [ ] Revisão de acessibilidade e atalhos.
- [ ] Estados vazios, de carregamento e de erro revisados em todas as telas.
- [ ] README com instruções de execução e lista do que ainda é mock.
- [ ] Lista final de pontos de integração para a fase de backend (um arquivo `docs/INTEGRACAO_BACKEND.md`).

**Aceite:** nenhuma tela exibe erro técnico cru; `docs/INTEGRACAO_BACKEND.md` descreve cada método do `BackendClient` e do `HostClient` que precisa de implementação real.

---

## 11. Regras para o agente

1. Não invente funcionalidades fora deste documento. Se algo for ambíguo, escolha a opção mais simples e registre em `docs/DECISOES.md`.
2. Nunca coloque lógica de backend em componentes; tudo passa por `BackendClient`/`HostClient`.
3. Nenhum termo técnico (NVENC, AMF, QSV, bitrate, codec, preset, stream copy, cookies) na tela inicial.
4. Nenhum erro técnico cru para o usuário.
5. Não implemente contorno de paywall, DRM ou controle de acesso, nem opção com esse propósito.
6. Mantenha commits pequenos por etapa e mensagens descritivas.
7. Ao final de cada etapa, liste o que foi feito, o que é mock e o que falta.

---

## 12. Preparação para a fase de backend (apenas referência)

Será implementado depois, sem alterar a UI:

- `JobManager` no Core, com o mesmo ciclo de vida `Pending → Running → Completed/Failed/Cancelled`.
- Serviços FFmpeg e yt-dlp com eventos de progresso reais e cancelamento seguro (limpando arquivos parciais).
- Detecção de hardware uma única vez na inicialização (testando o encoder com um encode curto), com fallback automático para CPU, inclusive em falhas durante o job.
- Análise de codecs para decidir entre stream copy, GPU e CPU.
- Host de Native Messaging (ponte fina) conectado ao JobManager via IPC local autenticado.
- Atualização separada do `yt-dlp` em relação ao app, por mudar com frequência.

A troca do `MockBackendClient` por um cliente real deve exigir **apenas** uma nova implementação da interface `BackendClient`.
