import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Link2, Lock, Plus, Scale, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { fmtDateTime } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select, Textarea, errorMessage, useToast } from '../../components/ui';
import { FindingCard } from '../../components/FindingCard';
import { RunInfo } from '../../components/RunInfo';
import { CopyLink } from '../CustomerDetail';
import { useCase, useCaseAction } from './context';

const stateTone = (s: string) =>
  (({ CUSTOMER_CONFIRMED: 'green', EVIDENCE_SUPPORTED: 'green', AWAITING_CUSTOMER: 'amber', INSUFFICIENT_EVIDENCE: 'amber', UNRESOLVED: 'red', PROBLEM_REMAINS: 'red', MANUALLY_CLOSED: 'violet' }) as const)[
    s as 'UNRESOLVED'
  ] ?? 'slate';

export function ResolutionTab() {
  const { bundle, caseId } = useCase();
  const { t, te, locale } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const cl = bundle.closure;
  const [crit, setCrit] = useState({ description: '', evidenceRequired: '', requiresCustomerConfirmation: false });
  const [link, setLink] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const addCrit = useCaseAction(() => api.post(`/cases/${caseId}/criteria`, crit), {
    onSuccess: () => setCrit({ description: '', evidenceRequired: '', requiresCustomerConfirmation: false }),
  });
  const updateCrit = useCaseAction((v: { id: string; status: string }) => api.patch(`/criteria/${v.id}`, { status: v.status }));
  const delCrit = useCaseAction((id: string) => api.del(`/criteria/${id}`));
  const evaluate = useMutation({
    mutationFn: () => api.post<{ result: { status: string; error?: { message: string } } }>(`/cases/${caseId}/evaluate-resolution`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['case', caseId] });
      toast(t(`case.analysisResult.${r.result.status}`), r.result.status === 'FAILED' ? 'danger' : 'success');
    },
    onError: (e) => toast(errorMessage(e, t), 'danger'),
  });
  const createLink = useCaseAction(() => api.post<{ url: string }>(`/cases/${caseId}/confirmation-link`), { success: '', onSuccess: (r) => setLink(r.url) });
  const close = useCaseAction(() => api.patch(`/cases/${caseId}`, { status: 'CLOSED' }));
  const manualClose = useCaseAction(() => api.post(`/cases/${caseId}/manual-close`, { reason }), { onSuccess: () => setReason('') });
  const applyVerdict = useCaseAction((id: string) => api.post(`/findings/${id}/apply-verdict`));

  const verdicts = bundle.findings.filter((f) => f.module === 'PROOFCLOSE' && !f.stale);
  const closed = bundle.case.status === 'CLOSED';

  return (
    <div className="space-y-4">
      <Alert tone="info">{t('resolution.replied')}</Alert>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t('case.resolutionState')}>
          <Badge tone={stateTone(cl.resolutionState)} className="text-sm">
            {te('resolution.states', cl.resolutionState)}
          </Badge>
          <dl className="mt-3 space-y-1 text-sm">
            <div>
              <dt className="inline text-slate-500">{t('case.lastReply')}: </dt>
              <dd className="inline">{fmtDateTime(cl.lastCompanyReplyAt, locale)}</dd>
            </div>
            <div>
              <dt className="inline text-slate-500">{t('resolution.criteria')}: </dt>
              <dd className="inline tabular-nums">
                {cl.criteriaMet}/{cl.criteriaTotal} {te('resolution.status', 'MET').toLowerCase()}
              </dd>
            </div>
            {cl.requiresCustomerConfirmation && (
              <div>
                <dt className="inline text-slate-500">{t('resolution.needsCustomer')}: </dt>
                <dd className="inline">{cl.latestConfirmation ? te('resolution.customerSaid', cl.latestConfirmation.outcome) : '—'}</dd>
              </div>
            )}
          </dl>
        </Card>
        <Card title={t('resolution.close')}>
          {closed ? (
            <p className="text-sm text-slate-700">
              {te('case.status', 'CLOSED')}
              {bundle.case.closedManually && ` — ${te('resolution.states', 'MANUALLY_CLOSED')}`}
              {bundle.case.closeReason && <span className="block text-xs text-slate-500">{bundle.case.closeReason}</span>}
            </p>
          ) : (
            <>
              {!cl.canClose && (
                <Alert tone="warning" title={t('resolution.cannotClose')}>
                  <ul className="list-disc pl-5">
                    {cl.blockingReasons.map((r) => (
                      <li key={r}>{te('resolution.blocking', r)}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button icon={<Lock className="h-4 w-4" />} disabled={!cl.canClose} loading={close.isPending} onClick={() => close.mutate()}>
                  {t('resolution.close')}
                </Button>
                <Button variant="secondary" icon={<Link2 className="h-4 w-4" />} loading={createLink.isPending} disabled={bundle.criteria.length === 0} onClick={() => createLink.mutate()}>
                  {t('resolution.confirmationLink')}
                </Button>
              </div>
              {link && (
                <div className="mt-3">
                  <CopyLink url={link} hint={t('resolution.linkHint')} />
                </div>
              )}
              {user?.role === 'ADMIN' && (
                <details className="mt-4 rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">{t('resolution.manualClose')}</summary>
                  <p className="mt-2 text-xs text-slate-500">{t('resolution.manualNote')}</p>
                  <Field label={t('resolution.reason')} required>
                    {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />}
                  </Field>
                  <Button className="mt-2" variant="danger" size="sm" disabled={reason.trim().length < 5} loading={manualClose.isPending} onClick={() => manualClose.mutate()}>
                    {t('resolution.manualClose')}
                  </Button>
                </details>
              )}
            </>
          )}
        </Card>
      </div>

      <Card title={t('resolution.criteria')}>
        {bundle.criteria.length === 0 ? (
          <EmptyState>{t('common.empty')}</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {bundle.criteria.map((k) => (
              <li key={k.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{k.description}</div>
                  <div className="text-xs text-slate-500">
                    {t('resolution.evidenceRequired')} {k.evidenceRequired}
                  </div>
                  {k.requiresCustomerConfirmation && (
                    <Badge tone="blue" className="mt-1">
                      {t('resolution.needsCustomer')}
                    </Badge>
                  )}
                  {k.evidenceNote && <div className="mt-1 text-xs italic text-slate-600">{k.evidenceNote}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <Select
                    className="w-44 py-1 text-xs"
                    value={k.status}
                    onChange={(e) => updateCrit.mutate({ id: k.id, status: e.target.value })}
                    aria-label={t('common.status')}
                  >
                    {['PENDING', 'MET', 'NOT_MET'].map((s) => (
                      <option key={s} value={s} disabled={s === 'MET' && k.requiresCustomerConfirmation && cl.latestConfirmation?.outcome !== 'RESOLVED'}>
                        {te('resolution.status', s)}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} aria-label={t('common.delete')} onClick={() => window.confirm(`${t('common.delete')}?`) && delCrit.mutate(k.id)} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (crit.description.trim().length >= 3 && crit.evidenceRequired.trim().length >= 3) addCrit.mutate();
          }}
        >
          <Field label={t('resolution.whatDone')} required>
            {(id) => <Input id={id} value={crit.description} onChange={(e) => setCrit({ ...crit, description: e.target.value })} />}
          </Field>
          <Field label={t('resolution.evidenceRequired')} required>
            {(id) => <Input id={id} value={crit.evidenceRequired} onChange={(e) => setCrit({ ...crit, evidenceRequired: e.target.value })} />}
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={crit.requiresCustomerConfirmation} onChange={(e) => setCrit({ ...crit, requiresCustomerConfirmation: e.target.checked })} />
            {t('resolution.needsCustomer')}
          </label>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} loading={addCrit.isPending} disabled={crit.description.trim().length < 3 || crit.evidenceRequired.trim().length < 3}>
              {t('resolution.addCriterion')}
            </Button>
          </div>
        </form>
      </Card>

      <Card
        title={t('resolution.evaluate')}
        actions={
          <Button size="sm" icon={<Scale className="h-4 w-4" />} loading={evaluate.isPending} disabled={bundle.criteria.length === 0} onClick={() => evaluate.mutate()}>
            {t('resolution.evaluate')}
          </Button>
        }
      >
        <div className="space-y-3">
          <RunInfo run={bundle.latestRunByModule.PROOFCLOSE} onRetry={() => evaluate.mutate()} retrying={evaluate.isPending} />
          {verdicts.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              hideReview
              actions={
                f.reviewStatus === 'PENDING' && (
                  <Button size="sm" variant="secondary" icon={<CheckCircle2 className="h-3.5 w-3.5" />} loading={applyVerdict.isPending} onClick={() => applyVerdict.mutate(f.id)}>
                    {t('finding.applyVerdict')}
                  </Button>
                )
              }
            >
              <ul className="space-y-1 text-xs">
                {((f.data.criteria as { criterionId: string; status: string; note?: string }[]) ?? []).map((c) => (
                  <li key={c.criterionId} className="flex flex-wrap gap-1.5">
                    <Badge tone={c.status === 'MET' ? 'green' : c.status === 'NOT_MET' ? 'red' : 'slate'}>{te('resolution.status', c.status)}</Badge>
                    <span className="text-slate-700">{bundle.criteria.find((k) => k.id === c.criterionId)?.description}</span>
                    {c.note && <span className="text-slate-500">— {c.note}</span>}
                  </li>
                ))}
              </ul>
            </FindingCard>
          ))}
        </div>
      </Card>

      <Card title={t('resolution.confirmations')}>
        {bundle.confirmations.length === 0 ? (
          <EmptyState>—</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {bundle.confirmations.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge tone={c.outcome === 'RESOLVED' ? 'green' : 'red'}>{te('resolution.customerSaid', c.outcome)}</Badge>
                <span className="text-slate-700">{c.note}</span>
                <span className="ml-auto text-xs text-slate-500">{fmtDateTime(c.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
