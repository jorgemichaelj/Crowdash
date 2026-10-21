/** Classifies only known YouTube URL shapes; video IDs take precedence over list=. */
export type MediaUrl =
  | { kind: 'video'; url: string; playlistUrl?: string }
  | { kind: 'playlist'; url: string }
  | { kind: 'channel'; url: string; name: string };

export function classifyMediaUrl(input: string): MediaUrl {
  const parsed = new URL(input.trim());
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Informe um link HTTP ou HTTPS válido.');
  }
  const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
  const list = parsed.searchParams.get('list');
  const video = (id: string | undefined): MediaUrl => {
    if (!id || !/^[\w-]+$/.test(id)) throw new Error('O link não contém um vídeo válido.');
    const playlistUrl = list && !list.startsWith('RD')
      ? `https://www.youtube.com/playlist?${new URLSearchParams({ list })}` : undefined;
    return { kind: 'video', url: `https://www.youtube.com/watch?v=${id}`, ...(playlistUrl ? { playlistUrl } : {}) };
  };
  if (['youtu.be', 'www.youtu.be'].includes(parsed.hostname)) return video(parts[0]);
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(parsed.hostname)) {
    return { kind: 'video', url: parsed.href };
  }
  if (parsed.pathname === '/watch' && parsed.searchParams.has('v')) return video(parsed.searchParams.get('v') || undefined);
  if (['shorts', 'live', 'embed'].includes(parts[0]) && parts.length === 2) return video(parts[1]);
  if (parsed.pathname === '/playlist' && list) {
    if (list.startsWith('RD')) throw new Error('Um Mix/rádio é uma lista automática. Use o link de uma música para baixar o vídeo indicado.');
    return { kind: 'playlist', url: `https://www.youtube.com/playlist?${new URLSearchParams({ list })}` };
  }
  const count = parts[0].startsWith('@') && parts[0].length > 1 ? 1
    : ['channel', 'c', 'user'].includes(parts[0]) && parts[1] ? 2 : 0;
  if (count && (parts.length === count || (parts.length === count + 1 && ['videos', 'shorts', 'streams', 'playlists', 'featured', 'posts', 'community'].includes(parts[count])))) {
    return { kind: 'channel', url: `https://www.youtube.com/${parts.slice(0, count).join('/')}`, name: parts[count - 1].replace(/^@/, '') };
  }
  throw new Error('Use um link de vídeo, playlist ou canal do YouTube.');
}

/** Mirrors the backend's single-component Windows-safe channel folder name. */
export function channelFolderName(name: string): string {
  let folder = Array.from(name.replace(/[\x00-\x1f\x7f<>:"/\\|?*%]/g, '_')).slice(0, 100).join('').trim().replace(/^\.+|\.+$/g, '').trim() || 'Canal';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(folder)) folder = `_${folder}`;
  return folder;
}
