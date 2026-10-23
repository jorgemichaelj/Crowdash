import { classifyMediaUrl } from '@crowdash/shared';

export interface DetectedMedia {
  id: string;
  url: string;
  pageUrl: string;
  title: string;
  kind: 'direct' | 'hls' | 'dash' | 'page';
  sizeBytes?: number;
  resolution?: string;
  source: 'network' | 'page' | 'dom';
}

export function httpUrl(value: string): string | undefined {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && value.length <= 16384 ? u.href : undefined; }
  catch { return undefined; }
}

export function youtubeMedia(pageUrl: string, title: string): DetectedMedia | undefined {
  try {
    const host = new URL(pageUrl).hostname;
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'].includes(host)) return;
    const result = classifyMediaUrl(pageUrl);
    if (result.kind !== 'video') return;
    return { id: crypto.randomUUID(), url: result.url, pageUrl, title: title.slice(0, 512) || 'Vídeo do YouTube', kind: 'page', source: 'page' };
  } catch { return undefined; }
}

export function classifyMediaResource(value: string, mime = ''): 'direct' | 'hls' | 'dash' | undefined {
  const url = httpUrl(value);
  if (!url) return;
  const parsed = new URL(url), path = parsed.pathname.toLowerCase(), type = mime.toLowerCase().split(';')[0].trim();
  if (parsed.hostname === 'googlevideo.com' || parsed.hostname.endsWith('.googlevideo.com')) return;
  if (/\.(?:ts|m4s|cmfv|cmfa)$/.test(path)) return; // fragments are not complete videos
  if (path.endsWith('.m3u8') || ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl', 'audio/x-mpegurl'].includes(type)) return 'hls';
  if (path.endsWith('.mpd') || type === 'application/dash+xml') return 'dash';
  if (/\.(?:mp4|webm|mkv|mov|m4v|mp3|m4a|ogg|oga|wav|flac|aac)$/.test(path) || /^(video|audio)\//.test(type)) return 'direct';
}

export function mergeMedia(existing: DetectedMedia[], incoming: DetectedMedia[]): DetectedMedia[] {
  const entries = new Map(existing.map(item => [item.url, item]));
  for (const item of incoming) {
    if (!httpUrl(item.url) || !httpUrl(item.pageUrl)) continue;
    const old = entries.get(item.url);
    entries.set(item.url, { ...old, ...item, id: old?.id || item.id, title: item.title.slice(0, 512), sizeBytes: item.sizeBytes ?? old?.sizeBytes });
  }
  return [...entries.values()].slice(-60);
}

export function mediaFileName(item: DetectedMedia): string | undefined {
  const extension = new URL(item.url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (!extension) return;
  const title = item.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 120) || 'CrowDash';
  return `${/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(title) ? '_' : ''}${title}.${extension}`;
}
