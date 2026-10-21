import {
  BackendClient,
  Job,
  JobInput,
  JobOrigin,
  MediaInfo,
  AppSettings,
  HardwareInfo,
  UpdateInfo,
  JobEvent,
  createUserFacingError,
  EncoderKind,
  classifyMediaUrl,
} from '@crowdash/shared';

export class MockBackendClient implements BackendClient {
  private jobs: Job[] = [];
  private listeners: Set<(event: JobEvent) => void> = new Set();
  private settings: AppSettings;
  private hardwareInfo: HardwareInfo = {
    gpu: 'nvidia',
    encoder: 'nvenc',
  };
  private timer: any = null;
  private isProcessing = false;

  constructor() {
    // Carregar configurações do localStorage se existirem
    const savedSettings = localStorage.getItem('crowdash_settings');
    if (savedSettings) {
      try {
        this.settings = JSON.parse(savedSettings);
      } catch {
        this.settings = this.defaultSettings();
      }
    } else {
      this.settings = this.defaultSettings();
    }

    const savedJobs = localStorage.getItem('crowdash_jobs');
    if (savedJobs) {
      try {
        this.jobs = JSON.parse(savedJobs);
      } catch {
        this.jobs = [];
      }
    }
  }

  private defaultSettings(): AppSettings {
    return {
      outputFolder: 'C:\\Users\\Michael\\Downloads\\Crowdash',
      hardwareAcceleration: 'auto',
      theme: 'dark',
      notifyOnComplete: true,
      concurrency: 1,
      browserSessions: [
        {
          domain: 'youtube.com',
          granted: true,
          grantedAt: Date.now() - 86400000 * 3,
          browser: 'chrome',
        },
      ],
      advanced: {
        showTechnicalLogs: false,
      },
    };
  }

  private saveJobs() {
    try {
      localStorage.setItem('crowdash_jobs', JSON.stringify(this.jobs));
    } catch {}
  }

  private saveSettings() {
    try {
      localStorage.setItem('crowdash_settings', JSON.stringify(this.settings));
    } catch {}
  }

  private emit(event: JobEvent) {
    this.listeners.forEach((fn) => fn(event));
  }

  async analyzeUrl(url: string): Promise<MediaInfo> {
    // Latência realista de 500ms
    await new Promise((r) => setTimeout(r, 600));

    if (url.includes('fail-format')) {
      throw createUserFacingError('UNSUPPORTED_FORMAT', 'MIME type text/html not streamable');
    }

    const requiresLogin = url.includes('fail-login') || url.includes('private');

    const classified = classifyMediaUrl(url);

    if (classified.kind === 'playlist') {
      return {
        source: 'url',
        title: 'Playlist Especial de Músicas & Vídeos',
        durationSec: 3600,
        thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80',
        collectionType: 'playlist',
        canonicalUrl: classified.url,
        suggestions: ['download'],
        availableQualities: ['best', '1080p', '720p', '480p'],
        canStreamCopyTo: ['mp4'],
      };
    }

    if (classified.kind === 'channel') {
      const channelName = classified.name;
      return {
        source: 'url',
        title: `Canal: ${channelName}`,
        durationSec: 15420,
        thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&q=80',
        collectionType: 'channel',
        channelName,
        canonicalUrl: classified.url,
        suggestions: ['download'],
        availableQualities: ['best', '1080p', '720p', '480p'],
        canStreamCopyTo: ['mp4'],
      };
    }

    return {
      source: 'url',
      title: 'Amostra de Demonstração de Vídeo Alta Qualidade',
      canonicalUrl: classified.url,
      playlistUrl: classified.playlistUrl,
      durationSec: 245,
      thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&q=80',
      container: 'mp4',
      video: {
        codec: 'h264',
        width: 1920,
        height: 1080,
        fps: 60,
      },
      audio: {
        codec: 'aac',
        channels: 2,
      },
      estimatedSizeBytes: 48 * 1024 * 1024,
      availableQualities: ['best', '1080p', '720p', '480p'],
      requiresLogin,
      suggestions: ['download'],
      canStreamCopyTo: ['mp4', 'mkv'],
    };
  }

