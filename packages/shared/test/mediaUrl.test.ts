import { describe, expect, it } from 'vitest';
import { classifyMediaUrl, channelFolderName } from '../src/domain/mediaUrl';

describe('YouTube URL routing', () => {
  it('keeps a radio/Mix link on the selected song without enumerating a playlist', () => {
    expect(classifyMediaUrl('https://www.youtube.com/watch?v=elzs9O5AZV8&list=RDelzs9O5AZV8&start_radio=1')).toEqual({
      kind: 'video', url: 'https://www.youtube.com/watch?v=elzs9O5AZV8',
    });
  });
  it('requires a separate explicit action for a video’s ordinary playlist', () => {
    expect(classifyMediaUrl('https://www.youtube.com/watch?v=abc&list=PL123&index=3')).toEqual({
      kind: 'video', url: 'https://www.youtube.com/watch?v=abc', playlistUrl: 'https://www.youtube.com/playlist?list=PL123',
    });
    expect(classifyMediaUrl('https://www.youtube.com/playlist?list=PL123')).toEqual({ kind: 'playlist', url: 'https://www.youtube.com/playlist?list=PL123' });
  });
  it.each([
    ['https://www.youtube.com/channel/UCIW4y9tEpVmx_iezUVA9blQ', 'UCIW4y9tEpVmx_iezUVA9blQ'],
    ['https://www.youtube.com/@gameferrarezi', 'gameferrarezi'],
    ['https://www.youtube.com/@manodeyvin', 'manodeyvin'],
    ['https://www.youtube.com/@manodeyvin/shorts?view=0', 'manodeyvin'],
    ['https://m.youtube.com/user/example', 'example'],
    ['https://www.youtube.com/c/example', 'example'],
  ])('recognizes a channel: %s', (url, name) => {
    expect(classifyMediaUrl(url)).toMatchObject({ kind: 'channel', name });
  });
  it.each(['https://youtu.be/abc?list=RDabc', 'https://www.youtube.com/shorts/abc', 'https://www.youtube.com/live/abc', 'https://music.youtube.com/watch?v=abc'])('recognizes a single video: %s', url => {
    expect(classifyMediaUrl(url)).toEqual({ kind: 'video', url: 'https://www.youtube.com/watch?v=abc' });
  });
  it('does not treat arbitrary hosts or paths as YouTube channels', () => {
    expect(classifyMediaUrl('https://example.org/@someone')).toMatchObject({ kind: 'video' });
    expect(() => classifyMediaUrl('https://www.youtube.com/results?search_query=music')).toThrow();
    expect(() => classifyMediaUrl('file:///etc/passwd')).toThrow();
    expect(() => classifyMediaUrl('https://www.youtube.com/playlist?list=RDabc')).toThrow(/Mix/);
  });
  it('keeps output folder names inside the destination on Windows and Unix', () => {
    expect(channelFolderName('Crowdash_yt')).toBe('Crowdash_yt');
    expect(channelFolderName('../outside')).toBe('_outside');
    expect(channelFolderName('CON')).toBe('_CON');
    expect(channelFolderName('C:\\Windows')).toBe('C__Windows');
    expect(channelFolderName('%(title)s')).not.toContain('%');
  });
});
