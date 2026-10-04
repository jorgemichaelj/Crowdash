export type JobType =
  | 'download'
  | 'convert'
  | 'trim'
  | 'compress'
  | 'extractAudio'
  | 'subtitle';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type EncoderKind = 'copy' | 'nvenc' | 'amf' | 'qsv' | 'cpu';

export type JobOrigin = 'desktop' | 'extension';

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
  | { op: 'convert'; container: 'mp4' | 'mkv' | 'webm' | 'mp3' | 'm4a' }
  | { op: 'trim'; startSec: number; endSec: number; precise: boolean }
  | { op: 'compress'; targetSizeMB: number; preciseSize: boolean }
  | { op: 'extractAudio'; format: 'mp3' | 'm4a' };

export type JobInput =
  | { kind: 'url'; url: string; title?: string; options: DownloadOptions }
  | { kind: 'file'; path: string; name?: string; options: FileOperationOptions };

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
  video?: { codec: string; width: number; height: number; fps: number };
  audio?: { codec: string; channels: number };
  estimatedSizeBytes?: number;
  availableQualities?: Array<'best' | '1080p' | '720p' | '480p'>;
  requiresLogin?: boolean; // conteúdo que exige sessão do usuário
  suggestions: Array<'download' | 'convert' | 'trim' | 'compress' | 'extractAudio'>;
  canStreamCopyTo?: string[]; // containers possíveis sem recodificar
}

export interface BrowserSessionConsent {
  domain: string; // ex.: "exemplo.com"
  granted: boolean;
  grantedAt?: number;
  browser: 'chrome' | 'edge' | 'firefox';
}

import type { UserFacingError } from '../errors/types';
