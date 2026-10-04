import React, { useState } from 'react';
import { Card, Input, Button, Badge } from '../../../components/ui';
import { Skeleton } from '../../../components/ui/feedback';
import { SubtitleSettings } from '../../subtitles/SubtitleSettings';
import { useBackend } from '../../../services/backend/BackendProvider';
import { useToast } from '../../../components/ui/toast';
import { useAppStore } from '../../../stores/appStore';
import type { MediaInfo, SubtitleOptions } from '@crowdash/shared';
import {
  Link,
  Download,
  Clock,
  Sparkles,
  AlertTriangle,
  ClipboardPaste,
  Film,
  Music,
  CheckCircle2,
} from 'lucide-react';

export function WebDownloaderTab() {
  const backend = useBackend();
  const { showToast } = useToast();
  const { setCurrentTab } = useAppStore();

  const [inputUrl, setInputUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);

  // Opções para Download
  const [downloadMode, setDownloadMode] = useState<'video' | 'audio'>('video');
  const [selectedQuality, setSelectedQuality] = useState<'best' | '1080p' | '720p' | '480p'>('best');
  const [selectedContainer, setSelectedContainer] = useState<'mp4' | 'mkv' | 'mp3' | 'm4a'>('mp4');
  const [subtitles, setSubtitles] = useState<SubtitleOptions>({
    download: false,
    embed: false,
    language: 'pt-BR',
    format: 'srt',
  });

  const handleAnalyze = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setIsAnalyzing(true);
    setMediaInfo(null);

    try {
      const info = await backend.analyzeUrl(trimmed);
      setMediaInfo(info);
    } catch (err: any) {
      showToast(err.title || 'Falha ao analisar link', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          setInputUrl(text.trim());
          handleAnalyze(text.trim());
          showToast('Link colado da área de transferência!', 'info');
        }
      }
    } catch {
      showToast('Não foi possível acessar a área de transferência', 'error');
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Box de Entrada de Link */}
      <Card className="p-6 rounded-2xl border-border bg-card shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Baixar Mídia da Web
          </h3>
          <p className="text-xs text-muted-foreground">
            Cole links de vídeos, playlists completas ou canais do YouTube
          </p>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <Link className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              value={inputUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputUrl(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') handleAnalyze(inputUrl);
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              className="border-0 bg-transparent focus:ring-0 text-sm h-9 px-0"
            />
            {inputUrl && (
              <button
                onClick={() => {
                  setInputUrl('');
                  setMediaInfo(null);
                }}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-1"
              >
                Limpar
              </button>
            )}
          </div>

          <Button
            variant="secondary"
            onClick={handlePasteClipboard}
            className="rounded-xl px-3 text-xs"
            title="Colar da área de transferência"
          >
            <ClipboardPaste className="w-4 h-4 mr-1.5 text-primary" />
            Colar
          </Button>

          <Button
            isLoading={isAnalyzing}
            disabled={!inputUrl.trim()}
            onClick={() => handleAnalyze(inputUrl)}
            className="rounded-xl px-5 text-xs font-medium"
          >
            Analisar
          </Button>
        </div>
      </Card>

      {/* Skeletons de Carregamento */}
      {isAnalyzing && (
        <Card className="space-y-3 p-6 rounded-2xl">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
          </div>
        </Card>
      )}

      {/* Detalhes do Link Analisado */}
      {mediaInfo && !isAnalyzing && (
        <Card className="p-6 rounded-2xl border-border bg-card shadow-md space-y-5 animate-in fade-in">
          {/* Header da Mídia */}
          <div className="flex items-start gap-4">
            {mediaInfo.thumbnailUrl ? (
              <img
                src={mediaInfo.thumbnailUrl}
                alt={mediaInfo.title}
                className="w-32 h-20 object-cover rounded-xl border border-border shadow-xs"
              />
            ) : (
              <div className="w-32 h-20 bg-muted rounded-xl flex items-center justify-center border border-border">
                <Link className="w-6 h-6 text-muted-foreground" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-foreground text-sm truncate">
                {mediaInfo.title}
              </h4>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(mediaInfo.durationSec)}
                </span>
                {mediaInfo.container && (
                  <span className="uppercase font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">
                    {mediaInfo.container}
                  </span>
                )}
                {mediaInfo.video && (
                  <span>
                    {mediaInfo.video.width}×{mediaInfo.video.height}
                  </span>
                )}
              </div>

              {mediaInfo.canStreamCopyTo && mediaInfo.canStreamCopyTo.length > 0 && (
                <div className="mt-2.5">
                  <Badge variant="success">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Download rápido sem recodificação
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Se for Canal */}
          {mediaInfo.collectionType === 'channel' && (
            <div className="space-y-4 pt-4 border-t border-border bg-primary/5 p-4 rounded-xl border border-primary/20">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary block">
                  Canal do YouTube Reconhecido
                </span>
                <p className="text-sm font-medium text-foreground mt-1">
                  Deseja baixar todos os vídeos do canal{' '}
                  <strong className="text-primary underline">
                    {mediaInfo.channelName || mediaInfo.title}
                  </strong>{' '}
                  ({mediaInfo.itemCount} vídeos)?
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={downloadMode === 'video' ? 'primary' : 'outline'}
                  onClick={() => setDownloadMode('video')}
                  className="rounded-lg text-xs"
                >
                  <Film className="w-3.5 h-3.5 mr-1.5" />
                  Todos em Vídeo (MP4)
                </Button>
                <Button
                  size="sm"
                  variant={downloadMode === 'audio' ? 'primary' : 'outline'}
                  onClick={() => setDownloadMode('audio')}
                  className="rounded-lg text-xs"
                >
                  <Music className="w-3.5 h-3.5 mr-1.5" />
                  Todos em Áudio (MP3)
                </Button>
              </div>

              <Button
                className="w-full h-11 rounded-xl shadow-sm text-sm"
                onClick={async () => {
                  await backend.enqueue({
                    kind: 'batch',
                    title: `Canal: ${mediaInfo.channelName || mediaInfo.title}`,
                    itemCount: mediaInfo.itemCount || 58,
                    batchType: 'channel',
                    options: {
                      mode: downloadMode,
                      quality: selectedQuality,
                      container: downloadMode === 'audio' ? 'mp3' : 'mp4',
                    },
                  });
                  showToast('Download do canal iniciado!', 'success');
                  setCurrentTab('queue');
                }}
              >
                Baixar Todos os {mediaInfo.itemCount} Vídeos do Canal
              </Button>
            </div>
          )}

          {/* Se for Playlist */}
          {mediaInfo.collectionType === 'playlist' && (
            <div className="space-y-4 pt-4 border-t border-border bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 block">
                  Playlist Reconhecida
                </span>
                <p className="text-sm font-medium text-foreground mt-1">
                  Playlist com <strong>{mediaInfo.itemCount} vídeos</strong>. Como deseja baixar?
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={downloadMode === 'video' ? 'primary' : 'outline'}
                  onClick={() => setDownloadMode('video')}
                  className="rounded-lg text-xs"
                >
                  <Film className="w-3.5 h-3.5 mr-1.5" />
                  Playlist em Vídeo (MP4)
                </Button>
                <Button
                  size="sm"
                  variant={downloadMode === 'audio' ? 'primary' : 'outline'}
                  onClick={() => setDownloadMode('audio')}
                  className="rounded-lg text-xs"
                >
                  <Music className="w-3.5 h-3.5 mr-1.5" />
                  Playlist em Áudio / Músicas (MP3)
                </Button>
              </div>

              <Button
                className="w-full h-11 rounded-xl shadow-sm text-sm"
                onClick={async () => {
                  await backend.enqueue({
                    kind: 'batch',
                    title: `Playlist: ${mediaInfo.title}`,
                    itemCount: mediaInfo.itemCount || 24,
                    batchType: 'playlist',
                    options: {
                      mode: downloadMode,
                      quality: selectedQuality,
                      container: downloadMode === 'audio' ? 'mp3' : 'mp4',
                    },
                  });
                  showToast('Download da playlist iniciado!', 'success');
                  setCurrentTab('queue');
                }}
              >
                Baixar Playlist Completa ({mediaInfo.itemCount} itens)
              </Button>
            </div>
          )}

          {/* Vídeo Único */}
          {!mediaInfo.collectionType && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={downloadMode === 'video' ? 'primary' : 'outline'}
                  onClick={() => setDownloadMode('video')}
                  className="rounded-lg"
                >
                  <Film className="w-3.5 h-3.5 mr-1.5" />
                  Baixar Vídeo
                </Button>
                <Button
                  size="sm"
                  variant={downloadMode === 'audio' ? 'primary' : 'outline'}
                  onClick={() => setDownloadMode('audio')}
                  className="rounded-lg"
                >
                  <Music className="w-3.5 h-3.5 mr-1.5" />
                  Baixar Apenas Áudio
                </Button>
              </div>

              {downloadMode === 'video' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Qualidade do Vídeo
                    </label>
                    <select
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-foreground"
                      value={selectedQuality}
                      onChange={(e) => setSelectedQuality(e.target.value as any)}
                    >
                      <option value="best">Melhor Disponível (Original)</option>
                      <option value="1080p">Full HD (1080p)</option>
                      <option value="720p">HD (720p)</option>
                      <option value="480p">SD (480p)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Formato do Arquivo
                    </label>
                    <select
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-foreground uppercase"
                      value={selectedContainer}
                      onChange={(e) => setSelectedContainer(e.target.value as any)}
                    >
                      <option value="mp4">MP4</option>
                      <option value="mkv">MKV</option>
                    </select>
                  </div>
                </div>
              )}

              {downloadMode === 'video' && (
                <SubtitleSettings value={subtitles} onChange={setSubtitles} />
              )}

              <Button
                className="w-full h-11 rounded-xl shadow-sm text-sm"
                onClick={async () => {
                  await backend.enqueue({
                    kind: 'url',
                    url: inputUrl,
                    title: mediaInfo.title,
                    options: {
                      mode: downloadMode,
                      quality: selectedQuality,
                      container: downloadMode === 'audio' ? 'mp3' : selectedContainer,
                      subtitles: downloadMode === 'video' ? subtitles : undefined,
                    },
                  });
                  showToast('Download adicionado à fila!', 'success');
                  setCurrentTab('queue');
                }}
              >
                Iniciar Download
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
