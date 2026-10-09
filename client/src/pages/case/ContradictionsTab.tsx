import { CheckCheck, ClipboardPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import type { Finding } from '../../lib/types';
import { Alert, Badge, Button, EmptyState } from '../../components/ui';
import { FindingCard } from '../../components/FindingCard';
import { RunInfo } from '../../components/RunInfo';
import { useCase, useCaseAction, useRetryAnalysis } from './context';

function ContradictionCard({ f }: { f: Finding }) {
  const { t, te } = useI18n();
  const { bundle } = useCase();
  const resolve = useCaseAction(() => api.post(`/findings/${f.id}/review`, { status: 'RESOLVED' }));
  const toTask = useCaseAction(() => api.post(`/findings/${f.id}/to-task`));
  const hasTask = bundle.tasks.some((x) => x.findingId === f.id);
  const impact = f.data.impact as string | undefined;
  return (
    <FindingCard
      finding={f}
      actions={
        <>
          {f.reviewStatus === 'CONFIRMED' && (
            <Button size="sm" variant="success" icon={<CheckCheck className="h-3.5 w-3.5" />} loading={resolve.isPending} onClick={() => resolve.mutate()}>
              {t('finding.resolve')}
            </Button>
          )}
          {!hasTask && f.reviewStatus !== 'REJECTED' && (
            <Button size="sm" variant="ghost" icon={<ClipboardPlus className="h-3.5 w-3.5" />} loading={toTask.isPending} onClick={() => toTask.mutate()}>
              {t('finding.toTask')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-wrap gap-2 text-xs">
        {typeof f.data.topic === 'string' && (
          <Badge tone="slate">
            {t('finding.topic')}: {te('finding.topics', f.data.topic)}
          </Badge>
        )}
      </div>
      {impact && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">{t('finding.impact')}:</span> {impact}
        </p>
      )}
    </FindingCard>
  );
}

export function ContradictionsTab() {
  const { bundle } = useCase();
  const { t } = useI18n();
  const retry = useRetryAnalysis();
  const all = bundle.findings.filter((f) => f.module === 'ONEVOICE');
  const current = all.filter((f) => !f.stale);
  return (
    <div className="space-y-4">
      <RunInfo run={bundle.latestRunByModule.ONEVOICE} onRetry={() => retry.mutate()} retrying={retry.isPending} />
      <Alert tone="info">{t('contradictions.aiNote')}</Alert>
      {current.length === 0 ? (
        <EmptyState>{t('contradictions.none')}</EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {current.map((f) => (
            <ContradictionCard key={f.id} f={f} />
          ))}
        </div>
      )}
      {all.some((f) => f.stale) && (
        <details className="rounded-lg border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm text-slate-600">
            {t('finding.stale')} ({all.filter((f) => f.stale).length})
          </summary>
          <div className="mt-3 space-y-3">
            {all.filter((f) => f.stale).map((f) => (
              <FindingCard key={f.id} finding={f} hideReview />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
