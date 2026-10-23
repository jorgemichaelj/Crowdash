import { useEffect } from 'react';
import { connectExtension } from './connectExtension';
import { useAppStore } from '../../stores/appStore';
import { useToast } from '../../components/ui/toast';

export function ExtensionConnection() {
  const { showToast } = useToast();
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    return connectExtension(action => {
      const store = useAppStore.getState();
      if (action.type === 'queue') { store.setCurrentTab('queue'); showToast('Download recebido da extensão.', 'success'); }
      else { store.setPendingDownloadUrl(action.url); store.setCurrentTab('home'); }
    }, () => showToast('Não foi possível receber o envio da extensão.', 'error'));
  }, []);
  return null;
}