  async analyzeFile(path: string): Promise<MediaInfo> {
    await new Promise((r) => setTimeout(r, 400));
    const lower = path.toLowerCase();
    const ext = lower.split('.').pop() || '';

    const isImage = ['webp', 'png', 'jpg', 'jpeg', 'ico', 'avif', 'bmp'].includes(ext);
    const isAudio = ['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg'].includes(ext);
    const isVideo = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv'].includes(ext) || (!isImage && !isAudio);

    if (isImage) {
      return {
        source: 'file',
        title: path.split('\\').pop() || 'imagem.webp',
        durationSec: 0,
        container: ext,
        category: 'image',
        image: { width: 1920, height: 1080 },
        estimatedSizeBytes: 2 * 1024 * 1024,
        suggestions: ['convert'],
        canStreamCopyTo: ['png', 'jpeg', 'webp'],
      };
    }

    if (isAudio) {
      return {
        source: 'file',
        title: path.split('\\').pop() || 'audio.mp3',
        durationSec: 210,
        container: ext,
        category: 'audio',
        audio: { codec: ext, channels: 2 },
        estimatedSizeBytes: 8 * 1024 * 1024,
        suggestions: ['convert'],
        canStreamCopyTo: ['mp3', 'm4a', 'wav'],
      };
    }

    // Vídeo
    return {
      source: 'file',
      title: path.split('\\').pop() || 'video.mp4',
      durationSec: 180,
      container: ext || 'mp4',
      category: 'video',
      video: {
        codec: ext === 'webm' ? 'vp9' : 'h264',
        width: 1920,
        height: 1080,
        fps: 30,
      },
      audio: {
        codec: 'aac',
        channels: 2,
      },
      estimatedSizeBytes: 35 * 1024 * 1024,
      suggestions: ['convert', 'compress', 'extractAudio'],
      canStreamCopyTo: ext === 'mkv' ? ['mkv', 'mp4'] : ['mp4'],
    };
  }

  async enqueue(input: JobInput, origin: JobOrigin = 'desktop'): Promise<Job> {
    let jobType: any = 'download';
    if (input.kind === 'batch') {
      jobType = 'batchDownload';
    } else if (input.kind === 'file') {
      jobType = input.options.op;
    }

    const job: Job = {
      id: 'job_' + Math.random().toString(36).substring(2, 9),
      type: jobType,
      status: 'pending',
      origin,
      input,
      progress: 0,
      logs: [`[${new Date().toLocaleTimeString()}] Tarefa criada e adicionada à fila.`],
      createdAt: Date.now(),
    };

    this.jobs.unshift(job);
    this.saveJobs();
    this.processQueue();
    return job;
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return;

    if (job.status === 'running' || job.status === 'pending') {
      job.status = 'cancelled';
      job.finishedAt = Date.now();
      job.logs.push(`[${new Date().toLocaleTimeString()}] Operação cancelada pelo usuário.`);
      this.saveJobs();
      this.emit({ type: 'CANCELLED', jobId: job.id });
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.isProcessing = false;
      this.processQueue();
    }
  }

