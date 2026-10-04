import React, { useState } from 'react';
import { WebDownloaderTab } from './tabs/WebDownloaderTab';
import { FileConverterTab } from './tabs/FileConverterTab';
import { MediaTrimTab } from './tabs/MediaTrimTab';
import { MediaCompressTab } from './tabs/MediaCompressTab';
import { Download, RefreshCw, Scissors, Minimize2 } from 'lucide-react';

export type HomeUtilityTab = 'download' | 'convert' | 'trim' | 'compress';

export function HomeView() {
  const [activeTab, setActiveTab] = useState<HomeUtilityTab>('download');

  const tabs: { id: HomeUtilityTab; label: string; icon: any; desc: string; badge?: string }[] = [
    {
      id: 'download',
      label: 'Baixar da Web',
      icon: Download,
      desc: 'Vídeos, Músicas, Playlists e Canais',
    },
    {
      id: 'convert',
      label: 'Converter Arquivos',
      icon: RefreshCw,
      desc: 'Fotos (WebP ➔ PNG), Vídeos e Músicas',
      badge: 'Popular',
    },
    {
      id: 'trim',
      label: 'Cortar Mídia',
      icon: Scissors,
      desc: 'Editar início e fim de vídeos',
    },
    {
      id: 'compress',
      label: 'Comprimir',
      icon: Minimize2,
      desc: 'Reduzir para 25MB Discord / Zap',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Barra de Seleção das Utilidades no Topo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-1.5 bg-muted/40 rounded-2xl border border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-3 rounded-xl text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                isActive
                  ? 'bg-card text-foreground shadow-sm border border-border ring-1 ring-primary/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`p-1.5 rounded-lg ${
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                {tab.badge && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    {tab.badge}
                  </span>
                )}
              </div>

              <div className="mt-2">
                <strong className="text-xs font-semibold block leading-tight text-foreground">
                  {tab.label}
                </strong>
                <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                  {tab.desc}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Conteúdo da Ferramenta Selecionada */}
      <div className="animate-in fade-in duration-150">
        {activeTab === 'download' && <WebDownloaderTab />}
        {activeTab === 'convert' && <FileConverterTab />}
        {activeTab === 'trim' && <MediaTrimTab />}
        {activeTab === 'compress' && <MediaCompressTab />}
      </div>
    </div>
  );
}
