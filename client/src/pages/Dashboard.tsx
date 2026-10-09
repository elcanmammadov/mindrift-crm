import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Briefcase, CircleSlash, Clock, Hourglass, Repeat, ShieldAlert, UserMinus } from 'lucide-react';
import { api } from '../lib/api';
import { findingText, useI18n } from '../lib/i18n';
import { fmtDate, isOverdue } from '../lib/format';
import type { Finding, Task } from '../lib/types';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner, Stat } from '../components/ui';

interface DashboardData {
  metrics: {
    openCases: number;
    openContradictions: number;
    unresolvedBlockers: number;
    overdueTasks: number;
    pendingHandovers: number;
    awaitingConfirmation: number;
    repeatProblems: { confirmed: number; suggested: number };
    lostSales: number;
    churnedCustomers: number;
  };
  outdatedAnalyses: { id: string; title: string; customer: { name: string } }[];
  myTasks: (Task & { case: { id: string; title: string } | null })[];
  reviewQueue: (Finding & { case: { id: string; title: string } })[];
}

export function DashboardPage() {
  const { t, te, locale } = useI18n();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/dashboard') });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const m = d.metrics;
  return (
    <div>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label={t('dashboard.openCases')} value={m.openCases} to="/customers" tone="brand" icon={<Briefcase className="h-5 w-5" />} />
        <Stat label={t('dashboard.openContradictions')} value={m.openContradictions} tone="red" icon={<AlertTriangle className="h-5 w-5" />} />
        <Stat label={t('dashboard.unresolvedBlockers')} value={m.unresolvedBlockers} tone="amber" to="/board" icon={<ShieldAlert className="h-5 w-5" />} />
        <Stat label={t('dashboard.overdueTasks')} value={m.overdueTasks} tone="red" to="/board" icon={<Clock className="h-5 w-5" />} />
        <Stat label={t('dashboard.pendingHandovers')} value={m.pendingHandovers} tone="violet" to="/handovers" icon={<ArrowLeftRight className="h-5 w-5" />} />
        <Stat label={t('dashboard.awaitingConfirmation')} value={m.awaitingConfirmation} tone="blue" icon={<Hourglass className="h-5 w-5" />} />
        <Stat
          label={t('dashboard.repeatProblems')}
          value={m.repeatProblems.confirmed + m.repeatProblems.suggested}
          hint={t('dashboard.repeatDetail', { confirmed: m.repeatProblems.confirmed, suggested: m.repeatProblems.suggested })}
          tone="violet"
          icon={<Repeat className="h-5 w-5" />}
        />
        <Stat label={t('dashboard.lostSales')} value={m.lostSales} to="/insights" tone="red" icon={<CircleSlash className="h-5 w-5" />} />
        <Stat label={t('dashboard.churned')} value={m.churnedCustomers} to="/insights" tone="green" icon={<UserMinus className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title={t('dashboard.myTasks')}>
          {d.myTasks.length === 0 ? (
            <EmptyState>{t('dashboard.noTasks')}</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.myTasks.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">{task.title}</div>
                    {task.case && (
                      <Link to={`/cases/${task.case.id}`} className="text-xs text-brand-700 hover:underline">
                        {task.case.title}
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={task.status === 'IN_PROGRESS' ? 'blue' : 'slate'}>{te('tasks.status', task.status)}</Badge>
                    {task.dueDate && (
                      <Badge tone={isOverdue(task.dueDate) ? 'red' : 'slate'}>
                        {fmtDate(task.dueDate, locale)}
                        {isOverdue(task.dueDate) && ` · ${t('common.overdue')}`}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('dashboard.reviewQueue')}>
          {d.reviewQueue.length === 0 ? (
            <EmptyState>{t('dashboard.noReview')}</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.reviewQueue.map((f) => (
                <li key={f.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="slate">{te('finding.kinds', f.kind)}</Badge>
                    <Badge tone={f.origin === 'REAL_AI' ? 'green' : 'amber'}>{te('origin', f.origin)}</Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800">{findingText({ ...f, suggestedAction: f.suggestedAction }, locale).title}</div>
                  <Link to={`/cases/${f.case.id}`} className="text-xs text-brand-700 hover:underline">
                    {f.case.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {d.outdatedAnalyses.length > 0 && (
          <Card title={t('dashboard.outdated')} className="lg:col-span-2">
            <ul className="flex flex-wrap gap-2">
              {d.outdatedAnalyses.map((c) => (
                <li key={c.id}>
                  <Link to={`/cases/${c.id}`} className="inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100">
                    {c.customer.name}: {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
