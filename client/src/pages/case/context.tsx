import { createContext, useContext } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import type { CaseBundle, EvidenceItem } from '../../lib/types';
import { errorMessage, useToast } from '../../components/ui';

export interface SourceFocus {
  sourceId: string;
  evidence?: Pick<EvidenceItem, 'quote' | 'startOffset' | 'endOffset' | 'sourceVersion'>;
}

export interface CaseCtx {
  bundle: CaseBundle;
  caseId: string;
  openSource: (f: SourceFocus) => void;
}

export const CaseContext = createContext<CaseCtx | null>(null);

export function useCase() {
  const c = useContext(CaseContext);
  if (!c) throw new Error('useCase outside CaseContext');
  return c;
}

/** Re-runs case analysis; unchanged modules are skipped by the server, failed ones are retried. */
export function useRetryAnalysis() {
  const { caseId } = useCase();
  const { t } = useI18n();
  return useCaseAction(() => api.post(`/cases/${caseId}/analyze`, {}), { success: t('case.analysisResult.SUCCEEDED') });
}

/**
 * Mutation that refreshes the case (and dashboard numbers) on success and shows
 * a toast for both outcomes, so every button gives visible feedback.
 */
export function useCaseAction<TVars = void, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, opts: { success?: string; onSuccess?: (r: TRes) => void } = {}) {
  const { caseId } = useCase();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['case', caseId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['board'] });
      if (opts.success !== '') toast(opts.success ?? t('common.saved'));
      opts.onSuccess?.(r);
    },
    onError: (e) => toast(errorMessage(e, t), 'danger'),
  });
}
