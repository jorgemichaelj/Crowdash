# Extensão CrowDash para Chrome e Edge

A extensão Manifest V3 detecta mídia real e usa Native Messaging para se comunicar com o aplicativo desktop. A versão atual pode ser carregada sem compactação. A publicação na Chrome Web Store é uma etapa separada.

## Testar no computador

Para usar o instalador Windows 0.1.0, siga [o guia do Windows](WINDOWS.md); as ferramentas de mídia já são incluídas. Para desenvolver a partir do código, os pré-requisitos são Node.js 24+, pnpm 12+, Rust estável, pré-requisitos nativos do Tauri 2, yt-dlp e FFmpeg no PATH.

Na raiz do projeto:

```bash
pnpm install --frozen-lockfile
pnpm dev:native
```

Esse comando gera a extensão antes de iniciar o app. Abra `chrome://extensions` ou `edge://extensions`, ative **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione `apps/extension/dist`.

No CrowDash, abra **Configurações → Navegador → Extensão CrowDash**. O app registra a conexão automaticamente ao iniciar; o botão **Conectar extensão** refaz esse registro. **Abrir pasta da extensão** mostra a pasta correta tanto em desenvolvimento quanto no aplicativo empacotado.

Abra uma página com vídeo ou música, reproduza a mídia e abra o popup do CrowDash. **Atualizar** procura fontes já presentes na página. Novas requisições de mídia são capturadas em segundo plano, e o ícone mostra a quantidade encontrada.

- **Enviar ao CrowDash**: adiciona o vídeo ou áudio à fila real. A extensão pode abrir o aplicativo se ele estiver fechado.
- **No navegador**: usa o gerenciador real de downloads do Chrome/Edge para arquivos diretos, com escolha de destino.
- **Abrir página no CrowDash**: abre a página para análise no app. Use esta opção para escolher formatos, playlists e conteúdo de canais.

O modo `pnpm dev:desktop` continua usando o simulador no navegador. A integração com a extensão exige o aplicativo nativo.

## Detecção

- Fontes de `<video>`, `<audio>`, `<source>` e metadados de mídia, inclusive em frames acessíveis.
- Arquivos de vídeo/áudio e manifests HLS (`.m3u8`) e DASH (`.mpd`) por URL ou Content-Type.
- No YouTube, um único link do vídeo; fragmentos `googlevideo.com` não aparecem como downloads separados. Links com rádio/Mix continuam apontando ao vídeo indicado.
- Fontes `blob:` e fragmentos `.ts`/`.m4s` não são tratados como vídeos completos. O botão de enviar a página permite analisar esses casos no app.
- A lista é deduplicada e limitada a 60 itens por aba. Ela é guardada em `chrome.storage.session`, sobrevive ao reinício do service worker e é limpa quando a aba navega ou fecha.
- Resultados de inspeções e requisições pendentes de uma página anterior são descartados quando a aba navega. Downloads pelo navegador não dependem da resposta do app; a verificação de conexão tem limite de três segundos.

A extensão não encaminha cookies ao desktop. Mídias que exigem uma sessão de navegador não são apresentadas como garantidamente baixáveis pelo app.

## Conexão nativa e instalação

O host chama-se `com.crowdash.host`. A chave pública no manifesto fixa o ID da extensão, conferido por teste contra `packages/shared/src/protocol/nativeHost.json`. Somente essa origem pode iniciar o host.

O próprio executável do CrowDash atende Native Messaging quando iniciado pelo navegador. Nesse modo, stdout contém apenas mensagens JSON com prefixo binário de 32 bits e limite de 1 MiB. Nenhuma segunda aplicação ou script Python é necessário para a conexão.

O aplicativo escuta em uma porta aleatória de loopback. O host lê um token de conexão restrito ao usuário atual e autentica cada mensagem. Reenvios recentes com o mesmo ID recebem a resposta já registrada (cache de até 256 solicitações). O comando de status não abre o aplicativo; uma solicitação de envio pode iniciá-lo.

As ações recebidas antes de a interface ficar pronta são guardadas em fila e consumidas na ordem de chegada. A interface registra o listener antes de consultar essa fila; um resultado já retirado do backend é entregue mesmo durante a reinicialização de efeitos do React em desenvolvimento.

O registro é por usuário:

- Windows: manifesto em `%APPDATA%\Crowdash\native-messaging`, com chaves HKCU de NativeMessagingHosts para Chrome, Edge e Chromium. O instalador NSIS contém limpeza dessas chaves na desinstalação.
- Linux: `NativeMessagingHosts` nas pastas de configuração de Chrome, Chromium e Edge.
- macOS: `NativeMessagingHosts` nas pastas de Application Support desses navegadores.

`pnpm build:native` gera a extensão primeiro e inclui seu pacote nos recursos do aplicativo. Depois de instalar ou mover uma compilação de desenvolvimento, inicie o app para atualizar o caminho registrado. Não é necessário editar IDs ou fornecer tokens manualmente.

O workflow manual **Windows — instalador de teste** gera um instalador NSIS e a pasta da extensão como artefato do GitHub Actions. Veja [o guia do Windows](WINDOWS.md). O instalador e a conexão Chrome/Edge ainda precisam ser testados no Windows de destino.

## Validação

```bash
pnpm lint
pnpm test
pnpm build
cargo test --manifest-path crates/extension-bridge/Cargo.toml
cargo test --manifest-path crates/download-core/Cargo.toml
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Para testes automatizados de protocolo/filas sem abrir uma WebView, há um runner que usa o mesmo builder e backend do app:

```bash
XDG_CONFIG_HOME="$(mktemp -d)" cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --example extension-test-server
```

No Linux ele ainda requer GTK e um display, como Xvfb. Execute runners em uma configuração de usuário isolada (por exemplo, `XDG_CONFIG_HOME` temporário), pois o backend registra o host nativo ao iniciar.

Na nuvem de desenvolvimento foram verificados: framing e autenticação, mensagens ao executável real e à fila do backend de produção, downloads locais MP4, HLS e DASH reproduzíveis, scanner DOM em uma página real do Chromium, testes do service worker e builds. O carregamento da extensão no Chromium da nuvem foi bloqueado por política administrativa. O fluxo completo de instalação/carregamento no Chrome ou Edge do Windows deve ser conferido no computador de destino; o instalador Windows não foi executado nesta máquina Linux.
