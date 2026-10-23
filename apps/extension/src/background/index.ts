import { scanPageMedia } from './scan';
import { NativeHostClient } from '../services/HostClient';
import { handoffRequestSchema } from '@crowdash/shared';
import { classifyMediaResource, httpUrl, mediaFileName, mergeMedia, youtubeMedia } from './media';
import type { DetectedMedia } from './media';
import type { ExtensionRequest, ExtensionState } from './messages';

const host = new NativeHostClient();
const pending = new Map<number, Promise<unknown>>();
const generations = new Map<number, symbol>();
const generation = (tabId: number) => {
  const current = generations.get(tabId) || Symbol();
  generations.set(tabId, current);
  return current;
};
const key = (tabId: number) => `tab:${tabId}`;
function serialized<T>(tabId: number, action: () => Promise<T>): Promise<T> {
  const task = (pending.get(tabId) || Promise.resolve()).catch(() => {}).then(action);
  pending.set(tabId, task);
  void task.finally(() => { if (pending.get(tabId) === task) pending.delete(tabId); }).catch(() => {});
  return task;
}
async function add(tabId: number, media: DetectedMedia[], expectedGeneration = generation(tabId)) {
  await serialized(tabId, async () => {
    if (generations.get(tabId) !== expectedGeneration) return;
    const data = await chrome.storage.session.get(key(tabId));
    const next = mergeMedia(data[key(tabId)] || [], media);
    await chrome.storage.session.set({ [key(tabId)]: next });
    await chrome.action.setBadgeText({ tabId, text: next.length ? String(next.length) : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#806127' });
  });
}

chrome.webRequest.onHeadersReceived.addListener(details => {
  if (details.tabId < 0 || details.statusCode >= 400) return;
  const header = (name: string) => details.responseHeaders?.find(h => h.name.toLowerCase() === name)?.value;
  const kind = classifyMediaResource(details.url, header('content-type'));
  if (!kind) return;
  const capturedGeneration = generation(details.tabId);
  void (async () => {
    const tab = await chrome.tabs.get(details.tabId);
    if (generations.get(details.tabId) !== capturedGeneration) return;
    if (!tab.url || !httpUrl(tab.url) || youtubeMedia(tab.url, tab.title || '')) return;
    const range = header('content-range')?.match(/\/(\d+)$/)?.[1];
    const size = Number(range || (details.statusCode === 206 ? 0 : header('content-length')));
    await add(details.tabId, [{ id: crypto.randomUUID(), url: details.url, pageUrl: tab.url, title: (tab.title || 'Mídia detectada').slice(0, 512), kind, source: 'network', ...(size > 0 ? { sizeBytes: size } : {}) }], capturedGeneration);
  })().catch(() => {});
}, { urls: ['http://*/*', 'https://*/*'] }, ['responseHeaders']);

chrome.tabs.onRemoved.addListener(tabId => {
  generations.delete(tabId);
  void serialized(tabId, () => chrome.storage.session.remove(key(tabId))).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.url) return;
  generations.set(tabId, Symbol());
  void serialized(tabId, async () => {
    const media = youtubeMedia(info.url!, tab.title || '');
    await chrome.storage.session.set({ [key(tabId)]: media ? [media] : [] });
    await chrome.action.setBadgeText({ tabId, text: media ? '1' : '' });
  }).catch(() => {});
});

async function state(refresh = false, checkHost = true): Promise<ExtensionState> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const status = checkHost ? host.getStatus() : Promise.resolve('disconnected' as const);
  if (tab?.id === undefined || !tab.url || !httpUrl(tab.url)) return { media: [], hostStatus: await status, notice: 'Abra uma página com vídeo ou música para detectar mídia.' };
  const pageUrl = tab.url;
  const capturedGeneration = generation(tab.id);
  const youtube = youtubeMedia(pageUrl, tab.title || '');
  if (youtube) await add(tab.id, [youtube], capturedGeneration);
  let notice: string | undefined;
  if (refresh && !youtube) {
    try {
      const frames = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: scanPageMedia });
      const media: DetectedMedia[] = [];
      for (const frame of frames) for (const found of frame.result || []) {
        const kind = classifyMediaResource(found.url, found.mime);
        if (kind) media.push({ id: crypto.randomUUID(), url: found.url, pageUrl, title: (tab.title || found.title || 'Mídia detectada').slice(0, 512), resolution: found.resolution, kind, source: 'dom' });
      }
      await add(tab.id, media, capturedGeneration);
    } catch { notice = 'Não foi possível inspecionar esta página. As mídias de rede continuam sendo detectadas durante a reprodução.'; }
  }
  const hostStatus = await status;
  if (generations.get(tab.id) !== capturedGeneration) return state(false, checkHost);
  if (pending.has(tab.id)) await pending.get(tab.id);
  const data = await chrome.storage.session.get(key(tab.id));
  return { tabId: tab.id, pageUrl, pageTitle: tab.title, media: data[key(tab.id)] || [], hostStatus, notice };
}

chrome.runtime.onMessage.addListener((message: ExtensionRequest, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) return false;
  void (async () => {
    if (message.type === 'state') return state(message.refresh);
    if (message.type === 'handoff') return host.sendHandoff(handoffRequestSchema.parse(message.request));
    if (message.type === 'download') {
      const current = await state(false, false);
      const item = current.media.find(m => m.id === message.mediaId);
      if (!item || item.kind !== 'direct') throw new Error('Esta mídia precisa ser enviada ao CrowDash.');
      const filename = mediaFileName(item);
      await chrome.downloads.download({ url: item.url, ...(filename ? { filename } : {}), saveAs: true });
      return { ok: true };
    }
    throw new Error('Comando desconhecido.');
  })().then(reply).catch(error => reply({ ok: false, message: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' }));
  return true;
});
