import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_ID } from '@crowdash/shared';

let listeners: Record<string, (...args: any[]) => any>;
let storage: Record<string, any>;
let api: any;
let tab: { id: number; url: string; title: string };
const sender = { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/popup.html` };
const message = (request: unknown) => new Promise<any>(resolve => listeners.message(request, sender, resolve));

beforeEach(async () => {
  vi.resetModules(); storage = {}; listeners = {}; tab = { id: 7, url: 'https://example.com/watch', title: 'Video page' };
  const listener = (key: string) => ({ addListener: (fn: (...args: any[]) => any) => { listeners[key] = fn; } });
  api = {
    runtime: { id: EXTENSION_ID, onMessage: listener('message'), sendNativeMessage: vi.fn((_host, req, cb) => cb(req.type === 'ping' ? { v: 1, id: req.id, ok: true, status: 'connected' } : { v: 1, id: req.id, ok: true, jobId: 'job-native' })) },
    storage: { session: { get: vi.fn(async (key: string) => ({ [key]: storage[key] })), set: vi.fn(async (data: any) => Object.assign(storage, data)), remove: vi.fn(async (key: string) => { delete storage[key]; }) } },
    tabs: { get: vi.fn(async () => ({ ...tab })), query: vi.fn(async () => [{ ...tab }]), onRemoved: listener('removed'), onUpdated: listener('updated') },
    webRequest: { onHeadersReceived: listener('headers') },
    scripting: { executeScript: vi.fn(async () => [{ result: [{ url: 'https://cdn.example.com/video.mp4', title: 'Video page' }] }]) },
    downloads: { download: vi.fn(async () => 12) },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
  };
  vi.stubGlobal('chrome', api);
  await import('../src/background/index');
});
afterEach(() => vi.unstubAllGlobals());

describe('Manifest V3 service worker', () => {
  it('captures network media, merges DOM results and dispatches the downloads API request', async () => {
    listeners.headers({ tabId: 7, url: 'https://cdn.example.com/video.mp4', statusCode: 206, responseHeaders: [{ name: 'content-type', value: 'video/mp4' }, { name: 'content-range', value: 'bytes 0-100/12345' }] });
    await vi.waitFor(() => expect(storage['tab:7']).toHaveLength(1));
    const state = await message({ type: 'state', refresh: true });
    expect(state.hostStatus).toBe('connected'); expect(state.media).toHaveLength(1); expect(state.media[0].sizeBytes).toBe(12345);
    expect(await message({ type: 'download', mediaId: state.media[0].id })).toEqual({ ok: true });
    expect(api.downloads.download).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://cdn.example.com/video.mp4', saveAs: true }));
  });
  it('survives worker restarts and discards resources after a tab navigates', async () => {
    listeners.headers({ tabId: 7, url: 'https://cdn.example.com/master.m3u8', statusCode: 200, responseHeaders: [] });
    await vi.waitFor(() => expect(storage['tab:7']).toHaveLength(1));
    vi.resetModules(); await import('../src/background/index');
    expect((await message({ type: 'state' })).media).toHaveLength(1);
    tab.url = 'https://example.com/new-page'; listeners.updated(7, { url: tab.url }, tab);
    await vi.waitFor(() => expect(storage['tab:7']).toEqual([]));
    expect((await message({ type: 'state' })).media).toEqual([]);
  });
  it('queues explicit handoffs and rejects messages from outside the extension', async () => {
    const request = { v: 1, id: 'handoff-123', type: 'handoff', payload: { mediaUrl: 'https://example.com/video.mp4', pageUrl: tab.url, kind: 'direct', preset: { mode: 'video', quality: 'best', container: 'mp4' }, useBrowserSession: false } };
    expect(await message({ type: 'handoff', request })).toMatchObject({ ok: true, jobId: 'job-native' });
    const reply = vi.fn(); expect(listeners.message({ type: 'state' }, { id: 'different', url: 'https://example.com' }, reply)).toBe(false); expect(reply).not.toHaveBeenCalled();
  });
  it('starts browser downloads without waiting for the desktop connection', async () => {
    listeners.headers({ tabId: 7, url: 'https://cdn.example.com/video.mp4', statusCode: 200, responseHeaders: [] });
    await vi.waitFor(() => expect(storage['tab:7']).toHaveLength(1));
    api.runtime.sendNativeMessage.mockImplementation(() => {});
    expect(await message({ type: 'download', mediaId: storage['tab:7'][0].id })).toEqual({ ok: true });
    expect(api.runtime.sendNativeMessage).not.toHaveBeenCalled();
    expect(api.downloads.download).toHaveBeenCalledOnce();
  });
  it('does not attach a late network result from the previous page to a new page', async () => {
    let resolveTab!: (tab: unknown) => void;
    api.tabs.get.mockImplementationOnce(() => new Promise(resolve => { resolveTab = resolve; }));
    listeners.headers({ tabId: 7, url: 'https://cdn.example.com/old.mp4', statusCode: 200, responseHeaders: [] });
    tab.url = 'https://example.com/next'; listeners.updated(7, { url: tab.url }, tab);
    resolveTab({ ...tab, url: 'https://example.com/watch' });
    await vi.waitFor(() => expect(storage['tab:7']).toEqual([]));
    expect((await message({ type: 'state' })).media).toEqual([]);
  });
  it('does not attach late DOM inspection results after navigation', async () => {
    let resolveScan!: (frames: unknown) => void;
    api.scripting.executeScript.mockImplementationOnce(() => new Promise(resolve => { resolveScan = resolve; }));
    const response = message({ type: 'state', refresh: true });
    await vi.waitFor(() => expect(api.scripting.executeScript).toHaveBeenCalledOnce());
    tab.url = 'https://example.com/next'; listeners.updated(7, { url: tab.url }, tab);
    resolveScan([{ result: [{ url: 'https://cdn.example.com/old.mp4' }] }]);
    expect(await response).toMatchObject({ pageUrl: tab.url, media: [] });
  });
});
