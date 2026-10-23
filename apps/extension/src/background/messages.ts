import type { HandoffRequest, HostResponse, HostStatus } from '@crowdash/shared';
import type { DetectedMedia } from './media';

export type ExtensionRequest =
  | { type: 'state'; refresh?: boolean }
  | { type: 'handoff'; request: HandoffRequest }
  | { type: 'download'; mediaId: string };
export interface ExtensionState {
  tabId?: number;
  pageUrl?: string;
  pageTitle?: string;
  media: DetectedMedia[];
  hostStatus: HostStatus;
  notice?: string;
}
export type ExtensionReply = ExtensionState | HostResponse | { ok: boolean; message?: string };
