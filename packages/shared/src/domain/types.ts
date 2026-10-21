export type JobType =
  | 'download'
  | 'convert'
  | 'trim'
  | 'compress'
  | 'extractAudio'
  | 'subtitle'
  | 'batchDownload';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type EncoderKind = 'copy' | 'nvenc' | 'amf' | 'qsv' | 'cpu';

export type JobOrigin = 'desktop' | 'extension';

export type MediaCategory = 'video' | 'audio' | 'image';

export type VideoFormat = 'mp4' | 'mkv' | 'webm' | 'mov' | 'avi' | 'wmv';
export type AudioFormat = 'mp3' | 'wav' | 'm4a' | 'flac' | 'aac' | 'ogg';
export type ImageFormat = 'png' | 'jpeg' | 'jpg' | 'webp' | 'ico' | 'avif';

export type OutputContainer = VideoFormat | AudioFormat | ImageFormat;

export interface SubtitleOptions {
  download: boolean;
  embed: boolean;
  language: string; // ex.: 'pt-BR'
  format: 'srt' | 'vtt';
}

export interface DownloadOptions {
  mode: 'video' | 'audio';
  quality: 'best' | '1080p' | '720p' | '480p';
  container: 'mp4' | 'mkv' | 'mp3' | 'm4a';
  subtitles?: SubtitleOptions;
}

export type FileOperationOptions =
  | {
      op: 'convert';
      container: OutputContainer;
      category?: MediaCategory;
      keepQuality?: boolean;
    }
  | { op: 'trim'; startSec: number; endSec: number; precise: boolean }
  | { op: 'compress'; targetSizeMB: number; preciseSize: boolean }
  | { op: 'extractAudio'; format: 'mp3' | 'm4a' | 'wav' | 'flac' };

export type ChannelDownloadSelection =
  | 'videosWithThumbnails' | 'videos' | 'shorts' | 'playlists' | 'thumbnails' | 'posts' | 'all';

export type JobInput =
  | { kind: 'url'; url: string; title?: string; options: DownloadOptions }
  | { kind: 'file'; path: string; name?: string; options: FileOperationOptions }
  | {
      kind: 'batch';
      title: string;
      itemCount?: number;
      batchType: 'playlist';
      url: string;
      options: DownloadOptions;
    }
  | {
      kind: 'batch';
      title: string;
      itemCount?: number;
      batchType: 'channel';
      url: string;
      channelName: string;
      selection: ChannelDownloadSelection;
      options: DownloadOptions;
    };

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  origin: JobOrigin;
  input: JobInput;
  outputPath?: string;
  progress: number; // 0..100
  speedBytesPerSec?: number;
  etaSeconds?: number;
  encoder?: EncoderKind; // exibido só em "detalhes"
  error?: UserFacingError;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  logs: string[]; // log técnico (só em "Ver detalhes")
}

export interface MediaInfo {
  source: 'url' | 'file';
  title: string;
  durationSec: number;
  thumbnailUrl?: string;
  container?: string;
  category?: MediaCategory; // 'video' | 'audio' | 'image'
  video?: { codec: string; width: number; height: number; fps: number };
  audio?: { codec: string; channels: number };
  image?: { width: number; height: number };
  estimatedSizeBytes?: number;
  availableQualities?: Array<'best' | '1080p' | '720p' | '480p'>;
  requiresLogin?: boolean; // conteúdo que exige sessão do usuário
  suggestions: Array<'download' | 'convert' | 'compress' | 'extractAudio'>;
  canStreamCopyTo?: string[]; // containers possíveis sem recodificar

  // Suporte a Canais e Playlists
  canonicalUrl?: string;
  playlistUrl?: string; // explicit playlist action; never populated for a generated Mix/radio
  collectionType?: 'channel' | 'playlist';
  channelName?: string;
  itemCount?: number;
}

export interface BrowserSessionConsent {
  domain: string; // ex.: "exemplo.com"
  granted: boolean;
  grantedAt?: number;
  browser: 'chrome' | 'edge' | 'firefox';
}

import type { UserFacingError } from '../errors/types';
