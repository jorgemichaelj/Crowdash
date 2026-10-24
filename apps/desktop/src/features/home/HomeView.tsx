import React, { useState, useEffect } from 'react';
import { WebDownloaderTab } from './tabs/WebDownloaderTab';
import { FileConverterTab } from './tabs/FileConverterTab';
import { MediaCompressTab } from './tabs/MediaCompressTab';
import { useAppStore } from '../../stores/appStore';
import { Download, RefreshCw, Minimize2 } from 'lucide-react';

export type HomeUtilityTab = 'download' | 'convert' | 'compress';

export function HomeView() {
  const [activeTab, setActiveTab] = useState<HomeUtilityTab>('download');
  const pendingUrl = useAppStore(s => s.pendingDownloadUrl);
  useEffect(() => { if (pendingUrl) setActiveTab('download'); }, [pendingUrl]);

  const tabs: { id: HomeUtilityTab; label: string; icon: any }[] = [
    {
      id: 'download',
      label: 'Baixar da Web',
      icon: Download,
    },
    {
      id: 'convert',
      label: 'Converter Arquivos',
      icon: RefreshCw,
    },
    {
      id: 'compress',
      label: 'Comprimir',
      icon: Minimize2,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Barra de Seleção das Utilidades no Topo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-1.5 bg-muted/40 rounded-2xl border border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              type="button"
              aria-pressed={isActive}
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
              </div>

              <div className="mt-2">
                <strong className="text-xs font-semibold block leading-tight text-foreground">
                  {tab.label}
                </strong>
              </div>
            </button>
          );
        })}
      </div>

      {/* Conteúdo da Ferramenta Selecionada */}
      <div className="animate-in fade-in duration-150">
        {activeTab === 'download' && <WebDownloaderTab />}
        {activeTab === 'convert' && <FileConverterTab />}
        {activeTab === 'compress' && <MediaCompressTab />}
      </div>
    </div>
  );
}
