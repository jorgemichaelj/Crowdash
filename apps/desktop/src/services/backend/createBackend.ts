import type { BackendClient } from '@crowdash/shared';
import { TauriBackendClient } from './TauriBackendClient';
import { MockBackendClient } from '../mock/MockBackendClient';

export type BackendMode = 'native' | 'demo';

export interface BackendConnection {
  client: BackendClient;
  mode: BackendMode;
}

export function createBackend(): BackendConnection {
  const native = typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || Reflect.get(window, 'isTauri') === true);
  // A native runtime must report connection errors rather than silently simulating success.
  return native
    ? { client: new TauriBackendClient(), mode: 'native' }
    : { client: new MockBackendClient(), mode: 'demo' };
}