  async retry(jobId: string): Promise<Job> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) throw new Error('Job not found');

    job.status = 'pending';
    job.progress = 0;
    job.error = undefined;
    job.logs.push(`[${new Date().toLocaleTimeString()}] Reiniciando tarefa...`);
    this.saveJobs();
    this.processQueue();
    return job;
  }

  async remove(jobId: string): Promise<void> {
    this.jobs = this.jobs.filter((j) => j.id !== jobId);
    this.saveJobs();
  }

  async listJobs(): Promise<Job[]> {
    return [...this.jobs];
  }

  subscribe(handler: (event: JobEvent) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  async getSettings(): Promise<AppSettings> {
    return { ...this.settings };
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = { ...this.settings, ...patch };
    this.saveSettings();
    return { ...this.settings };
  }

  async getHardwareInfo(): Promise<HardwareInfo> {
    return { ...this.hardwareInfo };
  }

  async checkForUpdate(): Promise<UpdateInfo | null> {
    return {
      currentVersion: '0.1.0',
      newVersion: '0.2.0',
      notes: 'Suporte aprimorado para novos formatos e otimizações de interface.',
    };
  }

  async revealInFolder(path: string): Promise<void> {
    console.log(`[Mock] Abrindo diretório: ${path}`);
  }

  async pickOutputFolder(): Promise<string | null> {
    return 'C:\\Users\\Michael\\Videos\\Crowdash_Export';
  }

  private processQueue() {
    if (this.isProcessing) return;

    const nextJob = this.jobs.find((j) => j.status === 'pending');
    if (!nextJob) return;

    this.isProcessing = true;
    nextJob.status = 'running';
    nextJob.startedAt = Date.now();

    // Escolha do encoder simulada
    let encoder: EncoderKind = 'cpu';
    if (nextJob.input.kind === 'file') {
      encoder = 'copy';
    } else if (this.settings.hardwareAcceleration === 'auto' && this.hardwareInfo.encoder) {
      encoder = this.hardwareInfo.encoder;
    }
    nextJob.encoder = encoder;

    nextJob.logs.push(
      `[${new Date().toLocaleTimeString()}] Iniciando processamento com encoder: ${encoder}.`
    );
    this.saveJobs();
    this.emit({ type: 'STARTED', jobId: nextJob.id });

    // Checar se há trigger de erro determinístico
    const inputStr =
      nextJob.input.kind === 'url'
        ? nextJob.input.url
        : nextJob.input.kind === 'file'
        ? nextJob.input.path
        : nextJob.input.title;

    let targetError: any = null;
    if (inputStr.includes('fail-format')) {
      targetError = createUserFacingError('UNSUPPORTED_FORMAT', 'Incompatible codec');
    } else if (inputStr.includes('fail-login')) {
      targetError = createUserFacingError('LOGIN_REQUIRED', 'HTTP 403 Forbidden');
    } else if (inputStr.includes('fail-net')) {
      targetError = createUserFacingError('NETWORK', 'Connection reset by peer');
    } else if (inputStr.includes('fail-disk')) {
      targetError = createUserFacingError('DISK_FULL', 'ENOSPC: no space left on device');
    }

    let progress = 0;
    this.timer = setInterval(() => {
      // Simula falha no meio do progresso se configurado
      if (targetError && progress >= 35) {
        clearInterval(this.timer);
        this.timer = null;
        nextJob.status = 'failed';
        nextJob.error = targetError;
        nextJob.finishedAt = Date.now();
        nextJob.logs.push(
          `[${new Date().toLocaleTimeString()}] Erro: ${targetError.title} - ${targetError.technicalDetails}`
        );
        this.saveJobs();
        this.emit({ type: 'ERROR', jobId: nextJob.id, error: targetError });
        this.isProcessing = false;
        this.processQueue();
        return;
      }

      // Incremento de progresso realista
      const step = encoder === 'copy' ? 25 : Math.floor(Math.random() * 8) + 5;
      progress += step;
      if (progress > 100) progress = 100;

      nextJob.progress = progress;
      const speed = Math.floor((Math.random() * 10 + 2) * 1024 * 1024); // 2 a 12 MB/s
      const eta = Math.ceil(((100 - progress) / 10));

      nextJob.speedBytesPerSec = speed;
      nextJob.etaSeconds = eta;

      this.emit({
        type: 'PROGRESS',
        jobId: nextJob.id,
        progress,
        speedBytesPerSec: speed,
        etaSeconds: eta,
      });

      if (progress >= 100) {
        clearInterval(this.timer);
        this.timer = null;
        nextJob.status = 'completed';
        nextJob.outputPath = `${this.settings.outputFolder}\\midia_concluida_${nextJob.id.slice(4)}.mp4`;
        nextJob.finishedAt = Date.now();
        nextJob.logs.push(
          `[${new Date().toLocaleTimeString()}] Concluído com sucesso. Arquivo salvo em: ${nextJob.outputPath}`
        );
        this.saveJobs();
        this.emit({
          type: 'COMPLETED',
          jobId: nextJob.id,
          outputPath: nextJob.outputPath,
        });
        this.isProcessing = false;
        this.processQueue();
      }
    }, 400);
  }
}
