import React from 'react';
import { Dialog } from '../../components/ui/overlays';
import { Button } from '../../components/ui';
import { useAppStore } from '../../stores/appStore';
import { useToast } from '../../components/ui/toast';
import { useI18n } from '../../i18n';
import { Sparkles } from 'lucide-react';

export function UpdateDialog() {
  const { updateAvailable, setUpdateAvailable } = useAppStore();
  const { showToast } = useToast();
  const { t } = useI18n();

  if (!updateAvailable) return null;

  return (
    <Dialog
      isOpen={!!updateAvailable}
      onClose={() => setUpdateAvailable(null)}
      title={t.updateDialog.title}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg text-primary border border-primary/20">
          <Sparkles className="w-5 h-5 shrink-0" />
          <div className="text-xs">
            <span className="font-semibold block">{t.updateDialog.message}</span>
            <span>
              {updateAvailable.currentVersion} → <strong>{updateAvailable.newVersion}</strong>
            </span>
          </div>
        </div>

        {updateAvailable.notes && (
          <p className="text-xs text-muted-foreground">{updateAvailable.notes}</p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setUpdateAvailable(null)}>
            {t.updateDialog.later}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setUpdateAvailable(null);
              showToast('Atualização mockada concluída com sucesso!', 'success');
            }}
          >
            {t.updateDialog.updateNow}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
