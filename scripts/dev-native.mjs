import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { posix, win32, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function inspectRust({ env = process.env, platform = process.platform, probe = spawnSync } = {}) {
  const paths = platform === 'win32' ? win32 : posix;
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
  const cargoHome = env.CARGO_HOME || paths.join(env.USERPROFILE || env.HOME || homedir(), '.cargo');
  const nextEnv = { ...env, [pathKey]: `${paths.join(cargoHome, 'bin')}${paths.delimiter}${env[pathKey] || ''}` };
  const options = { env: nextEnv, encoding: 'utf8', windowsHide: true, timeout: 15000 };
  const cargo = probe('cargo', ['--version'], options);
  const rustc = probe('rustc', ['--version'], options);
  return { env: nextEnv, cargo, rustc, ready: cargo.status === 0 && rustc.status === 0 };
}

export function rustHelp(result, platform = process.platform) {
  const missing = result.cargo.error?.code === 'ENOENT' || result.rustc.error?.code === 'ENOENT';
  const lines = [missing ? 'Rust/Cargo não foi encontrado. O app desktop precisa dele para compilar.' : 'Rust/Cargo está instalado, mas não conseguiu executar a toolchain.'];
  if (missing) {
    lines.push(platform === 'win32'
      ? 'No PowerShell, instale com: winget install --id Rustlang.Rustup -e'
      : 'Instale o Rust estável seguindo https://rustup.rs/');
  } else {
    lines.push('Configure a versão estável com: rustup default stable');
  }
  if (platform === 'win32') {
    lines.push('Instale também o Visual Studio Build Tools com Desenvolvimento para desktop com C++ e o Windows SDK.');
    lines.push('Depois, feche e abra o PowerShell ou o VS Code inteiro.');
  }
  lines.push('Confira cargo --version e rustc --version e execute pnpm dev:native novamente.');
  lines.push('Para ver somente a interface, use pnpm dev:desktop (downloads simulados).');
  lines.push('Guia completo: docs/WINDOWS.md');
  return lines.join('\n');
}

function main() {
  const result = inspectRust();
  if (!result.ready) {
    console.error(`\n${rustHelp(result)}\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`${result.cargo.stdout.trim()} · ${result.rustc.stdout.trim()}`);
  if (process.argv.includes('--check')) return;
  const desktop = new URL('../apps/desktop/', import.meta.url);
  const require = createRequire(new URL('package.json', desktop));
  // Run the JS CLI directly: no .cmd/shell quoting is needed on Windows.
  const child = spawn(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'dev', ...process.argv.slice(2)], {
    cwd: fileURLToPath(desktop), env: result.env, stdio: 'inherit',
  });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
