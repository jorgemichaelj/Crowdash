# Registro de Decisões de Arquitetura e Suposições — Crowdash

Este documento registra as decisões tomadas, suposições adotadas e justificativas arquiteturais ao longo da implementação do **Crowdash** (Fase Frontend com Backend Mockado).

---

## Decisão 001: Nome do Projeto e Rebranding
- **Contexto:** O projeto anterior chamava-se Transmute Utils. O novo produto evoluiu e chama-se **Crowdash**.
- **Decisão:** Manter todos os pacotes `@crowdash/*` (`@crowdash/shared`, `@crowdash/desktop`, `@crowdash/extension`). Toda menção ao produto na UI e i18n refere-se a **Crowdash**.
- **Impacto:** Identidade unificada e moderna.

## Decisão 002: Monorepo e Gerenciador de Pacotes
- **Contexto:** O plano requer um monorepo com desktop, extensão e pacote compartilhado de tipos/contratos.
- **Decisão:** Uso de `pnpm workspaces` com Node.js LTS (v24.x) e TypeScript strict mode compartilhado via `tsconfig.base.json`.
- **Impacto:** Compartilhamento direto de tipos e regras de validação sem necessidade de publicar pacotes intermediários.

## Decisão 003: Permissões da Extensão (Manifest V3)
- **Contexto:** O popup da extensão precisa listar mídias detectadas na aba atual e oferecer download direto ou handoff para o app desktop via Native Messaging.
- **Justificativas de permissões:**
  - `webRequest`: Necessário para inspecionar cabeçalhos de resposta HTTP (`onResponseStarted` / `onHeadersReceived`) de forma não-bloqueante para capturar fluxos HLS (`.m3u8`), DASH (`.mpd`) e links diretos de mídia.
  - `downloads`: Permite que o usuário baixe diretamente pelo navegador mídias do tipo `direct`.
  - `storage`: Persistência de preferências de sessão e histórico local de detecções.
  - `activeTab`: Permite obter título, URL e favicons da aba em foco para enriquecer o card de mídia.
  - `nativeMessaging`: Permite comunicação com o host fino do app desktop (mockado nesta fase).
- **Sem contorno de paywall / DRM:** O produto não possui recursos de bypass ou quebra de DRM. Apenas conteúdo público ou autorizado via sessão do próprio usuário logado é tratado.

## Decisão 004: Isolamento da Camada de Backend via `BackendClient`
- **Contexto:** O app desktop e a extensão não devem conter chamadas diretas a ferramentas de sistema (FFmpeg, yt-dlp, etc.).
- **Decisão:** Criação de interface estrita `BackendClient` em `@crowdash/shared` com implementação `MockBackendClient` em `@crowdash/desktop` e `MockHostClient` em `@crowdash/extension`.
- **Impacto:** A transição para a futura fase de backend exigirá apenas implementar a interface real em Rust/Tauri sem tocar em nenhuma tela ou componente de UI.
