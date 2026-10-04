import React, { createContext, useContext, useEffect, useMemo } from 'react';
import type { BackendClient } from '@crowdash/shared';
import { TauriBackendClient } from './TauriBackendClient';
import { MockBackendClient } from '../mock/MockBackendClient';
import { useAppStore } from '../../stores/appStore';
import { useToast } from '../../components/ui/toast';

const BackendContext = createContext<BackendClient | null>(null);

export function BackendProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => {
    // If we're not inside Tauri, fallback to Mock to not break standard web dev
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    return isTauri ? new TauriBackendClient() : new MockBackendClient();
  }, []);
  const { setJobs, updateJob, setSettings } = useAppStore();
  const { showToast } = useToast();

  useEffect(() => {
    // Carregar configurações iniciais
    client.getSettings().then(setSettings);
    client.listJobs().then(setJobs);

    // Escutar eventos de jobs
    const unsubscribe = client.subscribe((event) => {
      client.listJobs().then((jobs) => {
        const job = jobs.find((j) => j.id === event.jobId);
        if (job) {
          updateJob(job);
        }
      });

      if (event.type === 'COMPLETED') {
        showToast('Tarefa concluída com sucesso!', 'success');
      } else if (event.type === 'ERROR') {
        showToast(event.error.title, 'error');
      }
    });

    return () => unsubscribe();
  }, [client, setJobs, updateJob, setSettings, showToast]);

  return <BackendContext.Provider value={client}>{children}</BackendContext.Provider>;
}

export function useBackend(): BackendClient {
  const context = useContext(BackendContext);
  if (!context) {
    throw new Error('useBackend must be used within a BackendProvider');
  }
  return context;
}
