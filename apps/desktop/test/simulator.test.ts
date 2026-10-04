import { describe, it, expect, beforeEach } from 'vitest';
import { MockBackendClient } from '../src/services/mock/MockBackendClient';

// Mock localStorage para ambiente Node vitest
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
});

describe('MockBackendClient Simulator', () => {
  let client: MockBackendClient;

  beforeEach(() => {
    localStorage.clear();
    client = new MockBackendClient();
  });

  it('should analyze URL and return valid MediaInfo', async () => {
    const info = await client.analyzeUrl('https://exemplo.com/video');
    expect(info.source).toBe('url');
    expect(info.title).toBeDefined();
    expect(info.canStreamCopyTo).toContain('mp4');
  });

  it('should enqueue job and manage serial queue status', async () => {
    const job1 = await client.enqueue({
      kind: 'url',
      url: 'https://exemplo.com/sample-1',
      options: { mode: 'video', quality: '1080p', container: 'mp4' },
    });

    const job2 = await client.enqueue({
      kind: 'url',
      url: 'https://exemplo.com/sample-2',
      options: { mode: 'video', quality: '1080p', container: 'mp4' },
    });

    expect(job1.id).toBeDefined();
    // O primeiro job inicia imediatamente na fila serial ('running'), o segundo aguarda ('pending')
    expect(job1.status).toBe('running');
    expect(job2.status).toBe('pending');
  });

  it('should cancel job successfully', async () => {
    const job = await client.enqueue({
      kind: 'url',
      url: 'https://exemplo.com/sample-cancel',
      options: { mode: 'video', quality: '1080p', container: 'mp4' },
    });

    await client.cancel(job.id);
    const jobs = await client.listJobs();
    const updated = jobs.find((j) => j.id === job.id);
    expect(updated?.status).toBe('cancelled');
  });
});
