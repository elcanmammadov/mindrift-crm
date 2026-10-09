import { ListPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import type { Finding } from '../../lib/types';
import { Button, Card, EmptyState } from '../../components/ui';
import { FindingCard } from '../../components/FindingCard';
import { RunInfo } from '../../components/RunInfo';
import { useCase, useCaseAction, useRetryAnalysis } from './context';

const NEED_KINDS = ['EXPLICIT_REQUEST', 'CORE_PROBLEM', 'SUCCESS_CRITERION', 'CONSTRAINT'];

function NeedCard({ f }: { f: Finding }) {
  const { t, te } = useI18n();
  const { bundle } = useCase();
  const toReq = useCaseAction(() => api.post(`/findings/${f.id}/to-requirement`));
  const toTask = useCaseAction(() => api.post(`/findings/${f.id}/to-task`));
  const already = bundle.requirements.some((r) => r.text === f.title);
  const constraintType = f.data.constraintType as string | undefined;
  return (
    <FindingCard
      finding={f}
      actions={
        <>
          {(NEED_KINDS.includes(f.kind) || f.kind === 'QUESTION_TO_ASK') && !already && f.reviewStatus !== 'REJECTED' && (
            <Button size="sm" variant="secondary" icon={<ListPlus className="h-3.5 w-3.5" />} loading={toReq.isPending} onClick={() => toReq.mutate()}>
              {t('finding.toRequirement')}
            </Button>
          )}
          {(f.kind === 'GAP' || f.kind === 'QUESTION_TO_ASK') && (
            <Button size="sm" variant="ghost" loading={toTask.isPending} onClick={() => toTask.mutate()}>
              {t('finding.toTask')}
            </Button>
          )}
        </>
      }
    >
      {constraintType && <span className="text-xs text-slate-500">{te('finding.kinds', 'CONSTRAINT')}: {constraintType}</span>}
    </FindingCard>
  );
}

function Section({ title, items, empty }: { title?: string; items: Finding[]; empty?: string }) {
  return (
    <section>
      {title && <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>}
      {items.length === 0 ? <EmptyState>{empty ?? '—'}</EmptyState> : <div className="space-y-3">{items.map((f) => <NeedCard key={f.id} f={f} />)}</div>}
    </section>
  );
}

export function NeedTab() {
  const { bundle } = useCase();
  const { t, te } = useI18n();
  const retry = useRetryAnalysis();
  const all = bundle.findings.filter((f) => f.module === 'BRIDGE');
  const current = all.filter((f) => !f.stale);
  const needs = current.filter((f) => NEED_KINDS.includes(f.kind));
  const stated = needs.filter((f) => f.epistemic === 'OBSERVED');
  const inferred = needs.filter((f) => f.epistemic === 'INFERRED');
  const run = bundle.latestRunByModule.BRIDGE;
  const missing = (run?.notes ?? []).filter((n) => n.code === 'MISSING_INFO');
  const byKind = (k: string) => current.filter((f) => f.kind === k);

  return (
    <div className="space-y-4">
      <RunInfo run={run} onRetry={() => retry.mutate()} retrying={retry.isPending} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('need.stated')}>
          <Section items={stated} />
        </Card>
        <Card title={t('need.inferred')}>
          <Section items={inferred} />
        </Card>
      </div>
      <Card title={t('need.fit')}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Section title={te('finding.kinds', 'MATCH')} items={byKind('MATCH')} />
          <Section title={te('finding.kinds', 'GAP')} items={byKind('GAP')} />
          <Section title={te('finding.kinds', 'NOT_NEEDED')} items={byKind('NOT_NEEDED')} />
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('need.questions')}>
          <Section items={byKind('QUESTION_TO_ASK')} />
        </Card>
        <Card title={t('need.missing')}>
          {missing.length === 0 ? (
            <EmptyState>—</EmptyState>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {missing.map((m, i) => (
                <li key={i}>{m.text}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {all.some((f) => f.stale) && (
        <details className="rounded-lg border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm text-slate-600">{t('finding.stale')} ({all.filter((f) => f.stale).length})</summary>
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
