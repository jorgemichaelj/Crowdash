export interface PageMedia { url: string; title: string; resolution?: string; mime?: string }

/** Self-contained: Chrome serializes this function and executes it inside each frame. */
export function scanPageMedia(): PageMedia[] {
  const result: PageMedia[] = [];
  for (const el of document.querySelectorAll('video, audio, source, meta[property="og:video"], meta[property="og:video:url"], meta[property="og:audio"]')) {
    const media = el as HTMLMediaElement;
    const url = media.currentSrc || el.getAttribute('src') || el.getAttribute('content');
    if (!url) continue;
    try {
      result.push({ url: new URL(url, document.baseURI).href, title: document.title, mime: el.getAttribute('type') || undefined,
        resolution: el instanceof HTMLVideoElement && el.videoHeight ? `${el.videoWidth}×${el.videoHeight}` : undefined });
    } catch {}
  }
  for (const entry of performance.getEntriesByType('resource')) {
    if (/\.(m3u8|mpd)(\?|$)/i.test(entry.name)) result.push({ url: entry.name, title: document.title });
  }
  return result;
}
