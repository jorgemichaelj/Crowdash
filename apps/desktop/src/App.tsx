import React, { useEffect } from 'react';
import { ExtensionConnection } from './services/extension/ExtensionConnection';
import { Header } from './components/layout/Header';
import { HomeView } from './features/home/HomeView';
import { QueueView } from './features/queue/QueueView';
import { SettingsView } from './features/settings/SettingsView';
import { DevPanel } from './features/dev/DevPanel';
import { UpdateDialog } from './features/update/UpdateDialog';
import { useAppStore } from './stores/appStore';

export function App() {
  const { currentTab, setDevPanelOpen } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setDevPanelOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setDevPanelOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <ExtensionConnection />
      <Header />

      <main className="flex-1 p-4 sm:p-6">
        {currentTab === 'home' && <HomeView />}
        {currentTab === 'queue' && <QueueView />}
        {currentTab === 'settings' && <SettingsView />}
      </main>

      <DevPanel />
      <UpdateDialog />
    </div>
  );
}
