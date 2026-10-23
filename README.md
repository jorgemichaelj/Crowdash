# Crowdash

Crowdash é uma ferramenta rápida e simples para baixar, converter e comprimir mídia.

> **Status atual:** Interface, backend Tauri e extensão Native Messaging implementados. O modo web usa o simulador; downloads reais são executados pelo aplicativo nativo com yt-dlp e FFmpeg.

---

## Estrutura do Monorepo

```text
Crowdash/
├── packages/
│   └── shared/          # Contratos TypeScript de domínio, erros amigáveis, protocolo e BackendClient
├── apps/
│   ├── desktop/         # Aplicação desktop com React 18, Vite, Tailwind CSS, Zustand e MockBackendClient
│   └── extension/       # Extensão Manifest V3 com popup React, detecção de mídia e Native Messaging
├── docs/
│   ├── DECISOES.md      # Registro de decisões arquiteturais e suposições
│   └── INTEGRACAO_BACKEND.md # Guia completo para integração com FFmpeg, yt-dlp e Tauri
└── Crowdash_Plano_Frontend_Antigravity.md
```

---

## Como Executar

### Pré-requisitos
- Node.js LTS (v24+)
- pnpm (v12+)

### Instalação
```bash
pnpm install
```

### Executar o App Desktop em Modo Desenvolvimento
```bash
pnpm dev:desktop
```
Acesse no navegador: `http://localhost:5173`.

Para testar somente a interface em qualquer computador, sem instalar ferramentas, abra [um GitHub Codespace](https://codespaces.new/jorgemichaelj/Crowdash?ref=main) e siga o [guia de teste no navegador e no Windows](docs/WINDOWS.md).

> **Atalho de Desenvolvedor:** Pressione `Ctrl + Shift + D` ou clique no ícone de terminal no cabeçalho para abrir o painel de testes do simulador (disparar tarefas de teste, simular falhas determinísticas e verificar atualizações).

### Executar a Extensão do Navegador

```bash
pnpm dev:native
```

O comando gera `apps/extension/dist` e inicia o aplicativo nativo. No Chrome/Edge, abra `chrome://extensions` ou `edge://extensions`, ative o modo do desenvolvedor e carregue essa pasta sem compactação. No app, **Configurações → Navegador → Extensão CrowDash** permite conferir/refazer a conexão e abrir a pasta da extensão.

A extensão detecta mídias reais, permite downloads diretos pelo navegador e envia tarefas ao aplicativo por Native Messaging. Consulte [instalação, funcionamento e validação da extensão](docs/EXTENSAO.md).

### Downloads de vídeos, playlists e canais

Links de Mix/rádio são tratados como vídeo individual. Playlists exigem uma escolha explícita; canais abrem opções de vídeos, shorts, playlists, thumbnails e publicações, com pastas por canal e conteúdo selecionado.

O modo web usa o simulador. Downloads reais usam `pnpm dev:native`, com os pré-requisitos do Tauri 2, yt-dlp e FFmpeg instalados. Veja [o fluxo de downloads do YouTube](docs/DOWNLOADS_YOUTUBE.md) para formatos, estrutura de pastas e comandos de validação do núcleo Rust.

`pnpm check:rust` verifica Cargo e rustc. O comando de desenvolvimento nativo também faz essa verificação e procura a instalação padrão do Rustup antes de iniciar o Tauri, com instruções para resolver dependências ausentes.

### Gerar um instalador Windows sem compilar no PC

Em **Actions → Windows — instalador de teste**, execute **Run workflow**. A execução testa o projeto e disponibiliza o instalador NSIS e a extensão no artefato `crowdash-windows-test`. Não cria uma release automaticamente. O computador de destino ainda precisa de yt-dlp e FFmpeg para downloads e conversões reais; Node.js e Rust são necessários apenas para desenvolvimento. Consulte [o guia do Windows](docs/WINDOWS.md).

### Rodar os Testes Automatizados
```bash
pnpm test
```

### Rodar o Build de Produção
```bash
pnpm build
```

---

## Modo Web e Simulador

- **MockBackendClient:** Simula fila serial (1 tarefa ativa por vez), latência de rede realista, variação de velocidade (2 a 12 MB/s), ETA estimado, encoders simulados e persistência via `localStorage`.
- **Triggers de Teste Determinísticos:**
  - URLs com `fail-format` geram erro amigável de formato incompatível.
  - URLs com `fail-login` simulam exigência de login com a conta do usuário.
  - URLs com `fail-net` simulam queda de conexão (com opção "Tentar novamente").
  - URLs com `fail-disk` simulam disco cheio.
- A extensão usa `NativeHostClient` e a fila real do aplicativo; os controles de captura e conexão simuladas foram removidos.
