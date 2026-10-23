import { open } from '@tauri-apps/plugin-dialog';
import type { MediaCategory } from '@crowdash/shared';

export interface LocalMediaFile {
  path: string;
  name: string;
  ext: string;
  category: MediaCategory;
}

export function localMediaFile(path: string): LocalMediaFile {
  const name = path.split(/[\\/]/).pop() || path;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const category = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'wmv'].includes(ext) ? 'video'
    : ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac', 'opus'].includes(ext) ? 'audio' : 'image';
  return { path, name, ext, category };
}

export async function pickLocalMediaFiles(multiple: boolean, videosOnly = false): Promise<LocalMediaFile[]> {
  const selected = await open({ multiple, directory: false,
    title: videosOnly ? 'Escolher vídeo para comprimir' : 'Escolher arquivos para converter',
    ...(videosOnly ? { filters: [{ name: 'Vídeos', extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'wmv'] }] } : {}),
  });
  return (selected === null ? [] : Array.isArray(selected) ? selected : [selected]).map(localMediaFile);
}
