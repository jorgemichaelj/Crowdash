import { z } from 'zod';
import config from './nativeHost.json';

export const NATIVE_HOST_NAME = config.hostName;
export const EXTENSION_ID = config.extensionId;
export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;

const httpUrl = z.string().max(16384).refine(value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, 'Use uma URL HTTP ou HTTPS válida.');

export const handoffRequestSchema = z.object({
  v: z.literal(1), id: z.string().min(1).max(128).regex(/^[\w-]+$/), type: z.literal('handoff'),
  payload: z.object({
    mediaUrl: httpUrl, pageUrl: httpUrl, title: z.string().max(512).optional(),
    kind: z.enum(['direct', 'hls', 'dash', 'page']),
    action: z.enum(['download', 'analyze']).optional(),
    preset: z.object({ mode: z.enum(['video', 'audio']), quality: z.enum(['best', '1080p', '720p', '480p']), container: z.enum(['mp4', 'mkv', 'mp3', 'm4a']) })
      .refine(p => p.mode === 'audio' ? ['mp3', 'm4a'].includes(p.container) : ['mp4', 'mkv'].includes(p.container)),
    useBrowserSession: z.literal(false),
  }),
});

export const nativeResponseSchema = z.object({
  v: z.literal(1), id: z.string(), ok: z.boolean(),
  jobId: z.string().optional(), opened: z.boolean().optional(), status: z.literal('connected').optional(),
  error: z.object({ code: z.string(), title: z.string(), message: z.string(), retryable: z.boolean(), technicalDetails: z.string().optional() }).optional(),
}).refine(r => r.ok ? Boolean(r.jobId || r.opened || r.status) && !r.error : Boolean(r.error));
