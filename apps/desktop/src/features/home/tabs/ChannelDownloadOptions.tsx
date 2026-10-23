import React, { useState } from 'react';
import type { ChannelDownloadSelection, DownloadOptions, JobInput, MediaInfo } from '@crowdash/shared';
import { channelFolderName } from '@crowdash/shared';
import { Button } from '../../../components/ui';
import { DownloadFormatFields } from './DownloadFormatFields';
import { FolderOpen, Download } from 'lucide-react';

export const channelChoices: { value: ChannelDownloadSelection; label: string; description: string; folders: string[] }[] = [
  { value: 'videosWithThumbnails', label: 'Vídeos + thumbnails', description: 'Vídeos do canal e suas imagens de capa.', folders: ['videos', 'thumbs'] },
  { value: 'videos', label: 'Só vídeos', description: 'Vídeos publicados na aba Vídeos.', folders: ['videos'] },
  { value: 'shorts', label: 'Shorts', description: 'Apenas os vídeos curtos do canal.', folders: ['shorts'] },
  { value: 'playlists', label: 'Playlists', description: 'Uma subpasta para cada playlist pública.', folders: ['playlists'] },
  { value: 'thumbnails', label: 'Só thumbnails', description: 'Capas dos vídeos, sem baixar os vídeos.', folders: ['thumbs'] },
  { value: 'posts', label: 'Publicações', description: 'Textos e imagens públicas em JSON e Markdown.', folders: ['publicacoes'] },
  { value: 'all', label: 'Canal todo', description: 'Vídeos, shorts, playlists, capas e publicações públicas.', folders: ['videos', 'shorts', 'playlists', 'thumbs', 'publicacoes'] },
];

export function ChannelDownloadOptions({ media, options, onOptionsChange, onDownload, downloading, demo = false }: {
  media: MediaInfo;
  options: DownloadOptions;
  onOptionsChange: (options: DownloadOptions) => void;
  onDownload: (input: JobInput) => Promise<void>;
  downloading: boolean;
  demo?: boolean;
}) {
  const [selection, setSelection] = useState<ChannelDownloadSelection>('videos');
  const choice = channelChoices.find(c => c.value === selection)!;
  const channel = media.channelName || 'Canal';
  const mediaSelection = selection !== 'posts' && selection !== 'thumbnails';
  return (
    <section aria-label="Opções do canal" className="space-y-5">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-1">
        <h3 className="font-semibold text-primary">Você colocou o link de um canal</h3>
        <p className="text-sm text-foreground">{channel}</p>
        <p className="text-xs text-muted-foreground">Escolha o que baixar. A lista completa só será buscada quando você iniciar o download.</p>
      </div>
      <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <legend className="text-sm font-medium mb-3">Conteúdo do canal</legend>
        {channelChoices.map(item => (
          <label key={item.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${selection === item.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
            <input type="radio" name="channel-selection" value={item.value} checked={selection === item.value}
              onChange={() => setSelection(item.value)} className="mt-1 accent-primary" />
            <span><strong className="block text-xs font-semibold">{item.label}</strong><span className="block text-xs text-muted-foreground mt-1">{item.description}</span></span>
          </label>
        ))}
      </fieldset>
      {mediaSelection && <DownloadFormatFields options={options} onChange={onOptionsChange} />}
      <div className="rounded-xl bg-muted/40 border border-border p-4 text-xs space-y-2">
        <p className="flex items-center gap-2 font-medium"><FolderOpen className="w-4 h-4 text-primary" /> Organização na pasta de destino</p>
        <pre className="text-muted-foreground whitespace-pre-wrap">{`${channelFolderName(channel)}/\n${choice.folders.map((folder, i) => `${i === choice.folders.length - 1 ? '└' : '├'}── ${folder}/`).join('\n')}`}</pre>
      </div>
      {selection === 'all' && <p className="text-xs text-muted-foreground">Um canal completo pode ocupar bastante espaço. Transmissões ao vivo e conteúdo privado não fazem parte desta seleção.</p>}
      <Button className="w-full rounded-xl" isLoading={downloading} disabled={!media.canonicalUrl} onClick={() => onDownload({
        kind: 'batch', batchType: 'channel', url: media.canonicalUrl!, title: `Canal: ${channel} — ${choice.label}`,
        channelName: channel, selection, options,
      })}>
        <Download className="w-4 h-4 mr-2" /> {demo ? 'Simular download' : 'Baixar'}: {choice.label}
      </Button>
    </section>
  );
}
