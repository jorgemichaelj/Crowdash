import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { JobCard } from './JobCard';
import { Button } from '../../components/ui';
import { EmptyState } from '../../components/ui/feedback';
import { useBackend } from '../../services/backend/BackendProvider';
import { useI18n } from '../../i18n';
import { ListOrdered, CheckCheck } from 'lucide-react';

export function QueueView() {
  const { jobs } = useAppStore();
  const backend = useBackend();
  const { t } = useI18n();

  const runningCount = jobs.filter((j) => j.status === 'running' || j.status === 'pending').length;

  const handleClearCompleted = async () => {
    const toRemove = jobs.filter((j) => j.status === 'completed' || j.status === 'cancelled');
    for (const job of toRemove) {
      await backend.remove(job.id);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t.queue.title}</h2>
          <p className="text-xs text-muted-foreground">
            {t.queue.activeCount.replace('{count}', runningCount.toString())}
          </p>
        </div>

        {jobs.some((j) => j.status === 'completed' || j.status === 'cancelled') && (
          <Button variant="outline" size="sm" onClick={handleClearCompleted}>
            <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
            {t.queue.clearCompleted}
          </Button>
        )}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title={t.queue.emptyTitle}
          subtitle={t.queue.emptySubtitle}
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
