import React, { useRef, useState } from 'react';
import { Card, Input, Button } from '../../../components/ui';
import { Skeleton } from '../../../components/ui/feedback';
import { SubtitleSettings } from '../../subtitles/SubtitleSettings';
import { useBackend } from '../../../services/backend/BackendProvider';
import { useToast } from '../../../components/ui/toast';
import { useAppStore } from '../../../stores/appStore';
import type { DownloadOptions, JobInput, MediaInfo, SubtitleOptions } from '@crowdash/shared';
import { classifyMediaUrl } from '@crowdash/shared';
import { DownloadFormatFields } from './DownloadFormatFields';
import { ChannelDownloadOptions } from './ChannelDownloadOptions';
import { Link, Download, ClipboardPaste, ListVideo } from 'lucide-react';

export function WebDownloaderTab() {
  const backend = useBackend();
  const { showToast } = useToast();
  const { setCurrentTab } = useAppStore();
  const [inputUrl, setInputUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const analysisId = useRef(0);
  const [options, setOptions] = useState<DownloadOptions>({ mode: 'video', quality: 'best', container: 'mp4' });
  const [subtitles, setSubtitles] = useState<SubtitleOptions>({ download: false, embed: false, language: 'pt-BR', format: 'srt' });

  const editUrl = (value: string) => {
    analysisId.current++;
    setInputUrl(value);
    setMediaInfo(null);
    setIsAnalyzing(false);
  };

  const handleAnalyze = async (input: string) => {
    const requestId = ++analysisId.current;
    setMediaInfo(null);
    setIsAnalyzing(true);
    try {
      // Canonicalize before contacting either backend. A watch?v= URL always wins over list=.
      const classified = classifyMediaUrl(input);
      const info = await backend.analyzeUrl(classified.url);
      if (requestId !== analysisId.current) return;
      setMediaInfo({ ...info, canonicalUrl: info.canonicalUrl || classified.url,
        playlistUrl: classified.kind === 'video' ? classified.playlistUrl : undefined });
    } catch (err: any) {
      if (requestId === analysisId.current) showToast(err.message || err.title || 'Falha ao analisar link', 'error');
    } finally {
      if (requestId === analysisId.current) setIsAnalyzing(false);
    }
  };

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) { editUrl(text); await handleAnalyze(text); }
    } catch { showToast('Não foi possível acessar a área de transferência', 'error'); }
  };

  const enqueue = async (input: JobInput) => {
    setDownloading(true);
    try {
      await backend.enqueue(input);
      showToast('Download adicionado à fila!', 'success');
      setCurrentTab('queue');
    } catch (err: any) {
      showToast(err.message || 'Não foi possível iniciar o download.', 'error');
    } finally { setDownloading(false); }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-6 rounded-2xl space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold flex items-center gap-2"><Download className="w-5 h-5 text-primary" /> Baixar mídia da Web</h2>
          <p className="text-xs text-muted-foreground">Cole o link de um vídeo, música, playlist ou canal do YouTube.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-background border border-border rounded-xl px-3 focus-within:border-primary">
            <Link className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input value={inputUrl} aria-label="Link do vídeo, playlist ou canal" onChange={e => editUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && inputUrl.trim()) handleAnalyze(inputUrl); }}
              placeholder="https://www.youtube.com/watch?v=..." className="border-0 bg-transparent focus:ring-0 px-0" />
            {inputUrl && <button onClick={() => editUrl('')} className="text-xs text-muted-foreground hover:text-foreground">Limpar</button>}
          </div>
          <Button variant="secondary" onClick={paste} className="rounded-xl" title="Colar da área de transferência"><ClipboardPaste className="w-4 h-4 mr-1.5 text-primary" /> Colar</Button>
          <Button isLoading={isAnalyzing} disabled={!inputUrl.trim()} onClick={() => handleAnalyze(inputUrl)} className="rounded-xl">Analisar</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Links com Mix ou rádio analisam somente o vídeo indicado, sem carregar a lista automática.</p>
      </Card>
      {isAnalyzing && <Card className="space-y-3 p-6 rounded-2xl" aria-label="Analisando link"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" /></Card>}
      {mediaInfo && !isAnalyzing && (
        <Card className="p-4 sm:p-6 rounded-2xl space-y-5">
          {mediaInfo.collectionType === 'channel' ? (
            <ChannelDownloadOptions key={mediaInfo.canonicalUrl} media={mediaInfo} options={options} onOptionsChange={setOptions} onDownload={enqueue} downloading={downloading} />
          ) : (
            <>
              <div className="flex items-start gap-4">
                {mediaInfo.thumbnailUrl && <img src={mediaInfo.thumbnailUrl} alt="" className="w-24 sm:w-32 h-20 object-cover rounded-xl border border-border" />}
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-primary mb-1">{mediaInfo.collectionType === 'playlist' ? 'Playlist reconhecida' : 'Vídeo individual'}</p>
                  <h3 className="font-semibold text-sm break-words">{mediaInfo.title}</h3>
                  {mediaInfo.collectionType === 'playlist'
                    ? <p className="text-xs text-muted-foreground mt-1">{mediaInfo.itemCount ? `${mediaInfo.itemCount} itens` : 'Os itens serão buscados durante o download.'}</p>
                    : mediaInfo.durationSec > 0 && <p className="text-xs text-muted-foreground mt-1">{Math.floor(mediaInfo.durationSec / 60)}:{Math.floor(mediaInfo.durationSec % 60).toString().padStart(2, '0')}</p>}
                </div>
              </div>
              <DownloadFormatFields options={options} onChange={setOptions} />
              {options.mode === 'video' && !mediaInfo.collectionType && <SubtitleSettings value={subtitles} onChange={setSubtitles} />}
              <Button className="w-full rounded-xl" isLoading={downloading} onClick={() => enqueue(mediaInfo.collectionType === 'playlist' ? {
                kind: 'batch', batchType: 'playlist', title: mediaInfo.title, url: mediaInfo.canonicalUrl!, itemCount: mediaInfo.itemCount, options,
              } : {
                kind: 'url', url: mediaInfo.canonicalUrl!, title: mediaInfo.title, options: { ...options, ...(options.mode === 'video' ? { subtitles } : {}) },
              })}>
                <Download className="w-4 h-4 mr-2" /> {mediaInfo.collectionType === 'playlist' ? 'Baixar playlist completa' : options.mode === 'audio' ? 'Baixar música / áudio' : 'Baixar vídeo'}
              </Button>
              {mediaInfo.playlistUrl && <div className="border-t border-border pt-4 space-y-2">
                <p className="text-xs text-muted-foreground">Este vídeo também pertence a uma playlist. Baixar a coleção exige uma escolha separada.</p>
                <Button variant="outline" className="w-full" onClick={() => { const url = mediaInfo.playlistUrl!; editUrl(url); handleAnalyze(url); }}><ListVideo className="w-4 h-4 mr-2" /> Ver opções da playlist</Button>
              </div>}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
