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
    kind: 'direct' | 'hls' | 'dash' | 'page';
    action?: 'download' | 'analyze';
    preset: Pick<DownloadOptions, 'mode' | 'quality' | 'container'>;
    useBrowserSession: boolean; // só true se houver consentimento para o domínio
  };
}

export type HostResponse =
  | { v: 1; id: string; ok: true; jobId: string }
  | { v: 1; id: string; ok: true; opened: true }
  | { v: 1; id: string; ok: false; error: UserFacingError };

export type HostStatus = 'connected' | 'disconnected' | 'not_installed';

export type PingRequest = { v: 1; id: string; type: 'ping' };
export type NativeRequest = HandoffRequest | PingRequest;
export type NativeResponse = HostResponse | { v: 1; id: string; ok: true; status: 'connected' };
