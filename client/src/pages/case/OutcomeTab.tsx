import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardPlus, SearchCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import type { Finding } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Select, Textarea, errorMessage, useToast } from '../../components/ui';
import { FindingCard } from '../../components/FindingCard';
import { RunInfo } from '../../components/RunInfo';
import { useCase, useCaseAction } from './context';

const REASONS = ['PRICE', 'COMPETITOR', 'TIMING', 'NO_DECISION', 'PRODUCT_FIT', 'OTHER'];

function LossForm({ onDone }: { onDone?: () => void }) {
  const { bundle, caseId } = useCase();
  const { t, te } = useI18n();
  const [reason, setReason] = useState(bundle.lossAnalysis?.agentReason ?? 'PRICE');
  const [note, setNote] = useState(bundle.lossAnalysis?.agentNote ?? '');
  const save = useCaseAction(() => api.put(`/cases/${caseId}/loss`, { agentReason: reason, agentNote: note || null }), { onSuccess: onDone });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('outcome.reason')} required>
          {(id) => (
            <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {te('outcome.reasons', r)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('outcome.note')}>{(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
      <Button loading={save.isPending} onClick={() => save.mutate()} variant={bundle.lossAnalysis ? 'secondary' : 'danger'}>
        {bundle.lossAnalysis ? t('common.save') : t('outcome.markLost')}
      </Button>
    </div>
  );
}

function Group({ title, items, render }: { title: string; items: Finding[]; render: (f: Finding) => React.ReactNode }) {
  return (
    <section>
      {title && <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>}
      {items.length === 0 ? <EmptyState>—</EmptyState> : <div className="space-y-3">{items.map(render)}</div>}
    </section>
  );
}

export function OutcomeTab() {
  const { bundle, caseId } = useCase();
  const { t, te } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const toTask = useCaseAction((id: string) => api.post(`/findings/${id}/to-task`));
  const analyze = useMutation({
    mutationFn: () => api.post<{ result: { status: string } }>(`/cases/${caseId}/loss/analyze`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['case', caseId] });
      toast(t(`case.analysisResult.${r.result.status}`), r.result.status === 'FAILED' ? 'danger' : 'success');
    },
    onError: (e) => toast(errorMessage(e, t), 'danger'),
  });
  const lost = bundle.case.salesOutcome === 'LOST';
  const f = bundle.findings.filter((x) => x.module === 'WHYLOST' && !x.stale);
  const by = (k: string) => f.filter((x) => x.kind === k);

  if (!lost) {
    return (
      <Card title={t('outcome.title')}>
        <Alert tone="info">{t('outcome.notLost')}</Alert>
        <div className="mt-4">
          <LossForm />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        title={t('outcome.title')}
        actions={
          <Button size="sm" icon={<SearchCheck className="h-4 w-4" />} loading={analyze.isPending} onClick={() => analyze.mutate()}>
            {t('outcome.analyze')}
          </Button>
        }
      >
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('outcome.agentReason')}</div>
          <div className="mt-1 text-sm">
            <Badge tone="slate">{te('outcome.reasons', bundle.lossAnalysis?.agentReason)}</Badge> {bundle.lossAnalysis?.agentNote}
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-brand-700">{t('common.edit')}</summary>
            <div className="mt-2">
              <LossForm />
            </div>
          </details>
        </div>
        <RunInfo run={bundle.latestRunByModule.WHYLOST} onRetry={() => analyze.mutate()} retrying={analyze.isPending} />
        <p className="mt-3 text-xs text-slate-500">{t('outcome.correlation')}</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('outcome.customerStated')}>
          <Group title="" items={by('CUSTOMER_STATED_REASON')} render={(x) => <FindingCard key={x.id} finding={x} />} />
        </Card>
        <Card title={t('outcome.factors')}>
          <Group
            title=""
            items={by('POSSIBLE_FACTOR')}
            render={(x) => (
              <FindingCard key={x.id} finding={x}>
                {typeof x.data.agreesWithAgentReason === 'boolean' && (
                  <Badge tone={x.data.agreesWithAgentReason ? 'green' : 'amber'}>{x.data.agreesWithAgentReason ? t('outcome.agrees') : t('outcome.disagrees')}</Badge>
                )}
              </FindingCard>
            )}
          />
        </Card>
        <Card title={t('outcome.missing')}>
          <Group title="" items={by('MISSING_INFO')} render={(x) => <FindingCard key={x.id} finding={x} />} />
        </Card>
        <Card title={t('outcome.improvements')}>
          <Group
            title=""
            items={by('IMPROVEMENT')}
            render={(x) => (
              <FindingCard
                key={x.id}
                finding={x}
                actions={
                  !bundle.tasks.some((task) => task.findingId === x.id) && (
                    <Button size="sm" variant="secondary" icon={<ClipboardPlus className="h-3.5 w-3.5" />} loading={toTask.isPending} onClick={() => toTask.mutate(x.id)}>
                      {t('finding.toTask')}
                    </Button>
                  )
                }
              />
            )}
          />
        </Card>
      </div>
    </div>
  );
}
