import React, { useState } from 'react';
import type { Job } from '@crowdash/shared';
import { Card, Badge, Progress, Button, IconButton } from '../../components/ui';
import { Drawer } from '../../components/ui/overlays';
import { useBackend } from '../../services/backend/BackendProvider';
import { useI18n } from '../../i18n';
import {
  Download,
  FileCode,
  Scissors,
  Minimize2,
  Music,
  FolderOpen,
  RotateCw,
  XCircle,
  Trash2,
  Info,
  Globe,
} from 'lucide-react';

export function JobCard({ job }: { job: Job }) {
  const backend = useBackend();
  const { t } = useI18n();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const getIcon = () => {
    switch (job.type) {
      case 'download':
        return <Download className="w-5 h-5 text-sky-400" />;
      case 'batchDownload':
        return <Download className="w-5 h-5 text-indigo-400" />;
      case 'trim':
        return <Scissors className="w-5 h-5 text-amber-400" />;
      case 'compress':
        return <Minimize2 className="w-5 h-5 text-emerald-400" />;
      case 'extractAudio':
        return <Music className="w-5 h-5 text-purple-400" />;
      default:
        return <FileCode className="w-5 h-5 text-blue-400" />;
    }
  };

  const getStatusBadge = () => {
    switch (job.status) {
      case 'pending':
        return <Badge variant="default">{t.queue.status.pending}</Badge>;
      case 'running':
        return <Badge variant="info">{t.queue.status.running}</Badge>;
      case 'completed':
        return <Badge variant="success">{t.queue.status.completed}</Badge>;
      case 'failed':
        return <Badge variant="danger">{t.queue.status.failed}</Badge>;
      case 'cancelled':
        return <Badge variant="warning">{t.queue.status.cancelled}</Badge>;
    }
  };

  const title =
    job.input.kind === 'batch'
      ? `${job.input.title}${job.input.itemCount ? ` (${job.input.itemCount} itens)` : ''}`
      : job.input.kind === 'url'
      ? job.input.title || job.input.url
      : job.input.options.op === 'convert'
      ? `${job.input.name || job.input.path.split('\\').pop()} ➔ .${job.input.options.container.toUpperCase()}`
      : job.input.name || job.input.path.split('\\').pop();

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-muted rounded-md shrink-0">{getIcon()}</div>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-foreground truncate max-w-md">{title}</h4>
              <div className="flex items-center gap-2 mt-1">
                {getStatusBadge()}
                {job.origin === 'extension' && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                    <Globe className="w-3 h-3" />
                    {t.queue.fromExtension}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {job.status === 'completed' && job.outputPath && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => backend.revealInFolder(job.outputPath!)}
              >
                <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                {t.queue.actions.openFolder}
              </Button>
            )}

            {(job.status === 'failed' || job.status === 'cancelled') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => backend.retry(job.id)}
              >
                <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                {t.queue.actions.retry}
              </Button>
            )}

            {(job.status === 'running' || job.status === 'pending') && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => backend.cancel(job.id)}
              >
                <XCircle className="w-3.5 h-3.5 mr-1.5" />
                {t.queue.actions.cancel}
              </Button>
            )}

            <IconButton
              size="sm"
              variant="ghost"
              title={t.queue.actions.viewDetails}
              onClick={() => setDetailsOpen(true)}
            >
              <Info className="w-4 h-4 text-muted-foreground" />
            </IconButton>

            {job.status !== 'running' && (
              <IconButton
                size="sm"
                variant="danger"
                title={t.queue.actions.remove}
                onClick={() => backend.remove(job.id)}
              >
                <Trash2 className="w-4 h-4" />
              </IconButton>
            )}
          </div>
        </div>

        {/* Barra de Progresso durante execução */}
        {job.status === 'running' && (
          <div className="space-y-1">
            <Progress value={job.progress} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{job.progress}%</span>
              <span>
                {job.speedBytesPerSec
                  ? `${(job.speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
                  : ''}{' '}
                {job.etaSeconds !== undefined ? `• ~${job.etaSeconds}s restantes` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Mensagem de Erro Amigável */}
        {job.status === 'failed' && job.error && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-md text-xs text-danger flex flex-col gap-1">
            <span className="font-semibold">{job.error.title}</span>
            <span>{job.error.message}</span>
          </div>
        )}
      </Card>

      {/* Drawer de Detalhes Técnicos */}
      <Drawer
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={t.queue.detailsDrawer.title}
      >
        <div className="space-y-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
              {t.queue.detailsDrawer.jobId}
            </span>
            <code className="text-xs bg-muted px-2 py-1 rounded block">{job.id}</code>
          </div>

          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
              {t.queue.detailsDrawer.encoder}
            </span>
            <span className="text-foreground font-mono">{job.encoder || 'cpu'}</span>
          </div>

          {job.outputPath && (
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                {t.queue.detailsDrawer.output}
              </span>
              <p className="text-xs text-muted-foreground break-all">{job.outputPath}</p>
            </div>
          )}

          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
              {t.queue.detailsDrawer.logs}
            </span>
            <div className="bg-black/40 text-emerald-400 p-3 rounded font-mono text-xs max-h-64 overflow-y-auto space-y-1 border border-border">
              {job.logs.length === 0 ? (
                <span className="text-muted-foreground">Nenhum log registrado.</span>
              ) : (
                job.logs.map((log, index) => <div key={index}>{log}</div>)
              )}
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
}
