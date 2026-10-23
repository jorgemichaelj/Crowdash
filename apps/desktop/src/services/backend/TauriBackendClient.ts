// TauriBackendClient.ts — Implementação real do BackendClient usando Tauri invoke/listen

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  BackendClient,
  Job,
  JobInput,
  JobOrigin,
  MediaInfo,
  AppSettings,
  HardwareInfo,
  UpdateInfo,
  JobEvent,
  UserFacingError,
} from '@crowdash/shared';

export class TauriBackendClient implements BackendClient {
  private unlistenFns: UnlistenFn[] = [];

  // ─── analyzeUrl ────────────────────────────────────────────────────────────

  async analyzeUrl(url: string): Promise<MediaInfo> {
    try {
      const result = await invoke<MediaInfo>('analyze_url', { url });
      return result;
    } catch (err) {
      // Tauri retorna o erro como string JSON ou string simples
      throw this.parseError(err);
    }
  }

  // ─── analyzeFile ───────────────────────────────────────────────────────────

  async analyzeFile(path: string): Promise<MediaInfo> {
    try {
      return await invoke<MediaInfo>('analyze_file', { path });
    } catch (err) {
      throw this.parseError(err);
    }
  }

  // ─── enqueue ───────────────────────────────────────────────────────────────

  async enqueue(input: JobInput, origin: JobOrigin = 'desktop'): Promise<Job> {
    return invoke<Job>('enqueue_job', { input, origin });
  }

  // ─── cancel ────────────────────────────────────────────────────────────────

  async cancel(jobId: string): Promise<void> {
    return invoke('cancel_job', { jobId });
  }

  // ─── retry ─────────────────────────────────────────────────────────────────

  async retry(jobId: string): Promise<Job> {
    return invoke<Job>('retry_job', { jobId });
  }

  // ─── remove ────────────────────────────────────────────────────────────────

  async remove(jobId: string): Promise<void> {
    return invoke('remove_job', { jobId });
  }

  // ─── listJobs ──────────────────────────────────────────────────────────────

  async listJobs(): Promise<Job[]> {
    return invoke<Job[]>('list_jobs');
  }

  // ─── subscribe ─────────────────────────────────────────────────────────────

  subscribe(handler: (event: JobEvent) => void): () => void {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    listen<JobEvent>('job_event', (event) => {
      if (!disposed) handler(event.payload);
    }).then((fn) => {
      if (disposed) fn();
      else { unlisten = fn; this.unlistenFns.push(fn); }
    });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        this.unlistenFns = this.unlistenFns.filter((fn) => fn !== unlisten);
      }
    };
  }

  // ─── getSettings ───────────────────────────────────────────────────────────

  async getSettings(): Promise<AppSettings> {
    return invoke<AppSettings>('get_settings');
  }

  // ─── updateSettings ────────────────────────────────────────────────────────

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return invoke<AppSettings>('update_settings', { patch });
  }

  // ─── getHardwareInfo ───────────────────────────────────────────────────────

  async getHardwareInfo(): Promise<HardwareInfo> {
    return invoke<HardwareInfo>('get_hardware_info');
  }

  // ─── checkForUpdate ────────────────────────────────────────────────────────

  async checkForUpdate(): Promise<UpdateInfo | null> {
    return invoke<UpdateInfo | null>('check_for_update');
  }

  // ─── revealInFolder ────────────────────────────────────────────────────────

  async revealInFolder(path: string): Promise<void> {
    return invoke('reveal_in_folder', { path });
  }

  // ─── pickOutputFolder ──────────────────────────────────────────────────────

  async pickOutputFolder(): Promise<string | null> {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Escolher pasta de destino',
    });
    if (typeof selected === 'string') return selected;
    return null;
  }

  // ─── cleanup ───────────────────────────────────────────────────────────────

  destroy(): void {
    this.unlistenFns.forEach((fn) => fn());
    this.unlistenFns = [];
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private parseError(err: unknown): UserFacingError {
    if (typeof err === 'string') {
      // Tentar parsear como JSON de erro estruturado
      try {
        const parsed = JSON.parse(err);
        if (parsed.code && parsed.title) {
          return parsed as UserFacingError;
        }
      } catch {}

      // Mapear strings de erro do Rust para erros amigáveis
      if (err.includes('LOGIN_REQUIRED')) {
        return {
          code: 'LOGIN_REQUIRED',
          title: 'Login necessário',
          message: 'Este conteúdo requer autenticação. Configure sua sessão nas Configurações.',
          technicalDetails: err,
          retryable: true,
        };
      }
      if (err.includes('UNSUPPORTED_FORMAT')) {
        return {
          code: 'UNSUPPORTED_FORMAT',
          title: 'Formato não suportado',
          message: 'Este link não contém mídia que o Crowdash consegue processar.',
          technicalDetails: err,
          retryable: false,
        };
      }
      if (err.includes('NETWORK')) {
        return {
          code: 'NETWORK',
          title: 'Falha de rede',
          message: 'Verifique sua conexão e tente novamente.',
          technicalDetails: err,
          retryable: true,
        };
      }
    }
    return {
      code: 'UNKNOWN',
      title: 'Erro inesperado',
      message: 'Ocorreu um problema. Por favor, tente novamente.',
      technicalDetails: String(err),
      retryable: true,
    };
  }
}
