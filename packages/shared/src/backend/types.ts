import type {
  Job,
  JobInput,
  JobOrigin,
  MediaInfo,
  EncoderKind,
  BrowserSessionConsent,
} from '../domain/types';
import type { UserFacingError } from '../errors/types';

export interface AppSettings {
  outputFolder: string;
  hardwareAcceleration: 'auto' | 'off';
  theme: 'system' | 'dark' | 'light';
  notifyOnComplete: boolean;
  concurrency: 1; // fixo em 1 nesta versão
  browserSessions: BrowserSessionConsent[];
  advanced: {
    showTechnicalLogs: boolean;
    customCodecArgs?: string; // campo avançado, oculto por padrão
  };
}

export interface HardwareInfo {
  gpu: 'nvidia' | 'amd' | 'intel' | 'none';
  encoder: EncoderKind; // detectado uma vez
}

export interface UpdateInfo {
  currentVersion: string;
  newVersion: string;
  notes?: string;
}

export type JobEvent =
  | { type: 'STARTED'; jobId: string }
  | {
      type: 'PROGRESS';
      jobId: string;
      progress: number;
      speedBytesPerSec?: number;
      etaSeconds?: number;
    }
  | { type: 'COMPLETED'; jobId: string; outputPath: string }
  | { type: 'ERROR'; jobId: string; error: UserFacingError }
  | { type: 'CANCELLED'; jobId: string };

export interface BackendClient {
  analyzeUrl(url: string): Promise<MediaInfo>;
  analyzeFile(path: string): Promise<MediaInfo>;

  enqueue(input: JobInput, origin?: JobOrigin): Promise<Job>;
  cancel(jobId: string): Promise<void>;
  retry(jobId: string): Promise<Job>;
  remove(jobId: string): Promise<void>;
  listJobs(): Promise<Job[]>;

  subscribe(handler: (event: JobEvent) => void): () => void; // retorna unsubscribe

  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  getHardwareInfo(): Promise<HardwareInfo>;
  checkForUpdate(): Promise<UpdateInfo | null>;

  revealInFolder(path: string): Promise<void>;
  pickOutputFolder(): Promise<string | null>;
}
