import React from 'react';
import { Monitor, ExternalLink } from 'lucide-react';
import type { BackendMode } from '../../services/backend/createBackend';

export function RuntimeNotice({ mode }: { mode: BackendMode }) {
  if (mode === 'native') return null;
  return (
    <aside aria-label="Modo de demonstração" className="max-w-4xl mx-auto mb-6 rounded-xl border border-primary/40 bg-primary/5 p-4 flex items-start gap-3">
      <Monitor className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
      <div className="space-y-1.5 text-xs">
        <p className="font-semibold text-primary">Modo de demonstração — nenhum arquivo será baixado</p>
        <p className="text-muted-foreground">Você está vendo uma prévia da interface. As informações dos links e as tarefas são simuladas. Para baixar de verdade, abra a janela do aplicativo CrowDash no seu computador.</p>
        <a href="https://github.com/jorgemichaelj/Crowdash/blob/main/docs/WINDOWS.md" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">Como abrir o aplicativo desktop <ExternalLink className="w-3 h-3" aria-hidden="true" /></a>
      </div>
    </aside>
  );
}
