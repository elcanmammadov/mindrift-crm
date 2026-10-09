import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { CaseBundle, ModuleRunResult } from '../lib/types';
import { Alert, Badge, Button, ErrorState, Spinner, Tabs, errorMessage, useToast } from '../components/ui';
import { SourceViewer } from '../components/SourceViewer';
import { CaseContext, type SourceFocus } from './case/context';
import { OverviewTab } from './case/OverviewTab';
import { SourcesTab } from './case/SourcesTab';
import { NeedTab } from './case/NeedTab';
import { ContradictionsTab } from './case/ContradictionsTab';
import { BlockersTab } from './case/BlockersTab';
import { HandoverTab } from './case/HandoverTab';
import { ResolutionTab } from './case/ResolutionTab';
import { RepeatsTab } from './case/RepeatsTab';
import { OutcomeTab } from './case/OutcomeTab';

export const caseStatusTone = (s: string) =>
  (({ NEW: 'blue', NEEDS_CLARIFICATION: 'amber', SOLUTION_DESIGN: 'violet', IN_PROGRESS: 'brand', AWAITING_CONFIRMATION: 'amber', CLOSED: 'green', REOPENED: 'red' }) as const)[
    s as 'NEW'
  ] ?? 'slate';
export const salesTone = (s: string) => (({ OPEN: 'slate', WON: 'green', LOST: 'red', NOT_APPLICABLE: 'slate' }) as const)[s as 'OPEN'] ?? 'slate';

const TABS = ['overview', 'sources', 'need', 'contradictions', 'blockers', 'handover', 'resolution', 'repeats', 'outcome'] as const;
type TabId = (typeof TABS)[number];

export function CaseDetailPage() {
  const { id } = useParams();
  const { t, te } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as TabId) : 'overview';
  const setTab = (v: TabId) => setParams({ tab: v }, { replace: true });
  const [focus, setFocus] = useState<SourceFocus | null>(null);
  const [lastResults, setLastResults] = useState<ModuleRunResult[] | null>(null);

  const q = useQuery({ queryKey: ['case', id], queryFn: () => api.get<CaseBundle>(`/cases/${id}`) });
  const analyze = useMutation({
    mutationFn: (force: boolean) => api.post<{ results: ModuleRunResult[] }>(`/cases/${id}/analyze`, { force }),
    onSuccess: (r) => {
      setLastResults(r.results);
      qc.invalidateQueries({ queryKey: ['case', id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      const failed = r.results.filter((x) => x.status === 'FAILED').length;
      toast(failed ? `${t('case.analysisResult.FAILED')}: ${failed}` : t('case.analysisResult.SUCCEEDED'), failed ? 'danger' : 'success');
    },
    onError: (e) => toast(errorMessage(e, t), 'danger'),
  });

  const ctx = useMemo(() => (q.data ? { bundle: q.data, caseId: id!, openSource: setFocus } : null), [q.data, id]);

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const b = q.data!;
  const c = b.case;
  const open = (m: string, kinds?: string[]) => b.findings.filter((f) => f.module === m && !f.stale && f.reviewStatus === 'PENDING' && (!kinds || kinds.includes(f.kind))).length;
  const pendingHandover = b.handovers.some((h) => h.status === 'PENDING');

  const tabs = [
    { id: 'overview' as const, label: t('case.tabs.overview') },
    { id: 'sources' as const, label: t('case.tabs.sources'), count: b.sources.length },
    { id: 'need' as const, label: t('case.tabs.need'), count: open('BRIDGE', ['GAP', 'QUESTION_TO_ASK']) },
    { id: 'contradictions' as const, label: t('case.tabs.contradictions'), count: open('ONEVOICE') },
    { id: 'blockers' as const, label: t('case.tabs.blockers'), count: b.blockers.filter((x) => x.status !== 'RESOLVED').length + open('UNBLOCK') },
    { id: 'handover' as const, label: t('case.tabs.handover'), count: pendingHandover ? 1 : 0 },
    { id: 'resolution' as const, label: t('case.tabs.resolution') },
    { id: 'repeats' as const, label: t('case.tabs.repeats'), count: open('LOOP') },
    { id: 'outcome' as const, label: t('case.tabs.outcome') },
  ];
  const modName: Record<string, string> = { BRIDGE: t('case.tabs.need'), ONEVOICE: t('case.tabs.contradictions'), UNBLOCK: t('case.tabs.blockers'), LOOP: t('case.tabs.repeats') };

  return (
    <CaseContext.Provider value={ctx}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[#020617] bg-[radial-gradient(90%_120%_at_0%_0%,rgba(99,102,241,0.35),transparent_60%)] p-4 text-white shadow-sm sm:p-6">
          <div className="min-w-0">
            <Link to={`/customers/${c.customer.id}`} className="text-sm font-medium text-indigo-300 hover:text-white hover:underline">
              {c.customer.name}
            </Link>
            <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-white sm:text-3xl">{c.title}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={caseStatusTone(c.status)}>
                {t('case.statusLabel')}: {te('case.status', c.status)}
              </Badge>
              <Badge tone={salesTone(c.salesOutcome)}>
                {t('case.salesLabel')}: {te('case.sales', c.salesOutcome)}
              </Badge>
              <Badge tone="slate">
                {t('case.customerStatusLabel')}: {te('customers.status', c.customer.status)}
              </Badge>
              <Badge tone="slate">
                {t('common.owner')}: {c.owner?.name ?? t('case.noOwner')}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/15" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => analyze.mutate(true)} disabled={analyze.isPending || b.sources.length === 0}>
              {t('case.reanalyze')}
            </Button>
            <Button className="!bg-[#fff] !text-[#0f172a] hover:!bg-[#f1f5f9]" icon={<Sparkles className="h-4 w-4" />} loading={analyze.isPending} onClick={() => analyze.mutate(false)} disabled={b.sources.length === 0}>
              {analyze.isPending ? t('case.analyzing') : t('case.analyze')}
            </Button>
          </div>
        </div>

        {b.analysisOutdated && b.case.analyzedRevision !== null && <Alert tone="warning">{t('case.outdated')}</Alert>}
        {b.case.analyzedRevision === null && b.sources.length > 0 && Object.keys(b.latestRunByModule).length === 0 && <Alert tone="info">{t('case.neverAnalyzed')}</Alert>}
        {lastResults && (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {lastResults.map((r) => (
                <li key={r.module} className={r.status === 'FAILED' ? 'text-red-700' : 'text-slate-700'}>
                  <span className="font-medium">{modName[r.module] ?? r.module}</span>: {t(`case.analysisResult.${r.status}`)}
                  {r.stats && ` — ${t('case.stats', { created: r.stats.created ?? 0, updated: r.stats.updated ?? 0, kept: r.stats.kept ?? 0, stale: r.stats.stale ?? 0 })}`}
                  {r.error && ` — ${r.error.message}`}
                  {r.origin && r.status !== 'FAILED' && <span className="text-xs text-slate-500"> ({te('origin', r.origin)})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <div role="tabpanel">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'sources' && <SourcesTab />}
          {tab === 'need' && <NeedTab />}
          {tab === 'contradictions' && <ContradictionsTab />}
          {tab === 'blockers' && <BlockersTab />}
          {tab === 'handover' && <HandoverTab />}
          {tab === 'resolution' && <ResolutionTab />}
          {tab === 'repeats' && <RepeatsTab />}
          {tab === 'outcome' && <OutcomeTab />}
        </div>
      </div>
      <SourceViewer focus={focus} onClose={() => setFocus(null)} />
    </CaseContext.Provider>
  );
}
