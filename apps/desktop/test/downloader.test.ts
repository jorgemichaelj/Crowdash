import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBackendClient } from '../src/services/mock/MockBackendClient';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChannelDownloadOptions } from '../src/features/home/tabs/ChannelDownloadOptions';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('web downloader behavior', () => {
  it('the mock and native contracts both treat radio links as individual media', async () => {
    const result = new MockBackendClient().analyzeUrl('https://www.youtube.com/watch?v=elzs9O5AZV8&list=RDelzs9O5AZV8&start_radio=1');
    await vi.advanceTimersByTimeAsync(600);
    const info = await result;
    expect(info.collectionType).toBeUndefined();
    expect(info.canonicalUrl).toBe('https://www.youtube.com/watch?v=elzs9O5AZV8');
    expect(info.playlistUrl).toBeUndefined();
  });
  it('recognizes /channel/ without inventing a count of catalog items', async () => {
    const result = new MockBackendClient().analyzeUrl('https://www.youtube.com/channel/UCIW4y9tEpVmx_iezUVA9blQ');
    await vi.advanceTimersByTimeAsync(600);
    expect(await result).toMatchObject({ collectionType: 'channel', channelName: 'UCIW4y9tEpVmx_iezUVA9blQ' });
    expect((await result).itemCount).toBeUndefined();
  });
  it('offers each channel scope and previews only the selected folders', () => {
    const html = renderToStaticMarkup(React.createElement(ChannelDownloadOptions, {
      media: { source: 'url', title: 'Canal', durationSec: 0, suggestions: ['download'], channelName: 'Crowdash_yt', canonicalUrl: 'https://www.youtube.com/@crowdash_yt', collectionType: 'channel' },
      options: { mode: 'video', quality: 'best', container: 'mp4' },
      onOptionsChange: () => {}, onDownload: async () => {}, downloading: false,
    }));
    expect(html).toContain('Você colocou o link de um canal');
    for (const label of ['Vídeos + thumbnails', 'Só vídeos', 'Shorts', 'Playlists', 'Só thumbnails', 'Publicações', 'Canal todo']) expect(html).toContain(label);
    expect(html).toContain('Crowdash_yt/');
    expect(html).toContain('└── videos/');
    expect(html).not.toContain('└── shorts/');
  });
});
