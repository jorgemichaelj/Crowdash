import type { DownloadOptions } from '../domain/types';
import type { UserFacingError } from '../errors/types';

export interface HandoffRequest {
  v: 1;
  id: string;
  type: 'handoff';
  payload: {
    mediaUrl: string;
    pageUrl: string;
    title?: string;
    kind: 'direct' | 'hls' | 'dash';
    preset: Pick<DownloadOptions, 'mode' | 'quality' | 'container'>;
    useBrowserSession: boolean; // só true se houver consentimento para o domínio
  };
}

export type HostResponse =
  | { v: 1; id: string; ok: true; jobId: string }
  | { v: 1; id: string; ok: false; error: UserFacingError };

export type HostStatus = 'connected' | 'disconnected' | 'not_installed';
