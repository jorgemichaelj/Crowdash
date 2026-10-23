import { describe, expect, it } from 'vitest';
import { classifyMediaResource, mediaFileName, mergeMedia, youtubeMedia } from '../src/background/media';
import { createHash } from 'node:crypto';
import { EXTENSION_ID } from '@crowdash/shared';
import manifest from '../manifest.json';

describe('real media detection', () => {
  it('detects MP4/audio and HLS/DASH manifests by MIME or URL', () => {
    expect(classifyMediaResource('https://example.com/video.mp4?token=abc')).toBe('direct');
    expect(classifyMediaResource('https://example.com/stream', 'video/webm')).toBe('direct');
    expect(classifyMediaResource('https://example.com/master.m3u8')).toBe('hls');
    expect(classifyMediaResource('https://example.com/stream', 'application/dash+xml; charset=utf-8')).toBe('dash');
  });
  it('ignores media fragments, blob URLs and YouTube stream fragments', () => {
    expect(classifyMediaResource('https://example.com/segment.m4s', 'video/mp4')).toBeUndefined();
    expect(classifyMediaResource('https://r1.googlevideo.com/videoplayback', 'video/mp4')).toBeUndefined();
    expect(classifyMediaResource('blob:https://example.com/123')).toBeUndefined();
    expect(classifyMediaResource('https://example.com/image.jpg', 'image/jpeg')).toBeUndefined();
  });
  it('sends the selected YouTube video instead of a generated radio playlist', () => {
    const candidate = youtubeMedia('https://www.youtube.com/watch?v=abc&list=RDabc&start_radio=1', 'Minha música');
    expect(candidate).toMatchObject({ url: 'https://www.youtube.com/watch?v=abc', kind: 'page', title: 'Minha música' });
    expect(youtubeMedia('https://www.youtube.com/@canal', 'Canal')).toBeUndefined();
  });
  it('deduplicates resources while preserving the ID and discovered size', () => {
    const item = { id: 'one', url: 'https://example.com/media.mp4', pageUrl: 'https://example.com', title: 'Media', kind: 'direct' as const, source: 'network' as const, sizeBytes: 123 };
    const merged = mergeMedia([item], [{ ...item, id: 'two', source: 'dom', sizeBytes: undefined }]);
    expect(merged).toHaveLength(1); expect(merged[0]).toMatchObject({ id: 'one', sizeBytes: 123 });
    expect(mediaFileName({ ...item, title: '../CON:thing' })).not.toMatch(/[/:]/);
    expect(mediaFileName({ ...item, url: 'https://example.com/opaque-download' })).toBeUndefined();
  });
  it('pins the same extension ID used by the native host allowlist', () => {
    const hex = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
    const id = [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
    expect(id).toBe(EXTENSION_ID); expect(manifest.background.service_worker).toBe('background.js');
  });
});
