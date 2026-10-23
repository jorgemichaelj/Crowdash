import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeHostClient } from '../src/services/HostClient';
import type { HandoffRequest } from '@crowdash/shared';
import { NATIVE_HOST_NAME } from '@crowdash/shared';

const request = (): HandoffRequest => ({ v: 1, id: 'req-123', type: 'handoff', payload: {
  mediaUrl: 'https://example.com/video.mp4', pageUrl: 'https://example.com', kind: 'direct',
  preset: { mode: 'video', quality: 'best', container: 'mp4' }, useBrowserSession: false,
} });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('NativeHostClient', () => {
  it('uses real Chrome native messaging and validates the acknowledgement', async () => {
    const send = vi.fn((_host, req, callback) => callback({ v: 1, id: req.id, ok: true, jobId: 'job-real' }));
    vi.stubGlobal('chrome', { runtime: { sendNativeMessage: send } });
    const response = await new NativeHostClient().sendHandoff(request());
    expect(response).toMatchObject({ ok: true, jobId: 'job-real' });
    expect(send).toHaveBeenCalledWith(NATIVE_HOST_NAME, request(), expect.any(Function));
  });
  it('checks connectivity without launching a download', async () => {
    const send = vi.fn((_host, req, cb) => cb({ v: 1, id: req.id, ok: true, status: 'connected' }));
    vi.stubGlobal('chrome', { runtime: { sendNativeMessage: send } });
    expect(await new NativeHostClient().getStatus()).toBe('connected');
    expect(send.mock.calls[0][1].type).toBe('ping');
  });
  it('distinguishes missing registration from a closed desktop app', async () => {
    vi.stubGlobal('chrome', { runtime: { lastError: { message: 'Specified native messaging host not found.' }, sendNativeMessage: (_h: string, _r: unknown, cb: (r?: unknown) => void) => cb() } });
    expect(await new NativeHostClient().getStatus()).toBe('not_installed');
    vi.stubGlobal('chrome', { runtime: { sendNativeMessage: (_h: string, r: { id: string }, cb: (r: unknown) => void) => cb({ v: 1, id: r.id, ok: false, error: { code: 'NETWORK', title: 'Closed', message: 'Open app', retryable: true } }) } });
    expect(await new NativeHostClient().getStatus()).toBe('disconnected');
  });
  it('rejects mismatched replies instead of showing a successful send', async () => {
    vi.stubGlobal('chrome', { runtime: { sendNativeMessage: (_h: string, _r: unknown, cb: (r: unknown) => void) => cb({ v: 1, id: 'wrong', ok: true, jobId: 'job' }) } });
    expect(await new NativeHostClient().sendHandoff(request())).toMatchObject({ ok: false });
  });
  it('times out without leaving the popup waiting indefinitely', async () => {
    vi.useFakeTimers(); vi.stubGlobal('chrome', { runtime: { sendNativeMessage: () => {} } });
    const result = new NativeHostClient().sendHandoff(request());
    await vi.advanceTimersByTimeAsync(20000);
    expect(await result).toMatchObject({ ok: false });
  });
  it('bounds status checks to three seconds when a native host stops responding', async () => {
    vi.useFakeTimers(); vi.stubGlobal('chrome', { runtime: { sendNativeMessage: () => {} } });
    const result = new NativeHostClient().getStatus();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toBe('disconnected');
  });
  it('does not send credentials or local-file URLs', async () => {
    const send = vi.fn(); vi.stubGlobal('chrome', { runtime: { sendNativeMessage: send } });
    const req = request(); req.payload.useBrowserSession = true;
    expect(await new NativeHostClient().sendHandoff(req)).toMatchObject({ ok: false });
    req.payload.useBrowserSession = false; req.payload.mediaUrl = 'file:///private';
    expect(await new NativeHostClient().sendHandoff(req)).toMatchObject({ ok: false }); expect(send).not.toHaveBeenCalled();
  });
});
