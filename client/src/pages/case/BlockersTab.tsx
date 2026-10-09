import { useState, type FormEvent } from 'react';
import { CheckCheck, Pencil, Plus, ShieldPlus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDate, isOverdue } from '../../lib/format';
import type { Blocker, Task } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea, errorMessage } from '../../components/ui';
import { FindingCard } from '../../components/FindingCard';
import { RunInfo } from '../../components/RunInfo';
import { useUsers } from '../CustomerDetail';
import { useCase, useCaseAction, useRetryAnalysis } from './context';

const CATEGORIES = ['BUDGET', 'TECH_FIT', 'DATA_MIGRATION', 'SECURITY', 'INTERNAL_APPROVAL', 'UNCLEAR_TERMS', 'UNANSWERED_QUESTION', 'OTHER'];
const BSTATUS = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED'];
const TSTATUS = ['TODO', 'IN_PROGRESS', 'DONE'];
export const blockerTone = (s: string) => (({ OPEN: 'red', IN_PROGRESS: 'blue', WAITING_CUSTOMER: 'amber', RESOLVED: 'green' }) as const)[s as 'OPEN'] ?? 'slate';
const dateInput = (d: string | null) => (d ? d.slice(0, 10) : '');

function BlockerForm({ existing, onDone }: { existing?: Blocker; onDone: () => void }) {
  const { caseId } = useCase();
  const { t, te } = useI18n();
  const users = useUsers();
  const [f, setF] = useState({
    title: existing?.title ?? '',
    category: existing?.category ?? 'OTHER',
    ownerId: existing?.ownerId ?? '',
    nextStep: existing?.nextStep ?? '',
    dueDate: dateInput(existing?.dueDate ?? null),
    resolutionCriteria: existing?.resolutionCriteria ?? '',
    status: existing?.status ?? 'OPEN',
    description: existing?.description ?? '',
  });
  const [touched, setTouched] = useState(false);
  const titleErr = touched && f.title.trim().length < 3 ? t('common.required') : undefined;
  const save = useCaseAction(
    () => {
      const body = { ...f, ownerId: f.ownerId || null, dueDate: f.dueDate || null };
      return existing ? api.patch(`/blockers/${existing.id}`, body) : api.post(`/cases/${caseId}/blockers`, body);
    },
    { onSuccess: onDone },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (f.title.trim().length >= 3) save.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {save.error && <Alert tone="danger">{errorMessage(save.error, t)}</Alert>}
      <Field label={t('common.title')} required error={titleErr}>
        {(id) => <Input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-invalid={!!titleErr} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('blockers.category')}>
          {(id) => (
            <Select id={id} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {te('blockers.categories', c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('common.status')}>
          {(id) => (
            <Select id={id} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {BSTATUS.map((c) => (
                <option key={c} value={c}>
                  {te('blockers.status', c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('common.owner')}>
          {(id) => (
            <Select id={id} value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
              <option value="">{t('common.unassigned')}</option>
              {users.data?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('common.dueDate')}>{(id) => <Input id={id} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />}</Field>
      </div>
      <Field label={t('blockers.nextStep')}>{(id) => <Input id={id} value={f.nextStep} onChange={(e) => setF({ ...f, nextStep: e.target.value })} />}</Field>
      <Field label={t('blockers.resolutionCriteria')}>{(id) => <Input id={id} value={f.resolutionCriteria} onChange={(e) => setF({ ...f, resolutionCriteria: e.target.value })} />}</Field>
      <Field label={t('common.description')}>{(id) => <Textarea id={id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

function TaskForm({ onDone }: { onDone: () => void }) {
  const { caseId, bundle } = useCase();
  const { t } = useI18n();
  const users = useUsers();
  const [f, setF] = useState({ title: '', assigneeId: '', dueDate: '', blockerId: '', description: '' });
  const [touched, setTouched] = useState(false);
  const err = touched && f.title.trim().length < 3 ? t('common.required') : undefined;
  const save = useCaseAction(
    () => api.post(`/cases/${caseId}/tasks`, { ...f, assigneeId: f.assigneeId || null, dueDate: f.dueDate || null, blockerId: f.blockerId || null }),
    { onSuccess: onDone },
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (f.title.trim().length >= 3) save.mutate();
      }}
      className="space-y-3"
      noValidate
    >
      {save.error && <Alert tone="danger">{errorMessage(save.error, t)}</Alert>}
      <Field label={t('common.title')} required error={err}>
        {(id) => <Input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-invalid={!!err} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('tasks.assignee')}>
          {(id) => (
            <Select id={id} value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>
              <option value="">{t('common.unassigned')}</option>
              {users.data?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('common.dueDate')}>{(id) => <Input id={id} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />}</Field>
      </div>
      <Field label={t('blockers.title')}>
        {(id) => (
          <Select id={id} value={f.blockerId} onChange={(e) => setF({ ...f, blockerId: e.target.value })}>
            <option value="">—</option>
            {bundle.blockers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('common.description')}>{(id) => <Textarea id={id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>
          {t('common.create')}
        </Button>
      </div>
    </form>
  );
}

export function TaskRow({ task, showCase }: { task: Task; showCase?: boolean }) {
  const { t, te, locale } = useI18n();
  const setStatus = useCaseAction((status: string) => api.patch(`/tasks/${task.id}`, { status }), { success: '' });
  const del = useCaseAction(() => api.del(`/tasks/${task.id}`));
  const overdue = isOverdue(task.dueDate, task.status === 'DONE');
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <div className={task.status === 'DONE' ? 'text-sm text-slate-400 line-through' : 'text-sm font-medium text-slate-800'}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span>{task.assignee?.name ?? t('common.unassigned')}</span>
          {task.dueDate && <Badge tone={overdue ? 'red' : 'slate'}>{fmtDate(task.dueDate, locale)}{overdue && ` · ${t('common.overdue')}`}</Badge>}
          {task.origin !== 'MANUAL' && <Badge tone="violet">{te('tasks.origin', task.origin)}</Badge>}
          {showCase && task.case && <span>· {task.case.title}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Select className="w-36 py-1 text-xs" value={task.status} onChange={(e) => setStatus.mutate(e.target.value)} aria-label={t('common.status')}>
          {TSTATUS.map((s) => (
            <option key={s} value={s}>
              {te('tasks.status', s)}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} aria-label={t('common.delete')} onClick={() => window.confirm(`${t('common.delete')}?`) && del.mutate()} />
      </div>
    </li>
  );
}

export function BlockersTab() {
  const { bundle, openSource } = useCase();
  const { t, te, locale } = useI18n();
  const retry = useRetryAnalysis();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Blocker | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const setStatus = useCaseAction((v: { id: string; status: string }) => api.patch(`/blockers/${v.id}`, { status: v.status }));
  const toBlocker = useCaseAction((id: string) => api.post(`/findings/${id}/to-blocker`));
  const applyRes = useCaseAction((id: string) => api.post(`/findings/${id}/apply-resolution`));
  const suggestions = bundle.findings.filter((f) => f.module === 'UNBLOCK' && !f.stale && f.reviewStatus === 'PENDING');

  return (
    <div className="space-y-4">
      <Card
        title={t('blockers.title')}
        actions={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            {t('blockers.add')}
          </Button>
        }
      >
        {bundle.blockers.length === 0 ? (
          <EmptyState>{t('blockers.none')}</EmptyState>
        ) : (
          <ul className="space-y-3">
            {bundle.blockers.map((b) => (
              <li key={b.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="slate">{te('blockers.categories', b.category)}</Badge>
                      <Badge tone={blockerTone(b.status)}>{te('blockers.status', b.status)}</Badge>
                      {b.findingId && <Badge tone="amber">AI</Badge>}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{b.title}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select className="w-48 py-1 text-xs" value={b.status} onChange={(e) => setStatus.mutate({ id: b.id, status: e.target.value })} aria-label={t('common.status')}>
                      {BSTATUS.map((s) => (
                        <option key={s} value={s}>
                          {te('blockers.status', s)}
                        </option>
                      ))}
                    </Select>
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} aria-label={t('common.edit')} onClick={() => setEditing(b)} />
                  </div>
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="inline text-slate-500">{t('common.owner')}: </dt>
                    <dd className="inline text-slate-800">{b.owner?.name ?? t('common.unassigned')}</dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-500">{t('common.dueDate')}: </dt>
                    <dd className={isOverdue(b.dueDate, b.status === 'RESOLVED') ? 'inline font-medium text-red-700' : 'inline text-slate-800'}>
                      {fmtDate(b.dueDate, locale)}
                      {isOverdue(b.dueDate, b.status === 'RESOLVED') && ` · ${t('common.overdue')}`}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="inline text-slate-500">{t('blockers.nextStep')}: </dt>
                    <dd className="inline text-slate-800">{b.nextStep ?? '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="inline text-slate-500">{t('blockers.resolutionCriteria')}: </dt>
                    <dd className="inline text-slate-800">{b.resolutionCriteria ?? '—'}</dd>
                  </div>
                </dl>
                {b.evidenceQuote && b.sourceId && (
                  <button
                    type="button"
                    onClick={() => openSource({ sourceId: b.sourceId!, evidence: { quote: b.evidenceQuote!, startOffset: null, endOffset: null, sourceVersion: -1 } })}
                    className="mt-2 block w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 hover:bg-brand-50"
                  >
                    <span className="text-slate-500">{t('blockers.evidenceQuote')}:</span> “{b.evidenceQuote}”
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('blockers.suggestions')}>
        <div className="space-y-3">
          <RunInfo run={bundle.latestRunByModule.UNBLOCK} onRetry={() => retry.mutate()} retrying={retry.isPending} />
          <Alert tone="info">{t('blockers.resolutionHint')}</Alert>
          {suggestions.length === 0 ? (
            <EmptyState>—</EmptyState>
          ) : (
            suggestions.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                actions={
                  f.kind === 'BLOCKER' ? (
                    <Button size="sm" icon={<ShieldPlus className="h-3.5 w-3.5" />} loading={toBlocker.isPending} onClick={() => toBlocker.mutate(f.id)}>
                      {t('finding.toBlocker')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="success" icon={<CheckCheck className="h-3.5 w-3.5" />} loading={applyRes.isPending} onClick={() => applyRes.mutate(f.id)}>
                      {t('finding.applyResolution')}
                    </Button>
                  )
                }
              >
                {f.kind === 'BLOCKER' && (
                  <dl className="grid gap-1 text-xs text-slate-600">
                    {typeof f.data.category === 'string' && (
                      <div>
                        {t('blockers.category')}: <span className="text-slate-800">{te('blockers.categories', f.data.category)}</span>
                      </div>
                    )}
                    {typeof f.data.nextStep === 'string' && (
                      <div>
                        {t('blockers.nextStep')}: <span className="text-slate-800">{f.data.nextStep}</span>
                      </div>
                    )}
                    {typeof f.data.resolutionCriteria === 'string' && (
                      <div>
                        {t('blockers.resolutionCriteria')}: <span className="text-slate-800">{f.data.resolutionCriteria}</span>
                      </div>
                    )}
                  </dl>
                )}
              </FindingCard>
            ))
          )}
        </div>
      </Card>

      <Card
        title={t('tasks.title')}
        actions={
          <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setAddingTask(true)}>
            {t('tasks.add')}
          </Button>
        }
      >
        {bundle.tasks.length === 0 ? (
          <EmptyState>{t('tasks.none')}</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {bundle.tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title={t('blockers.add')}>
        <BlockerForm onDone={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('common.edit')}>
        {editing && <BlockerForm existing={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={addingTask} onClose={() => setAddingTask(false)} title={t('tasks.add')}>
        <TaskForm onDone={() => setAddingTask(false)} />
      </Modal>
    </div>
  );
}
