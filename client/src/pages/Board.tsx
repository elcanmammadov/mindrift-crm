import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { fmtDate, isOverdue } from '../lib/format';
import type { Blocker, Task } from '../lib/types';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Select, Spinner, errorMessage, useToast } from '../components/ui';
import { blockerTone } from './case/BlockersTab';

const BSTATUS = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED'];
const TSTATUS = ['TODO', 'IN_PROGRESS', 'DONE'];

export function BoardPage() {
  const { t, te, locale } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [mine, setMine] = useState(false);
  const q = useQuery({ queryKey: ['board'], queryFn: () => api.get<{ blockers: Blocker[]; tasks: Task[] }>('/board') });
  const onSettled = {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e: unknown) => toast(errorMessage(e, t), 'danger'),
  };
  const patchBlocker = useMutation({ mutationFn: (v: { id: string; status: string }) => api.patch(`/blockers/${v.id}`, { status: v.status }), ...onSettled });
  const patchTask = useMutation({ mutationFn: (v: { id: string; status: string }) => api.patch(`/tasks/${v.id}`, { status: v.status }), ...onSettled });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const blockers = q.data!.blockers.filter((b) => !mine || b.ownerId === user?.id);
  const tasks = q.data!.tasks.filter((x) => !mine || x.assigneeId === user?.id);

  return (
    <div>
      <PageHeader
        title={t('board.title')}
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            {t('board.mine')}
          </label>
        }
      />
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">{t('board.blockers')}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {BSTATUS.map((s) => {
              const col = blockers.filter((b) => b.status === s);
              return (
                <Card key={s} title={<span className="flex items-center gap-2">{te('blockers.status', s)} <Badge tone={blockerTone(s)}>{col.length}</Badge></span>}>
                  {col.length === 0 ? (
                    <EmptyState>—</EmptyState>
                  ) : (
                    <ul className="space-y-2">
                      {col.map((b) => (
                        <li key={b.id} className="rounded-lg border border-slate-200 p-2.5">
                          <Badge tone="slate">{te('blockers.categories', b.category)}</Badge>
                          <div className="mt-1 text-sm font-medium text-slate-900">{b.title}</div>
                          {b.case && (
                            <Link to={`/cases/${b.case.id}?tab=blockers`} className="text-xs text-brand-700 hover:underline">
                              {b.case.customer.name}: {b.case.title}
                            </Link>
                          )}
                          <div className="mt-1 text-xs text-slate-500">
                            {b.owner?.name ?? t('common.unassigned')}
                            {b.dueDate && (
                              <span className={isOverdue(b.dueDate, b.status === 'RESOLVED') ? 'font-medium text-red-700' : ''}>
                                {' '}
                                · {fmtDate(b.dueDate, locale)}
                                {isOverdue(b.dueDate, b.status === 'RESOLVED') && ` (${t('common.overdue')})`}
                              </span>
                            )}
                          </div>
                          <Select className="mt-2 py-1 text-xs" value={b.status} onChange={(e) => patchBlocker.mutate({ id: b.id, status: e.target.value })} aria-label={t('common.status')}>
                            {BSTATUS.map((x) => (
                              <option key={x} value={x}>
                                {te('blockers.status', x)}
                              </option>
                            ))}
                          </Select>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">{t('board.tasks')}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {TSTATUS.map((s) => {
              const col = tasks.filter((x) => x.status === s);
              return (
                <Card key={s} title={<span className="flex items-center gap-2">{te('tasks.status', s)} <Badge>{col.length}</Badge></span>}>
                  {col.length === 0 ? (
                    <EmptyState>—</EmptyState>
                  ) : (
                    <ul className="space-y-2">
                      {col.map((task) => {
                        const overdue = isOverdue(task.dueDate, task.status === 'DONE');
                        return (
                          <li key={task.id} className="rounded-lg border border-slate-200 p-2.5">
                            <div className="text-sm font-medium text-slate-900">{task.title}</div>
                            {task.case && (
                              <Link to={`/cases/${task.case.id}?tab=blockers`} className="text-xs text-brand-700 hover:underline">
                                {task.case.customer?.name}: {task.case.title}
                              </Link>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                              {task.assignee?.name ?? t('common.unassigned')}
                              {task.dueDate && <Badge tone={overdue ? 'red' : 'slate'}>{fmtDate(task.dueDate, locale)}{overdue && ` · ${t('common.overdue')}`}</Badge>}
                              {task.origin !== 'MANUAL' && <Badge tone="violet">{te('tasks.origin', task.origin)}</Badge>}
                            </div>
                            <Select className="mt-2 py-1 text-xs" value={task.status} onChange={(e) => patchTask.mutate({ id: task.id, status: e.target.value })} aria-label={t('common.status')}>
                              {TSTATUS.map((x) => (
                                <option key={x} value={x}>
                                  {te('tasks.status', x)}
                                </option>
                              ))}
                            </Select>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
