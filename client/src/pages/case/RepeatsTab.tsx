import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPlus, Link2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDate } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Select } from '../../components/ui';
import { FindingCard } from '../../components/FindingCard';
import { RunInfo } from '../../components/RunInfo';
import { useCase, useCaseAction, useRetryAnalysis } from './context';

export function RepeatsTab() {
  const { bundle, caseId } = useCase();
  const { t, te, locale } = useI18n();
  const retry = useRetryAnalysis();
  const [manual, setManual] = useState('');
  const link = useCaseAction((id: string) => api.post(`/findings/${id}/link-repeat`));
  const manualLink = useCaseAction(() => api.post(`/cases/${caseId}/relations`, { relatedCaseId: manual }), { onSuccess: () => setManual('') });
  const rootTask = useCaseAction((relationId: string) => api.post(`/relations/${relationId}/root-cause-task`));
  const confirmed = bundle.relations.filter((r) => r.status === 'CONFIRMED');
  const suggestions = bundle.findings.filter((f) => f.module === 'LOOP' && !f.stale);
  const titleOf = (id: unknown) => bundle.otherCases.find((c) => c.id === id)?.title;
  const hasRootTask = bundle.tasks.some((x) => x.origin === 'ROOT_CAUSE');

  return (
    <div className="space-y-4">
      <Alert tone="info">{t('repeats.sameTopic')}</Alert>
      <Card title={t('repeats.confirmed')}>
        {confirmed.length === 0 ? (
          <EmptyState>{t('repeats.none')}</EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm font-medium text-violet-800">{t('repeats.occurrences', { n: confirmed.length + 1 })}</p>
            <ul className="space-y-2">
              {confirmed.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                  <div className="min-w-0">
                    <Link to={`/cases/${r.other.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                      {r.other.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {fmtDate(r.other.createdAt, locale)} · {te('case.status', r.other.status)}
                    </div>
                    {r.other.closeReason && (
                      <div className="mt-1 text-xs text-slate-700">
                        {t('repeats.previousSolution')}: {r.other.closeReason}
                      </div>
                    )}
                  </div>
                  {!hasRootTask && (
                    <Button size="sm" variant="secondary" icon={<ClipboardPlus className="h-3.5 w-3.5" />} loading={rootTask.isPending} onClick={() => rootTask.mutate(r.id)}>
                      {t('repeats.rootTask')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {bundle.otherCases.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Select value={manual} onChange={(e) => setManual(e.target.value)} aria-label={t('repeats.relatedCase')}>
              <option value="">{t('repeats.relatedCase')}…</option>
              {bundle.otherCases
                .filter((c) => !confirmed.some((r) => r.other.id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({fmtDate(c.createdAt, locale)})
                  </option>
                ))}
            </Select>
            <Button variant="secondary" icon={<Link2 className="h-4 w-4" />} disabled={!manual} loading={manualLink.isPending} onClick={() => manualLink.mutate()}>
              {t('repeats.manual')}
            </Button>
          </div>
        )}
      </Card>

      <Card title={t('repeats.suggestions')}>
        <div className="space-y-3">
          <RunInfo run={bundle.latestRunByModule.LOOP} onRetry={() => retry.mutate()} retrying={retry.isPending} />
          {suggestions.length === 0 ? (
            <EmptyState>—</EmptyState>
          ) : (
            suggestions.map((f) => {
              const linked = confirmed.some((r) => r.other.id === f.data.relatedCaseId);
              return (
                <FindingCard
                  key={f.id}
                  finding={f}
                  hideReview={linked}
                  actions={
                    !linked &&
                    f.reviewStatus !== 'REJECTED' && (
                      <Button size="sm" icon={<Link2 className="h-3.5 w-3.5" />} loading={link.isPending} onClick={() => link.mutate(f.id)}>
                        {t('finding.linkRepeat')}
                      </Button>
                    )
                  }
                >
                  <dl className="space-y-1 text-xs">
                    <div>
                      <dt className="inline text-slate-500">{t('repeats.relatedCase')}: </dt>
                      <dd className="inline">
                        <Link to={`/cases/${String(f.data.relatedCaseId)}`} className="text-brand-700 hover:underline">
                          {titleOf(f.data.relatedCaseId) ?? '—'}
                        </Link>
                      </dd>
                    </div>
                    {typeof f.data.certainty === 'string' && (
                      <div>
                        <Badge tone={f.data.certainty === 'LIKELY' ? 'violet' : 'slate'}>{te('finding.certainty', f.data.certainty)}</Badge>
                      </div>
                    )}
                    {typeof f.data.previousSolution === 'string' && (
                      <div>
                        <dt className="inline text-slate-500">{t('repeats.previousSolution')}: </dt>
                        <dd className="inline text-slate-800">{f.data.previousSolution}</dd>
                      </div>
                    )}
                    {typeof f.data.rootCauseSuggestion === 'string' && (
                      <div>
                        <dt className="inline text-slate-500">{t('repeats.rootCause')}: </dt>
                        <dd className="inline text-slate-800">{f.data.rootCauseSuggestion}</dd>
                      </div>
                    )}
                  </dl>
                </FindingCard>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
