import { describe, it, expect } from 'vitest';
import { MockHostClient } from '../src/services/HostClient';
import type { HandoffRequest } from '@crowdash/shared';

describe('MockHostClient', () => {
  it('should return connected status by default', async () => {
    const client = new MockHostClient();
    const status = await client.getStatus();
    expect(status).toBe('connected');
  });

  it('should accept handoff request when connected', async () => {
    const client = new MockHostClient();
    const req: HandoffRequest = {
      v: 1,
      id: 'req_123',
      type: 'handoff',
      payload: {
        mediaUrl: 'https://exemplo.com/media.m3u8',
        pageUrl: 'https://exemplo.com',
        kind: 'hls',
        preset: { mode: 'video', quality: 'best', container: 'mp4' },
        useBrowserSession: false,
      },
    };

    const res = await client.sendHandoff(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.jobId).toBeDefined();
    }
  });

  it('should report error when disconnected', async () => {
    const client = new MockHostClient();
    client.setStatus('disconnected');

    const req: HandoffRequest = {
      v: 1,
      id: 'req_456',
      type: 'handoff',
      payload: {
        mediaUrl: 'https://exemplo.com/media.mp4',
        pageUrl: 'https://exemplo.com',
        kind: 'direct',
        preset: { mode: 'video', quality: 'best', container: 'mp4' },
        useBrowserSession: false,
      },
    };

    const res = await client.sendHandoff(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('NETWORK');
    }
  });
});
