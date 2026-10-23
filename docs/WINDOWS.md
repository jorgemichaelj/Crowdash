# Testar o CrowDash no Windows

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

Se o Cargo foi instalado, mas disser que não há uma versão padrão, execute `rustup default stable`.

## Instalador gerado no GitHub

O workflow **Windows — instalador de teste** pode ser executado manualmente em **Actions → Windows — instalador de teste → Run workflow** depois de essa configuração estar enviada ao GitHub. Ele testa o projeto e compila o instalador NSIS em uma máquina Windows do GitHub.

Quando a execução terminar, baixe o artefato **crowdash-windows-test**, extraia o ZIP e execute o instalador `.exe`. A pasta `extension` do artefato contém a extensão para carregar sem compactação. Ela também é incluída nos recursos do aplicativo instalado e pode ser aberta em **Configurações → Navegador**.

Quem usa o instalador não precisa de Node.js, pnpm, Cargo ou Visual Studio. **Nesta etapa, yt-dlp e FFmpeg/ffprobe ainda são dependências externas:** instale-os no PC onde fará downloads reais e deixe-os no PATH. O instalador de teste não é assinado nem publicado como release automaticamente. Compilação bem-sucedida não substitui o teste de instalação e conexão no computador de destino.

Veja [o guia da extensão](EXTENSAO.md) para conectar o Chrome ou Edge.
