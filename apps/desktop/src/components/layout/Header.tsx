import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { IconButton, Badge } from '../../components/ui';
import { useI18n } from '../../i18n';
import { Flame, ListOrdered, Settings, Terminal } from 'lucide-react';

export function Header() {
  const { currentTab, setCurrentTab, jobs, setDevPanelOpen } = useAppStore();
  const { t } = useI18n();

  const runningCount = jobs.filter((j) => j.status === 'running' || j.status === 'pending').length;

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
      {/* Brand */}
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setCurrentTab('home')}
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Flame className="w-4 h-4 fill-primary" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-foreground leading-none">{t.app.name}</h1>
          <span className="text-[10px] text-muted-foreground">{t.app.tagline}</span>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex items-center gap-2">
        <button
          onClick={() => setCurrentTab('home')}
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
