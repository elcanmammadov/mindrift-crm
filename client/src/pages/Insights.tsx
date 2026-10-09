import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { findingText, useI18n } from '../lib/i18n';
import type { CaseRow, Customer, ExitConversation, Finding } from '../lib/types';
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui';
import { ExitConversationView } from '../components/ExitConversationView';

interface InsightsData {
  lost: (CaseRow & { customer: { id: string; name: string }; lossAnalysis: { agentReason: string; agentNote: string | null } | null; findings: Finding[] })[];
  reasonCounts: Record<string, number>;
  churned: (Customer & { exitConversations: ExitConversation[]; cases: { id: string; title: string }[] })[];
}

export function InsightsPage() {
  const { t, te, locale } = useI18n();
  const q = useQuery({ queryKey: ['insights'], queryFn: () => api.get<InsightsData>('/insights') });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const max = Math.max(1, ...Object.values(d.reasonCounts));
  return (
    <div className="space-y-6">
      <PageHeader title={t('insights.title')} />
      <Alert tone="info">{t('outcome.correlation')}</Alert>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{t('insights.lost')}</h2>
        {Object.keys(d.reasonCounts).length > 0 && (
          <Card title={t('insights.reasonCounts')}>
            <ul className="space-y-2">
              {Object.entries(d.reasonCounts).map(([r, n]) => (
                <li key={r} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 text-slate-700">{te('outcome.reasons', r)}</span>
                  <span className="h-2.5 rounded-full bg-brand-500" style={{ width: `${(n / max) * 60}%` }} aria-hidden />
                  <span className="tabular-nums text-slate-600">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {d.lost.length === 0 ? (
          <EmptyState>{t('insights.noLost')}</EmptyState>
        ) : (
          d.lost.map((c) => {
            const by = (k: string) => c.findings.filter((f) => f.kind === k);
            return (
              <Card
                key={c.id}
                title={
                  <Link to={`/cases/${c.id}?tab=outcome`} className="text-brand-700 hover:underline">
                    {c.customer.name}: {c.title}
                  </Link>
                }
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('outcome.agentReason')}</h3>
                    <p className="mt-1 text-sm">
                      <Badge>{te('outcome.reasons', c.lossAnalysis?.agentReason)}</Badge> {c.lossAnalysis?.agentNote}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('outcome.customerStated')}</h3>
                    <ul className="mt-1 space-y-1 text-sm">
                      {by('CUSTOMER_STATED_REASON').map((f) => (
                        <li key={f.id}>{f.evidence.find((e) => e.verified) ? `“${f.evidence.find((e) => e.verified)!.quote}”` : findingText(f, locale).title}</li>
                      ))}
                      {by('CUSTOMER_STATED_REASON').length === 0 && <li className="text-slate-400">—</li>}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('outcome.factors')}</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                      {by('POSSIBLE_FACTOR').map((f) => (
                        <li key={f.id}>{findingText(f, locale).title}</li>
                      ))}
                      {by('POSSIBLE_FACTOR').length === 0 && <li className="list-none text-slate-400">—</li>}
                    </ul>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{t('insights.churn')}</h2>
        {d.churned.every((c) => c.exitConversations.length === 0) && <EmptyState>{t('insights.noChurn')}</EmptyState>}
        {d.churned
          .filter((c) => c.exitConversations.length > 0)
          .map((c) => (
            <Card
              key={c.id}
              title={
                <span className="flex items-center gap-2">
                  <Link to={`/customers/${c.id}`} className="text-brand-700 hover:underline">
                    {c.name}
                  </Link>
                  <Badge tone={c.status === 'CHURNED' ? 'red' : 'green'}>{te('customers.status', c.status)}</Badge>
                </span>
              }
            >
              <div className="space-y-6">
                {c.exitConversations.map((e) => (
                  <ExitConversationView key={e.id} conv={e} caseTitles={Object.fromEntries(c.cases.map((k) => [k.id, k.title]))} />
                ))}
              </div>
            </Card>
          ))}
      </section>
    </div>
  );
}
