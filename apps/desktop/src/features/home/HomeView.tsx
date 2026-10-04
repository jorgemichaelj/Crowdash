import React, { useState } from 'react';
import { Card, Input, Button, Badge } from '../../components/ui';
import { Skeleton } from '../../components/ui/feedback';
import { Dialog } from '../../components/ui/overlays';
import { SubtitleSettings } from '../subtitles/SubtitleSettings';
import { TrimModalContent } from '../trim/TrimModal';
import { CompressModalContent } from '../compress/CompressModal';
import { useBackend } from '../../services/backend/BackendProvider';
import { useToast } from '../../components/ui/toast';
import { useAppStore } from '../../stores/appStore';
import { useI18n } from '../../i18n';
import type { MediaInfo, SubtitleOptions } from '@crowdash/shared';
import {
  Link,
  UploadCloud,
  Clock,
  Sparkles,
  Scissors,
  Minimize2,
  Music,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

export function HomeView() {
  const backend = useBackend();
  const { showToast } = useToast();
  const { setCurrentTab } = useAppStore();
  const { t } = useI18n();

  const [inputVal, setInputVal] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Modais de ações contextuais de arquivo
  const [activeModal, setActiveModal] = useState<'trim' | 'compress' | null>(null);

  // Opções para URL
  const [downloadMode, setDownloadMode] = useState<'video' | 'audio'>('video');
  const [selectedQuality, setSelectedQuality] = useState<'best' | '1080p' | '720p' | '480p'>('best');
  const [selectedContainer, setSelectedContainer] = useState<'mp4' | 'mkv' | 'mp3' | 'm4a'>('mp4');
  const [subtitles, setSubtitles] = useState<SubtitleOptions>({
    download: false,
    embed: false,
    language: 'pt-BR',
    format: 'srt',
  });

  const handleAnalyze = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setIsAnalyzing(true);
    setMediaInfo(null);

    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const info = await backend.analyzeUrl(trimmed);
        setMediaInfo(info);
      } else {
        const info = await backend.analyzeFile(trimmed);
        setMediaInfo(info);
      }
    } catch (err: any) {
      showToast(err.title || 'Falha ao analisar mídia', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setInputVal(file.name);
      handleAnalyze(file.name);
    }
  };

  const handleProcessUrl = async () => {
    if (!mediaInfo) return;
    await backend.enqueue({
      kind: 'url',
      url: inputVal,
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
  };

  const handleFileAction = async (action: 'convert' | 'extractAudio') => {
    if (action === 'convert') {
      await backend.enqueue({
        kind: 'file',
        path: inputVal,
        options: { op: 'convert', container: 'mp4' },
      });
    } else if (action === 'extractAudio') {
      await backend.enqueue({
        kind: 'file',
        path: inputVal,
        options: { op: 'extractAudio', format: 'mp3' },
      });
    }
    showToast('Tarefa adicionada à fila!', 'success');
    setCurrentTab('queue');
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Campo Central e DropZone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed p-6 transition-all text-center ${
          isDragOver
            ? 'border-primary bg-primary/10'
            : 'border-border bg-card/60 hover:border-muted-foreground'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-3">
          <UploadCloud className="w-10 h-10 text-muted-foreground" />
          <div className="w-full flex gap-2">
            <Input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAnalyze(inputVal);
              }}
              placeholder={t.home.inputPlaceholder}
              className="flex-1"
            />
            <Button
              isLoading={isAnalyzing}
              disabled={!inputVal.trim()}
              onClick={() => handleAnalyze(inputVal)}
            >
              {t.home.process}
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">{t.home.pastePrompt}</span>
        </div>
      </div>

      {/* Skeletons de Análise */}
      {isAnalyzing && (
        <Card className="space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </Card>
      )}

      {/* Card de Mídia Analisada */}
      {mediaInfo && !isAnalyzing && (
        <Card className="space-y-5 animate-in fade-in">
          <div className="flex items-start gap-4">
            {mediaInfo.thumbnailUrl ? (
              <img
                src={mediaInfo.thumbnailUrl}
                alt={mediaInfo.title}
                className="w-28 h-20 object-cover rounded-md border border-border"
              />
            ) : (
              <div className="w-28 h-20 bg-muted rounded-md flex items-center justify-center border border-border">
                <Link className="w-6 h-6 text-muted-foreground" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-sm truncate">
                {mediaInfo.title}
              </h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(mediaInfo.durationSec)}
                </span>
                {mediaInfo.container && (
                  <span className="uppercase font-mono">{mediaInfo.container}</span>
                )}
                {mediaInfo.video && (
                  <span>
                    {mediaInfo.video.width}×{mediaInfo.video.height}
                  </span>
                )}
              </div>

              {/* Selo Rápido (sem recodificar) */}
              {mediaInfo.canStreamCopyTo && mediaInfo.canStreamCopyTo.length > 0 && (
                <div className="mt-2">
                  <Badge variant="success">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {t.home.fastCopyBadge}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Aviso se requer login */}
          {mediaInfo.requiresLogin && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-md text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t.home.requiresLoginNotice}</span>
            </div>
          )}

          {/* Contexto URL: Opções de Download */}
          {mediaInfo.source === 'url' && (
            <div className="space-y-4 pt-3 border-t border-border">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={downloadMode === 'video' ? 'primary' : 'outline'}
                  onClick={() => setDownloadMode('video')}
                >
                  {t.home.actions.downloadVideo}
                </Button>
                <Button
                  size="sm"
                  variant={downloadMode === 'audio' ? 'primary' : 'outline'}
                  onClick={() => setDownloadMode('audio')}
                >
                  {t.home.actions.downloadAudio}
                </Button>
              </div>

              {downloadMode === 'video' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      {t.home.quality.label}
                    </label>
                    <select
                      className="w-full bg-card border border-border rounded px-3 py-1.5 text-xs text-foreground"
                      value={selectedQuality}
                      onChange={(e) => setSelectedQuality(e.target.value as any)}
                    >
                      <option value="best">{t.home.quality.best}</option>
                      <option value="1080p">{t.home.quality['1080p']}</option>
                      <option value="720p">{t.home.quality['720p']}</option>
                      <option value="480p">{t.home.quality['480p']}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      {t.home.format.label}
                    </label>
                    <select
                      className="w-full bg-card border border-border rounded px-3 py-1.5 text-xs text-foreground uppercase"
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

              <Button className="w-full" onClick={handleProcessUrl}>
                Iniciar Download
              </Button>
            </div>
          )}

          {/* Contexto Arquivo: Ações Contextuais */}
          {mediaInfo.source === 'file' && (
            <div className="space-y-3 pt-3 border-t border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                {t.home.optionsForFile}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleFileAction('convert')}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  {t.home.actions.convert}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveModal('trim')}
                >
                  <Scissors className="w-3.5 h-3.5 mr-1.5" />
                  {t.home.actions.trim}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveModal('compress')}
                >
                  <Minimize2 className="w-3.5 h-3.5 mr-1.5" />
                  {t.home.actions.compress}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleFileAction('extractAudio')}
                >
                  <Music className="w-3.5 h-3.5 mr-1.5" />
                  {t.home.actions.extractAudio}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Modais de Corte e Compressão */}
      <Dialog
        isOpen={activeModal === 'trim'}
        onClose={() => setActiveModal(null)}
        title={t.trim.title}
      >
        <TrimModalContent
          durationSec={mediaInfo?.durationSec || 60}
          onCancel={() => setActiveModal(null)}
          onExport={async (startSec, endSec, precise) => {
            await backend.enqueue({
              kind: 'file',
              path: inputVal,
              options: { op: 'trim', startSec, endSec, precise },
            });
            setActiveModal(null);
            showToast('Tarefa de corte adicionada à fila!', 'success');
            setCurrentTab('queue');
          }}
        />
      </Dialog>

      <Dialog
        isOpen={activeModal === 'compress'}
        onClose={() => setActiveModal(null)}
        title={t.compress.title}
      >
        <CompressModalContent
          originalSizeBytes={mediaInfo?.estimatedSizeBytes}
          durationSec={mediaInfo?.durationSec}
          onCancel={() => setActiveModal(null)}
          onCompress={async (targetSizeMB, preciseSize) => {
            await backend.enqueue({
              kind: 'file',
              path: inputVal,
              options: { op: 'compress', targetSizeMB, preciseSize },
            });
            setActiveModal(null);
            showToast('Tarefa de compressão adicionada à fila!', 'success');
            setCurrentTab('queue');
          }}
        />
      </Dialog>
    </div>
  );
}
