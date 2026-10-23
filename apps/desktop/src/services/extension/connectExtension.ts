import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type ExtensionAction = { type: 'queue' } | { type: 'analyze'; url: string };

/** Subscribe before draining so actions received while the UI opens are retained. */
export function connectExtension(
  onAction: (action: ExtensionAction) => void,
  onError: () => void,
): () => void {
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  let draining = false;
  let requested = false;

  const consume = async () => {
    requested = true;
    if (draining || disposed) return;
    draining = true;
    try {
      do {
        requested = false;
        while (!disposed) {
          const action = await invoke<ExtensionAction | null>('take_extension_action');
          if (!action) break;
          // Taking an action removes it from the backend. Always deliver an in-flight
          // result, including during React StrictMode's effect cleanup, to avoid loss.
          onAction(action);
        }
      } while (requested && !disposed);
    } catch {
      if (!disposed) onError();
    } finally {
      draining = false;
    }
  };

  void listen('extension:action', () => { void consume(); }).then(fn => {
    if (disposed) fn();
    else { unsubscribe = fn; void consume(); }
  }).catch(() => { if (!disposed) onError(); });

  return () => { disposed = true; unsubscribe?.(); };
}
