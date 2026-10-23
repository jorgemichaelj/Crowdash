import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackend } from '../src/services/backend/createBackend';
import { TauriBackendClient } from '../src/services/backend/TauriBackendClient';
import { MockBackendClient } from '../src/services/mock/MockBackendClient';
import { RuntimeNotice } from '../src/components/layout/RuntimeNotice';

beforeEach(() => { vi.stubGlobal('localStorage', { getItem: () => null }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('download execution mode', () => {
  it('marks ordinary browser previews as simulations', () => {
    vi.stubGlobal('window', {});
    const connection = createBackend();
    expect(connection.mode).toBe('demo');
    expect(connection.client).toBeInstanceOf(MockBackendClient);
  });

  it('requests actual metadata from the native bridge instead of demo fixtures', async () => {
    const metadata = { title: 'Actual media from backend', durationSec: 123 };
    const invoke = vi.fn().mockResolvedValue(metadata);
    vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke } });
    const connection = createBackend();
    expect(connection.mode).toBe('native');
    expect(await connection.client.analyzeUrl('https://example.com/real')).toEqual(metadata);
    expect(invoke).toHaveBeenCalledWith('analyze_url', { url: 'https://example.com/real' }, undefined);
  });

  it('reports native failures instead of substituting sample video information', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: vi.fn().mockRejectedValue('NETWORK: failed to reach media') } });
    const connection = createBackend();
    await expect(connection.client.analyzeUrl('https://example.com/real')).rejects.toMatchObject({ code: 'NETWORK' });
    expect(connection.mode).toBe('native');
  });

  it('does not silently enter demo mode when a declared native runtime has a broken bridge', async () => {
    vi.stubGlobal('window', { isTauri: true });
    const connection = createBackend();
    expect(connection.client).toBeInstanceOf(TauriBackendClient);
    await expect(connection.client.analyzeUrl('https://example.com/real')).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(connection.mode).toBe('native');
  });

  it('explains that the browser preview does not save files and links to the native instructions', () => {
    const html = renderToStaticMarkup(React.createElement(RuntimeNotice, { mode: 'demo' }));
    expect(html).toContain('Modo de demonstração');
    expect(html).toContain('nenhum arquivo será baixado');
    expect(html).toContain('janela do aplicativo CrowDash');
    expect(html).toContain('/blob/main/docs/WINDOWS.md');
  });

  it('does not display a simulated-download warning in the native app', () => {
    expect(renderToStaticMarkup(React.createElement(RuntimeNotice, { mode: 'native' }))).toBe('');
  });
});
