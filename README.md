# Crowdash

Crowdash é uma ferramenta rápida e simples para baixar, converter, cortar e comprimir mídia.

> **Status atual:** Fase de Frontend Concluída com Backend Mockado. Todo o design system, telas, navegação, cards, fila de tarefas, editor de corte, diálogo de compressão, configurações e extensão de navegador estão prontos e integrados através de contratos tipados em TypeScript strict mode.

---

## Estrutura do Monorepo

```text
Crowdash/
├── packages/
│   └── shared/          # Contratos TypeScript de domínio, erros amigáveis, protocolo e BackendClient
├── apps/
│   ├── desktop/         # Aplicação desktop com React 18, Vite, Tailwind CSS, Zustand e MockBackendClient
│   └── extension/       # Extensão Manifest V3 com popup React, detecção simulada e MockHostClient
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

> **Atalho de Desenvolvedor:** Pressione `Ctrl + Shift + D` ou clique no ícone de terminal no cabeçalho para abrir o painel de testes do simulador (disparar tarefas de teste, simular falhas determinísticas e verificar atualizações).

### Executar a Extensão do Navegador
```bash
pnpm dev:extension
```
Para carregar a extensão no Chrome/Edge:
1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta `apps/extension/dist` (após rodar `pnpm -r run build`).

### Rodar os Testes Automatizados
```bash
pnpm test
```

### Rodar o Build de Produção
```bash
pnpm build
```

---

## Recursos Mockados Nesta Fase

- **MockBackendClient:** Simula fila serial (1 tarefa ativa por vez), latência de rede realista, variação de velocidade (2 a 12 MB/s), ETA estimado, encoders simulados e persistência via `localStorage`.
- **Triggers de Teste Determinísticos:**
  - URLs com `fail-format` geram erro amigável de formato incompatível.
  - URLs com `fail-login` simulam exigência de login com a conta do usuário.
  - URLs com `fail-net` simulam queda de conexão (com opção "Tentar novamente").
  - URLs com `fail-disk` simulam disco cheio.
- **MockHostClient:** Simula comunicação da extensão com o app desktop, permitindo alternar status de conexão e enviar tarefas via handoff.
