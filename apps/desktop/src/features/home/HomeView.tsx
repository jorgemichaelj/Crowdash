import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Badge } from '../../components/ui';
import { Skeleton } from '../../components/ui/feedback';
import { Dialog } from '../../components/ui/overlays';
import { SubtitleSettings } from '../subtitles/SubtitleSettings';
import { TrimModalContent } from '../trim/TrimModal';
import { CompressModalContent } from '../compress/CompressModal';
import { ConvertModalContent } from '../convert/ConvertModal';
import { useBackend } from '../../services/backend/BackendProvider';
import { useToast } from '../../components/ui/toast';
import { useAppStore } from '../../stores/appStore';
import { useI18n } from '../../i18n';
import type { MediaInfo, SubtitleOptions, OutputContainer } from '@crowdash/shared';
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
  Send,
  Zap,
  Share2,
  FolderOpen,
  ClipboardPaste,
  Layers,
  Image as ImageIcon,
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
  const [clipboardCandidate, setClipboardCandidate] = useState<string | null>(null);

  // Modais de ações contextuais
  const [activeModal, setActiveModal] = useState<'trim' | 'compress' | 'convert' | null>(null);

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

  // Checagem de link na área de transferência ao focar
  useEffect(() => {
    const checkClipboard = async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          const trimmed = text?.trim();
          if (
            trimmed &&
            (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
            trimmed !== inputVal
          ) {
            setClipboardCandidate(trimmed);
          }
        }
      } catch {
        // Leitura de clipboard bloqueada por permissão do navegador
      }
    };

    window.addEventListener('focus', checkClipboard);
    return () => window.removeEventListener('focus', checkClipboard);
  }, [inputVal]);

  const handleAnalyze = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setIsAnalyzing(true);
    setMediaInfo(null);
    setClipboardCandidate(null);

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

  const handlePasteClipboardCandidate = () => {
    if (clipboardCandidate) {
      setInputVal(clipboardCandidate);
      handleAnalyze(clipboardCandidate);
      setClipboardCandidate(null);
    }
  };

  // Presets de 1 clique
  const handleQuickPreset = async (preset: 'discord' | 'extractAudio' | 'bestVideo') => {
    const target = inputVal.trim() || 'C:\\Videos\\amostra_exemplo.mp4';
    if (preset === 'discord') {
      await backend.enqueue({
        kind: 'file',
        path: target,
        options: { op: 'compress', targetSizeMB: 25, preciseSize: true },
      });
      showToast('Otimização para Discord/WhatsApp (25MB) adicionada!', 'success');
    } else if (preset === 'extractAudio') {
      if (target.startsWith('http')) {
        await backend.enqueue({
          kind: 'url',
          url: target,
          options: { mode: 'audio', quality: 'best', container: 'mp3' },
        });
      } else {
        await backend.enqueue({
          kind: 'file',
          path: target,
          options: { op: 'extractAudio', format: 'mp3' },
        });
      }
      showToast('Extração de áudio MP3 adicionada à fila!', 'success');
    } else if (preset === 'bestVideo') {
      await backend.enqueue({
        kind: 'url',
        url: target.startsWith('http') ? target : 'https://exemplo.com/video',
        options: { mode: 'video', quality: 'best', container: 'mp4' },
      });
      showToast('Download com máxima qualidade iniciado!', 'success');
    }
    setCurrentTab('queue');
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Banner de Clipboard Detectado */}
      {clipboardCandidate && (
        <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <ClipboardPaste className="w-4 h-4 text-primary shrink-0" />
            <div className="text-xs truncate">
              <span className="text-muted-foreground">Link detectado na área de transferência: </span>
              <strong className="text-foreground font-mono">{clipboardCandidate}</strong>
            </div>
          </div>
          <Button size="sm" onClick={handlePasteClipboardCandidate} className="shrink-0 text-xs">
            Colar e Analisar
          </Button>
        </div>
      )}

      {/* Hero Input & Global DropZone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed p-8 transition-all duration-200 text-center shadow-sm ${
          isDragOver
            ? 'border-primary bg-primary/10 scale-[1.01]'
            : 'border-border bg-card hover:border-primary/50'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-4 max-w-xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-primary shadow-inner">
            <UploadCloud className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Cole uma URL ou solte arquivos de mídia
            </h2>
            <p className="text-xs text-muted-foreground">
              Suporte a vídeos do YouTube, HLS, MP4, MKV, WebM, MP3 e muito mais
            </p>
          </div>

          {/* Input central moderno com botão acoplado */}
          <div className="w-full flex items-center gap-2 bg-background border border-border rounded-xl p-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <Input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAnalyze(inputVal);
              }}
              placeholder={t.home.inputPlaceholder}
              className="border-0 bg-transparent focus:ring-0 text-sm placeholder:text-muted-foreground h-10 px-3"
            />
            {inputVal && (
              <button
                onClick={() => {
                  setInputVal('');
                  setMediaInfo(null);
                }}
                className="text-xs text-muted-foreground hover:text-foreground px-2 cursor-pointer"
              >
                Limpar
              </button>
            )}
            <Button
              isLoading={isAnalyzing}
              disabled={!inputVal.trim()}
              onClick={() => handleAnalyze(inputVal)}
              className="h-10 px-5 rounded-lg shrink-0 shadow-sm"
            >
              {t.home.process}
            </Button>
          </div>

          {/* Atalho visual de colar */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
                Ctrl
              </kbd>
              +
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
                V
              </kbd>
              para colar direto
            </span>
          </div>
        </div>
      </div>

      {/* Botões Rápidos de Ação / Presets de 1 Clique */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block px-1">
          Ações Rápidas de 1 Clique
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => handleQuickPreset('discord')}
            className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-muted/40 transition-all text-left cursor-pointer group shadow-xs"
          >
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 group-hover:scale-110 transition-transform">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <strong className="text-xs text-foreground block font-medium">
                Reduzir para Discord / Zap
              </strong>
              <span className="text-[11px] text-muted-foreground leading-tight block mt-0.5">
                Comprime para até 25MB mantendo a melhor qualidade
              </span>
            </div>
          </button>

          <button
            onClick={() => handleQuickPreset('extractAudio')}
            className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-muted/40 transition-all text-left cursor-pointer group shadow-xs"
          >
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <strong className="text-xs text-foreground block font-medium">
                Extrair Áudio (MP3)
              </strong>
              <span className="text-[11px] text-muted-foreground leading-tight block mt-0.5">
                Converte direto para áudio estéreo com alta fidelidade
              </span>
            </div>
          </button>

          <button
            onClick={() => handleQuickPreset('bestVideo')}
            className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-muted/40 transition-all text-left cursor-pointer group shadow-xs"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <strong className="text-xs text-foreground block font-medium">
                Download Máxima Resolução
              </strong>
              <span className="text-[11px] text-muted-foreground leading-tight block mt-0.5">
                Baixa com melhor codec disponível (MP4)
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Skeletons de Análise */}
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

      {/* Card da Mídia Analisada */}
      {mediaInfo && !isAnalyzing && (
        <Card className="space-y-5 p-6 rounded-2xl animate-in fade-in shadow-md border-border">
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
              <h3 className="font-semibold text-foreground text-sm truncate">
                {mediaInfo.title}
              </h3>
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
                    {mediaInfo.video.width}×{mediaInfo.video.height} ({mediaInfo.video.fps} fps)
                  </span>
                )}
              </div>

              {/* Selo Rápido (sem recodificar) */}
              {mediaInfo.canStreamCopyTo && mediaInfo.canStreamCopyTo.length > 0 && (
                <div className="mt-2.5">
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
            <div className="flex items-center gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t.home.requiresLoginNotice}</span>
            </div>
          )}

          {/* Reconhecimento Especial: Canal do YouTube */}
          {mediaInfo.collectionType === 'channel' && (
            <div className="space-y-4 pt-4 border-t border-border bg-primary/5 p-4 rounded-xl border border-primary/20">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary block">
                  Canal do YouTube Reconhecido
                </span>
                <p className="text-sm font-medium text-foreground">
                  Esta é uma URL de um canal do YouTube chamado{' '}
                  <strong className="text-primary underline">
                    {mediaInfo.channelName || mediaInfo.title}
                  </strong>
                  .
                </p>
                <p className="text-xs text-muted-foreground">
                  Deseja fazer o download de todos os itens desse canal ({mediaInfo.itemCount || 'vários'} vídeos disponíveis)?
                </p>
              </div>

              {/* Escolha entre Áudio ou Vídeo */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground block">
                  Selecione o formato desejado para todo o canal:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={downloadMode === 'video' ? 'primary' : 'outline'}
                    onClick={() => setDownloadMode('video')}
                    className="rounded-lg"
                  >
                    Baixar Canal Completo em Vídeo (MP4)
                  </Button>
                  <Button
                    size="sm"
                    variant={downloadMode === 'audio' ? 'primary' : 'outline'}
                    onClick={() => setDownloadMode('audio')}
                    className="rounded-lg"
                  >
                    Baixar Canal Completo em Áudio (MP3)
                  </Button>
                </div>
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
                  showToast(
                    `Download de todo o canal iniciado (${mediaInfo.itemCount} itens em ${downloadMode === 'video' ? 'Vídeo' : 'Áudio'})!`,
                    'success'
                  );
                  setCurrentTab('queue');
                }}
              >
                Confirmar e Baixar Todos os {mediaInfo.itemCount} Itens do Canal
              </Button>
            </div>
          )}

          {/* Reconhecimento Especial: Playlist do YouTube */}
          {mediaInfo.collectionType === 'playlist' && (
            <div className="space-y-4 pt-4 border-t border-border bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 block">
                  Playlist do YouTube Reconhecida
                </span>
                <p className="text-sm font-medium text-foreground">
                  Detectamos a playlist <strong className="text-emerald-400">{mediaInfo.title}</strong> com{' '}
                  <strong>{mediaInfo.itemCount} vídeos</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  Deseja baixar a playlist por completo ({mediaInfo.itemCount} vídeos)? Selecione se deseja em áudio ou vídeo.
                </p>
              </div>

              {/* Escolha entre Áudio ou Vídeo */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground block">
                  Como deseja baixar a playlist?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={downloadMode === 'video' ? 'primary' : 'outline'}
                    onClick={() => setDownloadMode('video')}
                    className="rounded-lg"
                  >
                    Vídeo Completo (MP4)
                  </Button>
                  <Button
                    size="sm"
                    variant={downloadMode === 'audio' ? 'primary' : 'outline'}
                    onClick={() => setDownloadMode('audio')}
                    className="rounded-lg"
                  >
                    Apenas Áudio / Músicas (MP3)
                  </Button>
                </div>
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
                  showToast(
                    `Download da playlist completa iniciado (${mediaInfo.itemCount} vídeos em ${downloadMode === 'video' ? 'Vídeo' : 'Áudio'})!`,
                    'success'
                  );
                  setCurrentTab('queue');
                }}
              >
                Baixar Playlist por Completo ({mediaInfo.itemCount} vídeos)
              </Button>
            </div>
          )}

          {/* Contexto URL Padrão (Vídeo Único) */}
          {mediaInfo.source === 'url' && !mediaInfo.collectionType && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={downloadMode === 'video' ? 'primary' : 'outline'}
                  onClick={() => setDownloadMode('video')}
                  className="rounded-lg"
                >
                  {t.home.actions.downloadVideo}
                </Button>
                <Button
                  size="sm"
                  variant={downloadMode === 'audio' ? 'primary' : 'outline'}
                  onClick={() => setDownloadMode('audio')}
                  className="rounded-lg"
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
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary"
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
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-foreground uppercase focus:ring-1 focus:ring-primary"
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

              <Button className="w-full h-11 rounded-xl shadow-sm text-sm" onClick={handleProcessUrl}>
                Iniciar Download
              </Button>
            </div>
          )}

          {/* Contexto Arquivo: Ações Contextuais */}
          {mediaInfo.source === 'file' && (
            <div className="space-y-3 pt-4 border-t border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                {t.home.optionsForFile}
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setActiveModal('convert')}
                  className="rounded-xl justify-start px-3"
                >
                  <RefreshCw className="w-4 h-4 mr-2 text-sky-400" />
                  {t.home.actions.convert}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setActiveModal('trim')}
                  className="rounded-xl justify-start px-3"
                >
                  <Scissors className="w-4 h-4 mr-2 text-amber-400" />
                  {t.home.actions.trim}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setActiveModal('compress')}
                  className="rounded-xl justify-start px-3"
                >
                  <Minimize2 className="w-4 h-4 mr-2 text-emerald-400" />
                  {t.home.actions.compress}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => handleFileAction('extractAudio')}
                  className="rounded-xl justify-start px-3"
                >
                  <Music className="w-4 h-4 mr-2 text-purple-400" />
                  {t.home.actions.extractAudio}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Modal de Conversão Universal de Formatos */}
      <Dialog
        isOpen={activeModal === 'convert'}
        onClose={() => setActiveModal(null)}
        title="Converter Formato de Mídia"
      >
        <ConvertModalContent
          currentContainer={mediaInfo?.container || 'mp4'}
          category={mediaInfo?.category || 'video'}
          canStreamCopy={
            mediaInfo?.canStreamCopyTo && mediaInfo.canStreamCopyTo.length > 0
          }
          onCancel={() => setActiveModal(null)}
          onConvert={async (targetFormat, keepQuality) => {
            await backend.enqueue({
              kind: 'file',
              path: inputVal,
              options: {
                op: 'convert',
                container: targetFormat,
                category: mediaInfo?.category || 'video',
                keepQuality,
              },
            });
            setActiveModal(null);
            showToast(
              `Conversão para .${targetFormat.toUpperCase()} adicionada à fila!`,
              'success'
            );
            setCurrentTab('queue');
          }}
        />
      </Dialog>

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
