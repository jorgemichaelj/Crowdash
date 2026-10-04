import type { HandoffRequest, HostResponse, HostStatus } from '@crowdash/shared';

export interface HostClient {
  getStatus(): Promise<HostStatus>;
  sendHandoff(request: HandoffRequest): Promise<HostResponse>;
}

export class MockHostClient implements HostClient {
  private status: HostStatus = 'connected';

  setStatus(status: HostStatus) {
    this.status = status;
  }

  async getStatus(): Promise<HostStatus> {
    return this.status;
  }

  async sendHandoff(request: HandoffRequest): Promise<HostResponse> {
    await new Promise((r) => setTimeout(r, 600));

    if (this.status !== 'connected') {
      return {
        v: 1,
        id: request.id,
        ok: false,
        error: {
          code: 'NETWORK',
          title: 'Host Desconectado',
          message: 'O aplicativo desktop Crowdash não está em execução ou não foi encontrado.',
          retryable: true,
        },
      };
    }

    return {
      v: 1,
      id: request.id,
      ok: true,
      jobId: 'job_ext_' + Math.random().toString(36).substring(2, 7),
    };
  }
}
