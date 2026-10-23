import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectRust, rustHelp } from './dev-native.mjs';

test('finds Rustup in the Windows user folder even when the terminal has an old PATH', () => {
  const original = { USERPROFILE: 'C:\\Users\\Jorge Jesus', Path: 'C:\\Windows\\System32' };
  const calls = [];
  const result = inspectRust({ env: original, platform: 'win32', probe(command, args, options) {
    calls.push(command);
    assert.deepEqual(args, ['--version']);
    assert.equal(options.env.Path, 'C:\\Users\\Jorge Jesus\\.cargo\\bin;C:\\Windows\\System32');
    assert.equal(options.shell, undefined);
    return { status: 0, stdout: `${command} 1.99.1` };
  } });
  assert.equal(result.ready, true);
  assert.deepEqual(calls, ['cargo', 'rustc']);
  assert.equal(original.Path, 'C:\\Windows\\System32');
  assert.equal('PATH' in result.env, false);
});

test('respects a custom Cargo home without overriding the existing executable search path', () => {
  const result = inspectRust({ env: { CARGO_HOME: '/opt/custom rust', PATH: '/usr/bin' }, platform: 'linux', probe: () => ({ status: 0 }) });
  assert.equal(result.env.PATH, '/opt/custom rust/bin:/usr/bin');
  assert.equal(result.ready, true);
});

test('reports missing Rust with Windows installation instructions instead of cargo metadata errors', () => {
  const result = inspectRust({ env: {}, platform: 'win32', probe: () => ({ status: null, error: { code: 'ENOENT' } }) });
  assert.equal(result.ready, false);
  assert.match(rustHelp(result, 'win32'), /winget install --id Rustlang.Rustup -e/);
  assert.match(rustHelp(result, 'win32'), /VS Code inteiro/);
  assert.match(rustHelp(result, 'win32'), /pnpm dev:desktop/);
});

test('distinguishes an unconfigured toolchain from a missing Cargo installation', () => {
  const result = inspectRust({ probe: command => ({ status: command === 'cargo' ? 0 : 1 }) });
  assert.equal(result.ready, false);
  assert.match(rustHelp(result), /rustup default stable/);
  assert.doesNotMatch(rustHelp(result), /winget install/);
});
