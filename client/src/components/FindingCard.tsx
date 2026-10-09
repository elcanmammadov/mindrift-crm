import { useState, type ReactNode } from 'react';
import { Check, Quote, RotateCcw, X } from 'lucide-react';
import { api } from '../lib/api';
import { findingText, useI18n } from '../lib/i18n';
import { fmtDate } from '../lib/format';
import type { EvidenceItem, Finding } from '../lib/types';
import { useCase, useCaseAction } from '../pages/case/context';
import { Badge, Button, Input, cx } from './ui';

const strengthTone = { STRONG: 'green', MEDIUM: 'amber', WEAK: 'slate' } as const;
const reviewTone = { PENDING: 'slate', CONFIRMED: 'brand', REJECTED: 'red', RESOLVED: 'green' } as const;
const moduleStripe: Record<string, string> = {
  BRIDGE: 'border-l-sky-500',
  ONEVOICE: 'border-l-rose-500',
  UNBLOCK: 'border-l-amber-500',
  LOOP: 'border-l-violet-500',
  PROOFCLOSE: 'border-l-emerald-500',
  WHYLOST: 'border-l-orange-500',
  EXITLENS: 'border-l-fuchsia-500',
};

export function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  const { t, te, locale } = useI18n();
  const { openSource } = useCase();
  const [showUnverified, setShowUnverified] = useState(false);
  const verified = evidence.filter((e) => e.verified);
  const unverified = evidence.filter((e) => !e.verified);
  if (evidence.length === 0) return <p className="text-xs italic text-slate-500">{t('finding.noEvidence')}</p>;
  return (
    <div className="space-y-1.5">
      {verified.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => openSource({ sourceId: e.sourceId, evidence: e })}
          className="group block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50/50"
        >
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <Quote className="h-3 w-3" aria-hidden />
            {e.label && <Badge tone="violet">{t(`finding.side.${e.label}`)}</Badge>}
            <span className="font-medium text-slate-700 group-hover:text-brand-700">{e.sourceTitle}</span>
            {e.sourceType && <span>· {te('sources.types', e.sourceType)}</span>}
            {e.sourceAuthor && <span>· {e.sourceAuthor}</span>}
            {e.sourceDate && <span>· {fmtDate(e.sourceDate, locale)}</span>}
            {e.sourceChanged && <Badge tone="amber">{t('sources.changed')}</Badge>}
          </div>
          <div className="mt-1 text-sm text-slate-800">“{e.quote}”</div>
        </button>
      ))}
      {unverified.length > 0 && (
        <div>
          <button type="button" className="text-xs text-slate-500 underline" onClick={() => setShowUnverified(!showUnverified)}>
            {t('finding.unverified')} ({unverified.length})
          </button>
          {showUnverified && (
            <ul className="mt-1 space-y-1">
              {unverified.map((e) => (
                <li key={e.id} className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-400 line-through">
                  “{e.quote}”
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One AI / rule result. Always shows where it came from (origin), whether it is an
 * observation or an inference, the qualitative evidence strength and the human decision.
 */
export function FindingCard({ finding, actions, children, hideReview }: { finding: Finding; actions?: ReactNode; children?: ReactNode; hideReview?: boolean }) {
  const { t, te, locale } = useI18n();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const txt = findingText(finding, locale);
  const review = useCaseAction((v: { status: string; note?: string }) => api.post(`/findings/${finding.id}/review`, v));
  const done = finding.reviewStatus !== 'PENDING';
  return (
    <article className={cx('rounded-xl border border-l-4 bg-white p-4 shadow-sm', moduleStripe[finding.module], finding.stale ? 'border-dashed border-slate-300 opacity-75' : 'border-slate-200', finding.reviewStatus === 'REJECTED' && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{te('finding.kinds', finding.kind)}</Badge>
        <Badge tone={finding.epistemic === 'OBSERVED' ? 'blue' : 'violet'}>{finding.epistemic === 'OBSERVED' ? t('finding.observed') : t('finding.inferred')}</Badge>
        <Badge tone={strengthTone[finding.strength]} title={t('finding.strengthHint')}>
          {te('finding.strength', finding.strength)}
        </Badge>
        <Badge tone={finding.origin === 'REAL_AI' ? 'green' : 'amber'}>{te('origin', finding.origin)}</Badge>
        <Badge tone={reviewTone[finding.reviewStatus]}>{te('finding.review', finding.reviewStatus)}</Badge>
        {finding.stale && <Badge tone="amber">{t('finding.stale')}</Badge>}
      </div>
      <h3 className="mt-2 text-sm font-semibold text-slate-900">{txt.title}</h3>
      <p className="mt-1 text-sm text-slate-700">{txt.explanation}</p>
      {children && <div className="mt-2">{children}</div>}
      <div className="mt-3">
        <EvidenceList evidence={finding.evidence} />
      </div>
      {txt.suggestedAction && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
          <span className="font-medium">{t('finding.suggested')}:</span> {txt.suggestedAction}
        </p>
      )}
      {finding.reviewNote && <p className="mt-2 text-xs italic text-slate-500">{finding.reviewNote}</p>}
      {(!hideReview || actions) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {!hideReview &&
            (done ? (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={review.isPending} onClick={() => review.mutate({ status: 'PENDING' })}>
                {t('finding.reopen')}
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" icon={<Check className="h-3.5 w-3.5" />} loading={review.isPending} onClick={() => review.mutate({ status: 'CONFIRMED' })}>
                  {t('finding.confirm')}
                </Button>
                <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setRejecting(!rejecting)}>
                  {t('finding.reject')}
                </Button>
              </>
            ))}
          {actions}
        </div>
      )}
      {rejecting && !done && (
        <div className="mt-2 flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`${t('common.note')} (${t('common.optional')})`} aria-label={t('common.note')} />
          <Button size="sm" variant="danger" loading={review.isPending} onClick={() => review.mutate({ status: 'REJECTED', note: note || undefined }, { onSuccess: () => setRejecting(false) })}>
            {t('finding.reject')}
          </Button>
        </div>
      )}
    </article>
  );
}
