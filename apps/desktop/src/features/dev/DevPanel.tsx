import React from 'react';
import { useBackend } from '../../services/backend/BackendProvider';
import { useAppStore } from '../../stores/appStore';
import { Dialog } from '../../components/ui/overlays';
import { Button } from '../../components/ui';
import { useI18n } from '../../i18n';

export function DevPanel() {
  const backend = useBackend();
  const { isDevPanelOpen, setDevPanelOpen, setUpdateAvailable } = useAppStore();
  const { t } = useI18n();

  const handleEnqueueSample = async () => {
    await backend.enqueue({
      kind: 'url',
      url: 'https://exemplo.com/video-amostra-1080p',
      options: {
        mode: 'video',
        quality: '1080p',
        container: 'mp4',
      },
    });
  };

  const handleEnqueueError = async (errorType: string) => {
    await backend.enqueue({
      kind: 'url',
      url: `https://exemplo.com/video-${errorType}`,
      options: {
        mode: 'video',
        quality: '720p',
        container: 'mp4',
      },
    });
  };

  const handleTriggerUpdate = async () => {
    const update = await backend.checkForUpdate();
    setUpdateAvailable(update);
    setDevPanelOpen(false);
  };

  return (
    <Dialog
      isOpen={isDevPanelOpen}
      onClose={() => setDevPanelOpen(false)}
      title={t.devPanel.title}
    >
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Tarefas de Teste
          </h4>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" size="sm" onClick={handleEnqueueSample}>
              Enfileirar Download Normal (1080p)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                backend.enqueue({
                  kind: 'file',
                  path: 'C:\\Videos\\gravacao.mkv',
                  options: { op: 'convert', container: 'mp4' },
                })
              }
            >
              Enfileirar Conversão MKV → MP4 (Stream Copy Rápido)
            </Button>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Simulação de Falhas Determinísticas
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleEnqueueError('fail-format')}
            >
              Formato Incompatível
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleEnqueueError('fail-login')}
            >
              Login Necessário
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleEnqueueError('fail-net')}
            >
              Falha de Rede
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleEnqueueError('fail-disk')}
            >
              Disco Cheio
            </Button>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Atualizações
          </h4>
          <Button variant="secondary" size="sm" onClick={handleTriggerUpdate} className="w-full">
            {t.devPanel.triggerUpdate}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
