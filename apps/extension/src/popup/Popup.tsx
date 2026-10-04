import React, { useState, useEffect } from 'react';
import { MockHostClient } from '../services/HostClient';
import type { HostStatus, HandoffRequest } from '@crowdash/shared';
import {
  Flame,
  Download,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Film,
  Music,
} from 'lucide-react';

interface DetectedMedia {
  id: string;
  url: string;
  title: string;
  kind: 'direct' | 'hls' | 'dash';
  resolution?: string;
  sizeMB?: number;
}

const mockClient = new MockHostClient();

export function Popup() {
  const [hostStatus, setHostStatus] = useState<HostStatus>('connected');
  const [medias, setMedias] = useState<DetectedMedia[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentSuccessId, setSentSuccessId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    mockClient.getStatus().then(setHostStatus);

    // Carregar detecções simuladas
    setMedias([
      {
        id: 'm1',
        url: 'https://exemplo.com/fluxo.m3u8',
        title: 'Transmissão ao Vivo em Alta Definição',
        kind: 'hls',
        resolution: '1080p60',
        sizeMB: 120,
      },
      {
        id: 'm2',
        url: 'https://exemplo.com/clipe_direto.mp4',
        title: 'Vídeo Direto MP4 de Amostra',
        kind: 'direct',
        resolution: '720p',
        sizeMB: 35,
      },
    ]);
  }, []);

  const handleSendToDesktop = async (item: DetectedMedia) => {
    setSendingId(item.id);
    setErrorMsg(null);

    const req: HandoffRequest = {
      v: 1,
      id: Math.random().toString(36).substring(2, 9),
      type: 'handoff',
      payload: {
        mediaUrl: item.url,
        pageUrl: 'https://exemplo.com',
        title: item.title,
        kind: item.kind,
        preset: {
          mode: 'video',
          quality: 'best',
          container: 'mp4',
        },
        useBrowserSession: false,
      },
    };

    const res = await mockClient.sendHandoff(req);
    setSendingId(null);

    if (res.ok) {
      setSentSuccessId(item.id);
      setTimeout(() => setSentSuccessId(null), 3000);
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleDownloadDirect = (item: DetectedMedia) => {
    alert(`[Simulação] Download direto disparado no navegador para: ${item.url}`);
  };

  return (
    <div className="w-[380px] p-4 bg-slate-900 text-slate-100 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-sky-500/20 text-sky-400 flex items-center justify-center">
            <Flame className="w-4 h-4 fill-sky-400" />
          </div>
          <div>
            <h1 className="text-xs font-bold leading-none">Crowdash</h1>
            <span className="text-[10px] text-slate-400">Captura de Mídia</span>
          </div>
        </div>

        {/* Host Status Badge */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <span
            className={`w-2 h-2 rounded-full ${
              hostStatus === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'
            }`}
          />
          <span className="text-slate-400">
            {hostStatus === 'connected' ? 'App Conectado' : 'App Desconectado'}
          </span>
        </div>
      </div>

      {/* Alerta de erro */}
      {errorMsg && (
        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Lista de Mídias Detectadas */}
      <div className="space-y-3">
        <div className="flex justify-between items-center text-xs text-slate-400">
          <span>Mídias Detectadas ({medias.length})</span>
          <button
            onClick={() => {
              // Simular nova detecção
              setMedias((prev) => [
                ...prev,
                {
                  id: 'm_' + Date.now(),
                  url: 'https://exemplo.com/audio.mp3',
                  title: 'Áudio Capturado na Página',
                  kind: 'direct',
                  sizeMB: 8,
                },
              ]);
            }}
            className="text-[10px] text-sky-400 hover:underline cursor-pointer"
          >
            + Simular captura
          </button>
        </div>

        {medias.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Nenhuma mídia detectada. Reproduza um vídeo para detectá-lo.
          </div>
        ) : (
          medias.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/60 flex flex-col gap-2.5"
            >
              <div className="flex items-start gap-2.5">
                <div className="p-2 bg-slate-700 rounded text-slate-300">
                  {item.kind === 'direct' ? (
                    <Film className="w-4 h-4" />
                  ) : (
                    <Music className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-medium text-slate-200 truncate">
                    {item.title}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                    <span className="uppercase font-semibold text-sky-400">
                      {item.kind}
                    </span>
                    {item.resolution && <span>• {item.resolution}</span>}
                    {item.sizeMB && <span>• ~{item.sizeMB} MB</span>}
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-2 pt-1">
                {item.kind === 'direct' && (
                  <button
                    onClick={() => handleDownloadDirect(item)}
                    className="flex-1 py-1.5 px-2 bg-slate-700 hover:bg-slate-600 rounded text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar no navegador
                  </button>
                )}

                <button
                  onClick={() => handleSendToDesktop(item)}
                  disabled={sendingId === item.id}
                  className="flex-1 py-1.5 px-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded text-xs font-medium text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {sendingId === item.id ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Enviando...
                    </>
                  ) : sentSuccessId === item.id ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                      Enviado ao Crowdash
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir no Crowdash
                    </>
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Rodapé */}
      <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-[11px] text-slate-500">
        <span>v0.1.0 (Mock)</span>
        <button
          onClick={() =>
            setHostStatus((prev) => (prev === 'connected' ? 'disconnected' : 'connected'))
          }
          className="hover:text-slate-300 cursor-pointer"
        >
          Alternar Status Host
        </button>
      </div>
    </div>
  );
}
