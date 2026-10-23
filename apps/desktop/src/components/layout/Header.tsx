import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { IconButton, Badge } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useBackendMode } from '../../services/backend/BackendProvider';
import { ListOrdered, Settings, Terminal } from 'lucide-react';

export function Header() {
  const mode = useBackendMode();
  const { currentTab, setCurrentTab, jobs, setDevPanelOpen } = useAppStore();
  const { t } = useI18n();

  const runningCount = jobs.filter((j) => j.status === 'running' || j.status === 'pending').length;

  return (
    <header className="min-h-20 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-40 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3">
      {/* Brand */}
      <button
        type="button"
        aria-label="CrowDash — início"
        className="flex items-center gap-3 cursor-pointer select-none text-left rounded-lg"
        onClick={() => setCurrentTab('home')}
      >
        <span className="crowdash-brand-mark w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
          <img src="/crowdash-logo.png" alt="" className="w-10 h-10 object-contain" />
        </span>
        <span>
          <span className="crowdash-wordmark block text-2xl font-bold text-foreground leading-none">Crow<span className="text-primary">Dash</span></span>
          <span className="block text-[10px] text-muted-foreground mt-1">{t.app.tagline}</span>
          <span className="block text-[10px] text-primary mt-1">{mode === 'native' ? 'Aplicativo desktop' : 'Prévia da interface'}</span>
        </span>
      </button>

      {/* Navegação */}
      <nav aria-label="Navegação principal" className="flex flex-wrap items-center gap-1 sm:gap-2">
        <button
          onClick={() => setCurrentTab('home')}
          aria-current={currentTab === 'home' ? 'page' : undefined}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            currentTab === 'home'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {t.nav.home}
        </button>

        <button
          onClick={() => setCurrentTab('queue')}
          aria-current={currentTab === 'queue' ? 'page' : undefined}
          className={`relative px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
            currentTab === 'queue'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          <span>{t.nav.queue}</span>
          {runningCount > 0 && (
            <Badge variant="info" className="ml-1 px-1.5 py-0 text-[10px] leading-tight">
              {runningCount}
            </Badge>
          )}
        </button>

        <button
          onClick={() => setCurrentTab('settings')}
          aria-current={currentTab === 'settings' ? 'page' : undefined}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
            currentTab === 'settings'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>{t.nav.settings}</span>
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        <IconButton
          size="sm"
          variant="ghost"
          title="Painel Desenvolvedor (Ctrl+Shift+D)"
          onClick={() => setDevPanelOpen(true)}
        >
          <Terminal className="w-4 h-4 text-muted-foreground hover:text-primary" />
        </IconButton>
      </nav>
    </header>
  );
}
