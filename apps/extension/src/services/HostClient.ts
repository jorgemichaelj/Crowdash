import { handoffRequestSchema, nativeResponseSchema, NATIVE_HOST_NAME, MAX_NATIVE_MESSAGE_BYTES } from '@crowdash/shared';
import type { HandoffRequest, HostResponse, HostStatus, NativeRequest, NativeResponse } from '@crowdash/shared';

export interface HostClient {
  getStatus(): Promise<HostStatus>;
  sendHandoff(request: HandoffRequest): Promise<HostResponse>;
}

/** Chrome starts the registered CrowDash executable and exchanges framed JSON. */
export class NativeHostClient implements HostClient {
  private send(request: NativeRequest): Promise<NativeResponse> {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendNativeMessage) {
        reject(new Error('Abra este painel pela extensão do Chrome ou Edge.')); return;
      }
      if (new TextEncoder().encode(JSON.stringify(request)).length > MAX_NATIVE_MESSAGE_BYTES) {
        reject(new Error('A mensagem excede o tamanho permitido.')); return;
      }
      const timer = setTimeout(() => reject(new Error('O CrowDash não respondeu. Abra o aplicativo e tente novamente.')), request.type === 'ping' ? 3000 : 20000);
      try {
        chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, request, response => {
          clearTimeout(timer);
          const error = chrome.runtime.lastError;
          if (error) { reject(new Error(error.message || 'Falha na conexão com o CrowDash.')); return; }
          const parsed = nativeResponseSchema.safeParse(response);
          if (!parsed.success || parsed.data.id !== request.id) { reject(new Error('Resposta inválida do CrowDash.')); return; }
          resolve(parsed.data as NativeResponse);
        });
      } catch (error) { clearTimeout(timer); reject(error); }
    });
  }

  async getStatus(): Promise<HostStatus> {
    try {
      const response = await this.send({ v: 1, id: crypto.randomUUID(), type: 'ping' });
      return response.ok && 'status' in response && response.status === 'connected' ? 'connected' : 'disconnected';
    } catch (error) {
      return /host.*not found|host.*forbidden|not installed/i.test(String(error)) ? 'not_installed' : 'disconnected';
    }
  }

  async sendHandoff(request: HandoffRequest): Promise<HostResponse> {
    try {
      handoffRequestSchema.parse(request);
      const response = await this.send(request);
      if (response.ok && 'status' in response) throw new Error('Resposta inesperada do aplicativo.');
      return response as HostResponse;
    } catch (error) {
      return { v: 1, id: request.id, ok: false, error: {
        code: 'NETWORK', title: 'Conexão com o CrowDash',
        message: /host.*not found|host.*forbidden/i.test(String(error))
          ? 'Abra o CrowDash e conecte a extensão em Configurações > Navegador.'
          : error instanceof Error ? error.message : 'Não foi possível enviar a mídia ao aplicativo.',
        retryable: true,
      } };
    }
  }
}
