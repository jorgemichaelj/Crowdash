import { afterEach, describe, expect, it, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import { localMediaFile, pickLocalMediaFiles } from '../src/services/files/localFiles';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe('native local-file selection', () => {
  it('preserves the full Windows path, including spaces and accents, sent to the backend', async () => {
    const path = 'C:\\Users\\Jorge Jesus\\Vídeos\\férias 2026.MP4';
    vi.mocked(open).mockResolvedValueOnce(path);
    expect(await pickLocalMediaFiles(false, true)).toEqual([{ path, name: 'férias 2026.MP4', ext: 'mp4', category: 'video' }]);
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: false, directory: false, filters: expect.any(Array) }));
  });
  it('keeps each selected file path instead of inventing a common directory', async () => {
    const paths = ['D:\\Fotos\\imagem.webp', 'E:\\Audio\\música.flac'];
    vi.mocked(open).mockResolvedValueOnce(paths);
    expect((await pickLocalMediaFiles(true)).map(file => file.path)).toEqual(paths);
    expect(localMediaFile(paths[1])).toMatchObject({ name: 'música.flac', category: 'audio' });
  });
  it('handles cancellation without adding a file', async () => {
    vi.mocked(open).mockResolvedValueOnce(null);
    expect(await pickLocalMediaFiles(false)).toEqual([]);
  });
});
