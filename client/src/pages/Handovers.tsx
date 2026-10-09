import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { fmtDateTime } from '../lib/format';
import type { Handover } from '../lib/types';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui';

export function HandoversPage() {
  const { t, te, locale } = useI18n();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['handovers'], queryFn: () => api.get<{ handovers: Handover[] }>('/handovers') });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const list = q.data!.handovers;
  return (
    <div>
      <PageHeader title={t('handover.list')} />
      <Card>
        {list.length === 0 ? (
          <EmptyState>{t('handover.none')}</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link to={`/cases/${h.caseId}?tab=handover`} className="font-medium text-brand-700 hover:underline">
                    {h.case?.customer.name}: {h.case?.title}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
                    {h.fromUser?.name ?? '—'} <ArrowRight className="h-3.5 w-3.5" aria-hidden /> {h.toUser?.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {fmtDateTime(h.createdAt, locale)}
                    {h.acceptedAt && ` · ${t('handover.accepted')}: ${fmtDateTime(h.acceptedAt, locale)}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={h.origin === 'REAL_AI' ? 'green' : 'amber'}>{te('origin', h.origin)}</Badge>
                  <Badge tone={h.status === 'ACCEPTED' ? 'green' : h.toUserId === user?.id ? 'red' : 'amber'}>
                    {h.status === 'ACCEPTED' ? t('handover.accepted') : t('handover.pending')}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
