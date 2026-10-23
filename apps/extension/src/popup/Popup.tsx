import React, { useState, useEffect } from 'react';
import type { HandoffRequest, HostResponse } from '@crowdash/shared';
import type { ExtensionRequest, ExtensionState } from '../background/messages';
import type { DetectedMedia } from '../background/media';
import { Download, ExternalLink, AlertCircle, CheckCircle2, RefreshCw, Film, Music } from 'lucide-react';

async function send<T>(message: ExtensionRequest): Promise<T> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) throw new Error('Abra este painel pela extensão do Chrome ou Edge.');
  return chrome.runtime.sendMessage(message);
}

export function Popup() {
  const [state, setState] = useState<ExtensionState>({ media: [], hostStatus: 'disconnected' });
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'video' | 'audio'>('video');

  const refresh = async () => {
    setLoading(true); setError(null);
    try {
      const result = await send<ExtensionState & { ok?: boolean; message?: string }>({ type: 'state', refresh: true });
      if (!Array.isArray(result.media)) throw new Error(result.message || 'Não foi possível consultar esta aba.');
      setState(result);
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao detectar mídia.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const handoff = async (item?: DetectedMedia) => {
    if (!state.pageUrl) return;
    const id = item?.id || 'page'; setSendingId(id); setSentId(null); setError(null);
    const request: HandoffRequest = { v: 1, id: crypto.randomUUID(), type: 'handoff', payload: {
      mediaUrl: item?.url || state.pageUrl, pageUrl: state.pageUrl, title: (item?.title || state.pageTitle || '').slice(0, 512),
      kind: item?.kind || 'page', action: item ? 'download' : 'analyze',
      preset: { mode, quality: 'best', container: mode === 'audio' ? 'mp3' : 'mp4' }, useBrowserSession: false,
    } };
    try {
      const response = await send<HostResponse | { ok: false; message: string }>({ type: 'handoff', request });
      if (!response.ok) throw new Error('error' in response ? response.error.message : response.message || 'Falha ao enviar mídia.');
      setSentId(id); setState(s => ({ ...s, hostStatus: 'connected' }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível conectar ao aplicativo.'); }
    finally { setSendingId(null); }
  };

  const direct = async (item: DetectedMedia) => {
    setSendingId(item.id); setError(null);
    try { const response = await send<{ ok: boolean; message?: string }>({ type: 'download', mediaId: item.id }); if (!response.ok) throw new Error(response.message); setSentId(item.id); }
    catch (err) { setError(err instanceof Error ? err.message : 'O download não pôde ser iniciado.'); }
    finally { setSendingId(null); }
  };

  return (
    <div className="w-[380px] p-4 bg-stone-900 text-stone-100 flex flex-col gap-4">
      <header className="flex items-center justify-between border-b border-stone-800 pb-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-[#1e1e1c] border border-brand-500/30 flex items-center justify-center"><img src="/crowdash-logo.png" alt="" className="w-9 h-9 object-contain" /></div>
          <div><h1 className="font-serif text-xl font-bold leading-none tracking-tight">Crow<span className="text-brand-400">Dash</span></h1><span className="text-[10px] text-stone-400">Captura de mídia</span></div>
        </div>
        <span className="text-[10px] text-stone-400 flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${state.hostStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />{state.hostStatus === 'connected' ? 'App conectado' : state.hostStatus === 'not_installed' ? 'Conectar extensão' : 'App fechado'}</span>
      </header>
      {state.hostStatus !== 'connected' && <p className="text-[11px] text-stone-400 rounded-lg border border-stone-700 p-2.5">{state.hostStatus === 'not_installed' ? 'Abra o CrowDash e conecte a extensão em Configurações → Navegador.' : 'Ao enviar uma mídia, o CrowDash será aberto se a conexão já estiver configurada.'}</p>}
      {error && <div role="alert" className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
      <div className="flex justify-between items-center text-xs text-stone-400">
        <h2>Mídias nesta aba ({state.media.length})</h2>
        <button onClick={refresh} disabled={loading || !!sendingId} className="text-brand-400 flex gap-1 items-center disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
      </div>
      {state.notice && <p className="text-[11px] text-stone-400">{state.notice}</p>}
      <label className="text-xs text-stone-400 flex items-center justify-between gap-2">Enviar ao app como
        <select value={mode} onChange={e => setMode(e.target.value as 'video' | 'audio')} className="bg-stone-800 border border-stone-700 rounded-lg p-1.5 text-stone-100"><option value="video">Vídeo (MP4)</option><option value="audio">Música / áudio (MP3)</option></select>
      </label>
      <main className="space-y-3 max-h-[420px] overflow-y-auto">
        {!state.media.length && <p className="p-4 text-center text-xs text-stone-400">{loading ? 'Procurando mídia…' : 'Reproduza o vídeo ou a música e clique em Atualizar. Você também pode enviar a página atual ao aplicativo.'}</p>}
        {state.media.map(item => <article key={item.id} className="p-3 bg-stone-800/80 rounded-xl border border-stone-700/60 space-y-3">
          <div className="flex items-start gap-2.5"><span className="p-2 bg-stone-700 rounded-lg text-brand-400">{mode === 'audio' ? <Music className="w-4 h-4" /> : <Film className="w-4 h-4" />}</span><div className="min-w-0"><h3 className="text-xs font-medium truncate" title={item.title}>{item.title}</h3><p className="text-[10px] text-stone-400 mt-1"><span className="text-brand-400 uppercase">{item.kind === 'page' ? 'YouTube' : item.kind}</span>{item.resolution && ` · ${item.resolution}`}{item.sizeBytes && ` · ${(item.sizeBytes / 1048576).toFixed(1)} MB`}</p></div></div>
          <div className="flex gap-2">
            {item.kind === 'direct' && <button disabled={!!sendingId} onClick={() => direct(item)} className="flex-1 p-2 bg-stone-700 rounded-lg text-[11px] disabled:opacity-50 flex gap-1 items-center justify-center"><Download className="w-3.5 h-3.5" /> No navegador</button>}
            <button disabled={!!sendingId} onClick={() => handoff(item)} className="flex-1 p-2 bg-brand-500 rounded-lg text-stone-950 text-[11px] font-medium disabled:opacity-50 flex gap-1 items-center justify-center">{sendingId === item.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : sentId === item.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}{sendingId === item.id ? 'Enviando…' : sentId === item.id ? 'Enviado' : 'Enviar ao CrowDash'}</button>
          </div>
        </article>)}
      </main>
      <button disabled={!state.pageUrl || !!sendingId} onClick={() => handoff()} className="w-full py-2 border border-brand-500/40 rounded-lg text-brand-400 text-xs disabled:opacity-50">{sendingId === 'page' ? 'Abrindo…' : sentId === 'page' ? 'Página aberta no CrowDash' : 'Abrir página no CrowDash'}</button>
      <footer className="border-t border-stone-800 pt-2 text-[10px] text-stone-500">Escolha formatos, playlists e canais completos no aplicativo.</footer>
    </div>
  );
}
