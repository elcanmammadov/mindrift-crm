import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { fmtDateTime } from '../../lib/format';
import type { Handover, HandoverPackage } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Select, Textarea, errorMessage } from '../../components/ui';
import { useUsers } from '../CustomerDetail';
import { useCase, useCaseAction } from './context';

const LIST_KEYS = ['agreements', 'openBlockers', 'contradictions', 'collectedInfo', 'notes'] as const;
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function PackageEditor({ h }: { h: Handover }) {
  const { t, te, locale } = useI18n();
  const { user } = useAuth();
  const { openSource } = useCase();
  const pkg = h.package;
  const [goal, setGoal] = useState(pkg.customerGoal);
  const [state, setState] = useState(pkg.currentState);
  const [lists, setLists] = useState<Record<(typeof LIST_KEYS)[number], string>>(() =>
    Object.fromEntries(LIST_KEYS.map((k) => [k, (pkg[k] ?? []).join('\n')])) as Record<(typeof LIST_KEYS)[number], string>,
  );
  const [steps, setSteps] = useState(pkg.nextSteps.map((s) => (s.dueDate ? `${s.text} | ${s.dueDate}` : s.text)).join('\n'));
  useEffect(() => {
    setGoal(pkg.customerGoal);
    setState(pkg.currentState);
  }, [pkg]);
  const editable = h.status === 'PENDING';
  const save = useCaseAction(() => {
    const p: HandoverPackage = {
      customerGoal: goal,
      currentState: state,
      agreements: lines(lists.agreements),
      openBlockers: lines(lists.openBlockers),
      contradictions: lines(lists.contradictions),
      collectedInfo: lines(lists.collectedInfo),
      notes: lines(lists.notes),
      doNotAsk: pkg.doNotAsk,
      nextSteps: lines(steps).map((l) => {
        const [text, dueDate] = l.split('|').map((x) => x.trim());
        return { text: text!, ...(dueDate ? { dueDate } : {}) };
      }),
    };
    return api.patch(`/handovers/${h.id}`, { package: p });
  });
  const accept = useCaseAction(() => api.post(`/handovers/${h.id}/accept`));
  const isReceiver = user?.id === h.toUserId;

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {h.fromUser?.name ?? '—'} <ArrowRight className="h-4 w-4" aria-hidden /> {h.toUser?.name}
          <Badge tone={h.status === 'ACCEPTED' ? 'green' : 'amber'}>{h.status === 'ACCEPTED' ? t('handover.accepted') : t('handover.pending')}</Badge>
          <Badge tone={h.origin === 'REAL_AI' ? 'green' : 'amber'}>{te('origin', h.origin)}</Badge>
        </span>
      }
      actions={
        editable && (
          <>
            <Button size="sm" variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>
              {t('common.save')}
            </Button>
            <Button size="sm" variant="success" icon={<CheckCircle2 className="h-4 w-4" />} loading={accept.isPending} disabled={!isReceiver} onClick={() => accept.mutate()} title={!isReceiver ? t('handover.onlyReceiver') : undefined}>
              {t('handover.accept')}
            </Button>
          </>
        )
      }
    >
      {editable && !isReceiver && <Alert tone="info">{t('handover.onlyReceiver')}</Alert>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label={t('handover.customerGoal')}>{(id) => <Textarea id={id} value={goal} onChange={(e) => setGoal(e.target.value)} disabled={!editable} rows={3} />}</Field>
        <Field label={t('handover.currentState')}>{(id) => <Textarea id={id} value={state} onChange={(e) => setState(e.target.value)} disabled={!editable} rows={3} />}</Field>
        {LIST_KEYS.map((k) => (
          <Field key={k} label={t(`handover.${k}`)} hint={editable ? t('handover.onePerLine') : undefined}>
            {(id) => <Textarea id={id} value={lists[k]} onChange={(e) => setLists({ ...lists, [k]: e.target.value })} disabled={!editable} rows={4} />}
          </Field>
        ))}
        <Field label={t('handover.nextSteps')} hint={editable ? `${t('handover.onePerLine')} — "… | YYYY-MM-DD"` : undefined}>
          {(id) => <Textarea id={id} value={steps} onChange={(e) => setSteps(e.target.value)} disabled={!editable} rows={4} />}
        </Field>
      </div>
      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('handover.doNotAsk')}</h3>
        {pkg.doNotAsk.length === 0 ? (
          <EmptyState>—</EmptyState>
        ) : (
          <ul className="space-y-2">
            {pkg.doNotAsk.map((d, i) => (
              <li key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="font-medium text-slate-800">{d.question}</div>
                <div className="text-slate-700">→ {d.answer}</div>
                {d.sourceId && d.quote && (
                  <button
                    type="button"
                    className="mt-1 text-xs text-brand-700 hover:underline"
                    onClick={() => openSource({ sourceId: d.sourceId!, evidence: { quote: d.quote!, startOffset: null, endOffset: null, sourceVersion: -1 } })}
                  >
                    “{d.quote}”
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {fmtDateTime(h.createdAt, locale)}
        {h.acceptedAt && ` → ${t('handover.accepted')}: ${fmtDateTime(h.acceptedAt, locale)}`}
      </p>
    </Card>
  );
}

function DraftCheck() {
  const { caseId, openSource } = useCase();
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<{ draftQuestion: string; previousQuestion: string; answer: string; sourceId: string; sourceTitle: string; quote: string }[] | null>(null);
  const check = useCaseAction(() => api.post<{ warnings: NonNullable<typeof result> }>(`/cases/${caseId}/draft-check`, { draft }), {
    success: '',
    onSuccess: (r) => setResult(r.warnings),
  });
  return (
    <Card title={t('handover.draftTitle')}>
      <p className="mb-2 text-xs text-slate-500">{t('handover.draftHint')}</p>
      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('handover.draftPlaceholder')} aria-label={t('handover.draftTitle')} rows={4} />
      <div className="mt-2 flex justify-end">
        <Button variant="secondary" icon={<Search className="h-4 w-4" />} loading={check.isPending} disabled={draft.trim().length < 3} onClick={() => check.mutate()}>
          {t('handover.check')}
        </Button>
      </div>
      {result &&
        (result.length === 0 ? (
          <Alert tone="success">{t('handover.noRepeats')}</Alert>
        ) : (
          <div className="mt-2 space-y-2">
            {result.map((w, i) => (
              <Alert key={i} tone="warning" title={`${t('handover.repeatWarning')}: “${w.draftQuestion}”`}>
                <div>
                  {w.previousQuestion} → <strong>{w.answer}</strong>
                </div>
                <button
                  type="button"
                  className="mt-1 text-xs underline"
                  onClick={() => openSource({ sourceId: w.sourceId, evidence: { quote: w.quote, startOffset: null, endOffset: null, sourceVersion: -1 } })}
                >
                  {t('handover.answeredIn')}: {w.sourceTitle}
                </button>
              </Alert>
            ))}
          </div>
        ))}
    </Card>
  );
}

export function HandoverTab() {
  const { bundle, caseId } = useCase();
  const { t, locale } = useI18n();
  const users = useUsers();
  const [to, setTo] = useState('');
  const pending = bundle.handovers.find((h) => h.status === 'PENDING');
  const history = bundle.handovers.filter((h) => h !== pending);
  const start = useCaseAction(() => api.post(`/cases/${caseId}/handovers`, { toUserId: to }), { onSuccess: () => setTo('') });
  return (
    <div className="space-y-4">
      {pending ? (
        <PackageEditor h={pending} />
      ) : (
        <Card title={t('handover.start')}>
          {start.error && <Alert tone="danger">{errorMessage(start.error, t)}</Alert>}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label={t('handover.to')}>
                {(id) => (
                  <Select id={id} value={to} onChange={(e) => setTo(e.target.value)}>
                    <option value="">—</option>
                    {users.data?.users
                      .filter((u) => u.id !== bundle.case.ownerId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
            </div>
            <Button loading={start.isPending} disabled={!to} onClick={() => start.mutate()}>
              {t('handover.create')}
            </Button>
          </div>
        </Card>
      )}
      <DraftCheck />
      <Card title={t('handover.history')}>
        {history.length === 0 ? (
          <EmptyState>{t('handover.none')}</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-1.5">
                  {h.fromUser?.name ?? '—'} <ArrowRight className="h-3.5 w-3.5" aria-hidden /> {h.toUser?.name}
                </span>
                <span className="text-xs text-slate-500">
                  {fmtDateTime(h.createdAt, locale)} · <Badge tone="green">{t('handover.accepted')}</Badge> {fmtDateTime(h.acceptedAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
