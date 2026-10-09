import { useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { fmtDateTime } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea, errorMessage } from '../../components/ui';
import { useUsers } from '../CustomerDetail';
import { useCase, useCaseAction } from './context';

const STATUSES = ['NEW', 'NEEDS_CLARIFICATION', 'SOLUTION_DESIGN', 'IN_PROGRESS', 'AWAITING_CONFIRMATION', 'CLOSED', 'REOPENED'];
const SALES = ['OPEN', 'WON', 'LOST', 'NOT_APPLICABLE'];

function EditCase({ onDone }: { onDone: () => void }) {
  const { bundle } = useCase();
  const { t, te } = useI18n();
  const { user } = useAuth();
  const users = useUsers();
  const c = bundle.case;
  const [form, setForm] = useState({ title: c.title, initialRequest: c.initialRequest, coreNeed: c.coreNeed ?? '', status: c.status, salesOutcome: c.salesOutcome, ownerId: c.ownerId ?? '' });
  const save = useCaseAction(
    () =>
      api.patch(`/cases/${c.id}`, {
        title: form.title,
        initialRequest: form.initialRequest,
        coreNeed: form.coreNeed || null,
        status: form.status,
        salesOutcome: form.salesOutcome,
        ...(user?.role === 'ADMIN' ? { ownerId: form.ownerId || null } : {}),
      }),
    { onSuccess: onDone },
  );
  const err = save.error;
  const blocking = err instanceof ApiError && err.code === 'CLOSE_BLOCKED' ? ((err.details as { blockingReasons?: string[] })?.blockingReasons ?? []) : [];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      {err && (
        <Alert tone="danger" title={errorMessage(err, t)}>
          {blocking.length > 0 && (
            <ul className="list-disc pl-5">
              {blocking.map((r) => (
                <li key={r}>{te('resolution.blocking', r)}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      <Field label={t('caseForm.title')} required>
        {(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} />}
      </Field>
      <Field label={t('caseForm.initialRequest')} required>
        {(id) => <Textarea id={id} value={form.initialRequest} onChange={(e) => setForm({ ...form, initialRequest: e.target.value })} required />}
      </Field>
      <Field label={t('caseForm.coreNeed')}>{(id) => <Textarea id={id} value={form.coreNeed} onChange={(e) => setForm({ ...form, coreNeed: e.target.value })} />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('case.statusLabel')}>
          {(id) => (
            <Select id={id} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {te('case.status', s)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('case.salesLabel')} hint={t('case.salesNote')}>
          {(id) => (
            <Select id={id} value={form.salesOutcome} onChange={(e) => setForm({ ...form, salesOutcome: e.target.value })}>
              {SALES.map((s) => (
                <option key={s} value={s}>
                  {te('case.sales', s)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {user?.role === 'ADMIN' && (
          <Field label={t('caseForm.owner')}>
            {(id) => (
              <Select id={id} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">{t('common.unassigned')}</option>
                {users.data?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

export function OverviewTab() {
  const { bundle, openSource } = useCase();
  const { t, te, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [commitment, setCommitment] = useState('');
  const c = bundle.case;
  const addCommitment = useCaseAction(() => api.post(`/cases/${c.id}/commitments`, { text: commitment }), { onSuccess: () => setCommitment('') });
  const setCommitmentStatus = useCaseAction((v: { id: string; status: string }) => api.patch(`/commitments/${v.id}`, { status: v.status }));
  const cl = bundle.closure;
  const openBlockers = bundle.blockers.filter((b) => b.status !== 'RESOLVED').length;
  const openContr = bundle.findings.filter((f) => f.module === 'ONEVOICE' && !f.stale && ['PENDING', 'CONFIRMED'].includes(f.reviewStatus)).length;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card
          title={t('case.tabs.overview')}
          actions={
            <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
              {t('case.edit')}
            </Button>
          }
        >
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('case.initialRequest')}</dt>
              <dd className="mt-0.5 text-slate-800">{c.initialRequest}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('case.coreNeed')}</dt>
              <dd className="mt-0.5 text-slate-800">{c.coreNeed ?? <span className="italic text-slate-400">—</span>}</dd>
            </div>
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{t('case.tabs.sources')}</div>
              <div className="text-lg font-semibold tabular-nums">{bundle.sources.length}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{t('dashboard.openContradictions')}</div>
              <div className="text-lg font-semibold tabular-nums">{openContr}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{t('dashboard.unresolvedBlockers')}</div>
              <div className="text-lg font-semibold tabular-nums">{openBlockers}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{t('tasks.title')}</div>
              <div className="text-lg font-semibold tabular-nums">{bundle.tasks.filter((x) => x.status !== 'DONE').length}</div>
            </div>
          </div>
        </Card>

        <Card title={t('case.commitments')}>
          {bundle.commitments.length === 0 ? (
            <EmptyState>{t('common.empty')}</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bundle.commitments.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className={k.status === 'SUPERSEDED' ? 'text-slate-400 line-through' : 'text-slate-800'}>
                    {k.text}
                    {k.sourceId && (
                      <button type="button" className="ml-2 text-xs text-brand-700 hover:underline" onClick={() => openSource({ sourceId: k.sourceId! })}>
                        {t('sources.viewer')}
                      </button>
                    )}
                  </span>
                  <Select
                    className="w-40 py-1 text-xs"
                    value={k.status}
                    onChange={(e) => setCommitmentStatus.mutate({ id: k.id, status: e.target.value })}
                    aria-label={t('common.status')}
                  >
                    {['ACTIVE', 'SUPERSEDED', 'DISPUTED'].map((s) => (
                      <option key={s} value={s}>
                        {te('case.commitmentStatus', s)}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (commitment.trim().length >= 3) addCommitment.mutate();
            }}
          >
            <Input value={commitment} onChange={(e) => setCommitment(e.target.value)} placeholder={t('case.addCommitment')} aria-label={t('case.addCommitment')} />
            <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} loading={addCommitment.isPending} disabled={commitment.trim().length < 3}>
              {t('common.add')}
            </Button>
          </form>
        </Card>

        {bundle.requirements.length > 0 && (
          <Card title={t('case.requirements')}>
            <ul className="space-y-1.5 text-sm">
              {bundle.requirements.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.epistemic === 'STATED' ? 'blue' : 'violet'}>{r.epistemic === 'STATED' ? t('need.stated') : t('need.inferred')}</Badge>
                  {r.text}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card title={t('case.resolutionState')}>
          <p className="text-sm font-medium text-slate-900">{te('resolution.states', cl.resolutionState)}</p>
          <p className="mt-2 text-xs text-slate-500">
            {t('case.lastReply')}: {fmtDateTime(cl.lastCompanyReplyAt, locale)}
          </p>
          <p className="mt-2 text-xs text-slate-500">{t('resolution.replied')}</p>
        </Card>
        <Card title={t('case.audit')}>
          <ol className="max-h-[420px] space-y-2 overflow-y-auto text-xs">
            {bundle.audit.map((a) => (
              <li key={a.id} className="border-l-2 border-slate-200 pl-2">
                <div className="font-medium text-slate-700">{a.action.replaceAll('_', ' ').toLowerCase()}</div>
                <div className="text-slate-500">
                  {te('audit.actor', a.actorType)}
                  {a.actorName ? ` · ${a.actorName}` : ''} · {fmtDateTime(a.createdAt, locale)}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <Modal open={editing} onClose={() => setEditing(false)} title={t('case.edit')}>
        <EditCase onDone={() => setEditing(false)} />
      </Modal>
    </div>
  );
}
