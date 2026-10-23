import React, { createContext, useContext, useEffect, useMemo } from 'react';
import type { BackendClient } from '@crowdash/shared';
import { createBackend, type BackendConnection } from './createBackend';
import { useAppStore } from '../../stores/appStore';
import { useToast } from '../../components/ui/toast';

const BackendContext = createContext<BackendConnection | null>(null);

export function BackendProvider({ children }: { children: React.ReactNode }) {
  const connection = useMemo(createBackend, []);
  const { client } = connection;
  const { setJobs, updateJob, setSettings } = useAppStore();
  const { showToast } = useToast();

  useEffect(() => {
    // Carregar configurações iniciais
    client.getSettings().then(setSettings).catch(() => showToast('Não foi possível carregar as configurações do aplicativo.', 'error'));
    client.listJobs().then(setJobs).catch(() => showToast('Não foi possível carregar a fila de tarefas.', 'error'));

    // Escutar eventos de jobs
    const unsubscribe = client.subscribe((event) => {
      client.listJobs().then((jobs) => {
        const job = jobs.find((j) => j.id === event.jobId);
        if (job) {
          updateJob(job);
        }
      });

      if (event.type === 'COMPLETED') {
        showToast(connection.mode === 'demo' ? 'Simulação concluída. Nenhum arquivo foi baixado.' : 'Tarefa concluída com sucesso!', connection.mode === 'demo' ? 'info' : 'success');
      } else if (event.type === 'ERROR') {
        showToast(event.error.title, 'error');
      }
    });

    return () => unsubscribe();
  }, [client, connection.mode, setJobs, updateJob, setSettings, showToast]);

  return <BackendContext.Provider value={connection}>{children}</BackendContext.Provider>;
}

export function useBackend(): BackendClient {
  const context = useContext(BackendContext);
  if (!context) {
    throw new Error('useBackend must be used within a BackendProvider');
  }
  return context.client;
}

export function useBackendMode() {
  const context = useContext(BackendContext);
  if (!context) throw new Error('useBackendMode must be used within a BackendProvider');
  return context.mode;
}
