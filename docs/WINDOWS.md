# Testar o CrowDash no Windows

## CrowDash 0.1.0 instalável — Windows 10/11 de 64 bits

Em [Actions → Windows — instalador de teste](https://github.com/jorgemichaelj/Crowdash/actions/workflows/windows-installer.yml), abra uma execução **concluída com sucesso** da branch `release/windows-v0.1.0` ou da `main` depois do merge. Baixe **Artifacts → crowdash-windows-test**, extraia o ZIP e execute o arquivo `CrowDash_0.1.0_x64-setup.exe` (o nome pode variar conforme a versão do Tauri).

O instalador instala para o usuário atual, cria um atalho no menu Iniciar e inclui **yt-dlp, FFmpeg, ffprobe, Deno e a extensão**. Não precisa instalar Node.js, pnpm, Rust, Visual Studio ou ferramentas de mídia no computador de uso. Se o WebView2 ainda não estiver instalado, o bootstrapper incluído baixa o runtime da Microsoft durante a instalação, com conexão à internet.

Abra o **CrowDash pelo menu Iniciar**. Em **Configurações → Geral**, escolha a pasta de destino. Para o primeiro teste, cole o link de um vídeo público curto, clique em **Analisar**, escolha MP4 ou MP3 e acompanhe a fila. Para comprimir, abra **Comprimir**, escolha um vídeo pelo seletor de arquivos e defina o tamanho desejado. Os arquivos originais são entradas do FFmpeg; a saída fica na pasta configurada.

A extensão é carregada manualmente pelo Chrome/Edge nesta versão. No app, abra **Configurações → Navegador → Abrir pasta da extensão** e siga [o guia da extensão](EXTENSAO.md).

O artefato inclui `SHA256SUMS.txt`, com o checksum do instalador, e `runtime-manifest.json`, com as versões e hashes das ferramentas. Dentro do app instalado, `runtime/notices/` contém licenças, informações do fornecedor e referências de código-fonte. É uma versão de teste, ainda sem assinatura digital ou atualização automática.

## Somente a interface, sem instalar ferramentas no PC

Abra [um GitHub Codespace](https://codespaces.new/jorgemichaelj/Crowdash?ref=main). No terminal do próprio navegador:

```bash
npx --yes pnpm@12.14.0 install --frozen-lockfile
npx --yes pnpm@12.14.0 --filter @crowdash/desktop dev --host 0.0.0.0
```

Em **Portas**, abra a porta **5173** no navegador. Esse modo usa dados e downloads simulados; não conecta a extensão ao aplicativo nativo. Mantenha a porta privada: você pode abrir a interface autenticado com a mesma conta do GitHub.

## Compilar o aplicativo no computador

Instale Node.js 24+, Git e pnpm 12. No PowerShell:

```powershell
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install --id yt-dlp.yt-dlp -e
winget install --id Gyan.FFmpeg -e
```

No instalador do Visual Studio, confirme **Desenvolvimento para desktop com C++**, MSVC e Windows SDK. O aplicativo usa também o [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/), normalmente presente no Windows 10/11.

Feche e abra o PowerShell. Se estiver usando o terminal do VS Code, reinicie o VS Code inteiro. Confira:

```powershell
cargo --version
rustc --version
yt-dlp --version
ffmpeg -version
ffprobe -version
```

Na pasta do repositório:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd check:rust
pnpm.cmd dev:native
```

O comando nativo procura também `%USERPROFILE%\.cargo\bin` (ou `%CARGO_HOME%\bin`), mesmo se o terminal ainda não tiver recebido esse caminho no PATH. Se o Rust estiver ausente ou a toolchain não estiver configurada, ele mostra instruções antes de chamar o Tauri. Essa checagem não verifica o compilador C++, SDK ou WebView2; as demais falhas continuam sendo reportadas pelo Tauri.

Depois de executar `dev:native`, aguarde a compilação e use a **janela do CrowDash** que abre automaticamente. O endereço `localhost:5173` exibido pelo Vite abre uma prévia no navegador, com downloads simulados. No navegador, o app exibe **Modo de demonstração** e o botão **Simular download**. A janela nativa identifica-se como **Aplicativo desktop**. Se aparecer “Amostra de Demonstração” ao analisar um link, você está no simulador; a análise nativa consulta os metadados reais com yt-dlp.

Se o Cargo foi instalado, mas disser que não há uma versão padrão, execute `rustup default stable`.

## Instalador gerado no GitHub

O workflow **Windows — instalador de teste** pode ser executado manualmente em **Actions → Windows — instalador de teste → Run workflow** depois de essa configuração estar enviada ao GitHub. Ele testa o projeto e compila o instalador NSIS em uma máquina Windows do GitHub.

Quando a execução terminar, baixe o artefato **crowdash-windows-test**, extraia o ZIP e execute o instalador `.exe`. A pasta `extension` do artefato contém a extensão para carregar sem compactação. Ela também é incluída nos recursos do aplicativo instalado e pode ser aberta em **Configurações → Navegador**.

O workflow verifica TypeScript, testes e as ferramentas baixadas, compila o instalador e faz um teste de instalação em um caminho com espaços. O app instalado é iniciado com um PATH que contém somente as pastas do Windows; o teste envia downloads MP4, HLS e DASH pelo executável de Native Messaging e verifica as saídas com ffprobe. Também verifica a desinstalação e a remoção do registro do host no navegador. Isso não substitui o teste manual com YouTube e a extensão no seu computador.

Para gerar o instalador localmente no Windows, instale também Python 3.11+ e execute `pnpm.cmd build:windows`. As versões e checksums das ferramentas estão fixados em `scripts/windows-runtime.json`; os binários são gerados em `apps/desktop/src-tauri/runtime/` e não entram no Git. O perfil `tauri.windows-release.conf.json` inclui esses recursos apenas no build de distribuição; `dev:native` continua permitindo as ferramentas do PATH em desenvolvimento.

Veja [o guia da extensão](EXTENSAO.md) para conectar o Chrome ou Edge.
