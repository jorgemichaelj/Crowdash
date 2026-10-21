# Downloads do YouTube

## Vídeo, playlist e canal são escolhas distintas

- `watch?v=ID`, `youtu.be/ID`, `/shorts/ID` e `/live/ID`: vídeo individual.
- Um `watch?v=ID&list=...` continua sendo um vídeo individual. Os parâmetros de lista e rádio são removidos antes da análise e do download. Para playlists comuns, a interface oferece uma ação separada para abrir a coleção.
- Listas `RD...` são Mix/rádio gerados pelo YouTube e não são baixadas como playlist completa.
- `/playlist?list=PL...`: playlist explícita. A análise busca só uma entrada; a enumeração acontece durante o download.
- `/channel/ID`, `/@handle`, `/c/nome` e `/user/nome`, inclusive suas abas: canal. A análise resolve metadados com uma amostra limitada, sem contar o catálogo inteiro.
- Hosts e caminhos são analisados como URLs, sem correspondências frágeis como `contains("list=")` ou `contains("youtube.com")`.

O backend limita a análise a 30 segundos, com timeout de socket e tentativas limitadas. A UI ignora respostas de uma análise antiga após o usuário editar o link.

## Formatos

Vídeo: MP4 ou MKV, melhor qualidade disponível ou limite de 1080p, 720p e 480p. Áudio: MP3 ou M4A. FFmpeg precisa estar no PATH para extração/conversão e junção dos streams. yt-dlp atualizado deve estar no PATH para análise/download. O modo web (`pnpm dev:desktop`) continua usando o simulador; downloads reais são executados pelo app Tauri.

## Iniciar com downloads reais

Com Rust estável, os pré-requisitos nativos do Tauri 2, yt-dlp e FFmpeg instalados, execute na raiz:

```bash
pnpm install --frozen-lockfile
pnpm dev:native
```

O comando abre a janela nativa e inicia o Vite automaticamente. `pnpm build:native` gera o aplicativo. `pnpm dev:desktop` abre somente o frontend web com simulação; esse modo não faz downloads reais.

## Canal

Opções: vídeos com thumbnails; só vídeos; shorts; playlists; só thumbnails; publicações; canal todo.

Na pasta de destino configurada:

```text
Crowdash_yt/
├── videos/
├── shorts/
├── playlists/
│   └── Nome da playlist/
├── thumbs/
└── publicacoes/
    ├── publicacoes.json
    ├── publicacoes.md
    └── imagens/
```

Apenas as seções escolhidas são criadas. Vídeos + thumbnails cria `videos` e `thumbs`. Canal todo baixa as seções públicas disponíveis; transmissões ao vivo e conteúdo privado não estão incluídos. Thumbnails de vídeos/shorts/playlists são colocadas em `thumbs` quando a opção inclui capas. Só thumbnails usa a aba de vídeos e não baixa os arquivos de vídeo. Nomes de pasta são higienizados para Windows e Unix. O nome exibido é fornecido pelos metadados do canal; se não estiver disponível, usa-se o identificador da URL.

As tarefas de coleção carregam explicitamente URL, seleção e nome do canal. A quantidade é opcional: não há contagens fictícias. A fila possui um único worker. As duas saídas do yt-dlp são consumidas em paralelo para evitar bloqueio de pipes; falhas preservam os diagnósticos. Vídeos individuais usam o caminho reportado após a movimentação do arquivo, em vez de escolher o arquivo mais recente da pasta.

## Publicações

O yt-dlp extrai mídias vinculadas a posts, mas não arquiva os próprios textos e imagens. O núcleo exporta as publicações públicas via página `/posts` e continuações públicas de navegação do YouTube. Texto/metadados ficam em JSON e Markdown, imagens em arquivos locais. Cada página concluída é salva, preservando resultados parciais em caso de interrupção. Paginação repetida ou resposta inesperada resulta em erro explícito; não é tratada como exportação completa. Imagens conservam a extensão correspondente ao tipo recebido.

Essa integração depende do formato público das respostas do YouTube. Conteúdo indisponível, sessão exigida e mudanças de layout são erros reportados ao usuário.

## Validação

```bash
pnpm lint
pnpm test
pnpm build
cargo test --manifest-path crates/download-core/Cargo.toml
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

O núcleo Rust é independente do Tauri e pode ser testado sem GTK/WebKit. Para compilar o app nativo no Linux, instale também as bibliotecas de desenvolvimento do Tauri (GTK 3, WebKitGTK 4.1 e AppIndicator). No Windows, use os pré-requisitos oficiais do Tauri 2 (Rust, Visual Studio C++ Build Tools e WebView2).
