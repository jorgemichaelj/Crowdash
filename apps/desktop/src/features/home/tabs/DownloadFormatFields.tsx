import React from 'react';
import type { DownloadOptions } from '@crowdash/shared';
import { Button } from '../../../components/ui';
import { Film, Music } from 'lucide-react';

export function DownloadFormatFields({ options, onChange }: {
  options: DownloadOptions;
  onChange: (options: DownloadOptions) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold mb-2">Formato do download</legend>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={options.mode === 'video' ? 'primary' : 'outline'} aria-pressed={options.mode === 'video'}
          onClick={() => onChange({ ...options, mode: 'video', container: 'mp4' })}>
          <Film className="w-4 h-4 mr-1.5" /> Vídeo
        </Button>
        <Button size="sm" variant={options.mode === 'audio' ? 'primary' : 'outline'} aria-pressed={options.mode === 'audio'}
          onClick={() => onChange({ ...options, mode: 'audio', container: 'mp3' })}>
          <Music className="w-4 h-4 mr-1.5" /> Apenas música / áudio
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.mode === 'video' && (
          <label className="text-xs text-muted-foreground space-y-1">
            <span className="block">Qualidade</span>
            <select className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground" value={options.quality}
              onChange={e => onChange({ ...options, quality: e.target.value as DownloadOptions['quality'] })}>
              <option value="best">Melhor disponível</option>
              <option value="1080p">Full HD (1080p)</option>
              <option value="720p">HD (720p)</option>
              <option value="480p">SD (480p)</option>
            </select>
          </label>
        )}
        <label className="text-xs text-muted-foreground space-y-1">
          <span className="block">Formato do arquivo</span>
          <select className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground" value={options.container}
            onChange={e => onChange({ ...options, container: e.target.value as DownloadOptions['container'] })}>
            {options.mode === 'video' ? <><option value="mp4">MP4</option><option value="mkv">MKV</option></>
              : <><option value="mp3">MP3</option><option value="m4a">M4A</option></>}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
