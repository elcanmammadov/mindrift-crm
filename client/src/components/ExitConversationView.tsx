import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { fmtDateTime } from '../lib/format';
import type { ExitConversation } from '../lib/types';
import { Badge, cx } from './ui';

const strengthTone = (s: string) => (s === 'STRONG' ? 'red' : s === 'MEDIUM' ? 'amber' : 'slate') as 'red' | 'amber' | 'slate';

/** Exit conversation: the customer's own words are always shown separately from AI hypotheses. */
export function ExitConversationView({ conv, caseTitles = {} }: { conv: ExitConversation; caseTitles?: Record<string, string> }) {
  const { t, te, locale } = useI18n();
  const s = conv.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone={conv.status === 'COMPLETED' ? 'green' : conv.status === 'SKIPPED' ? 'slate' : 'blue'}>{te('insights.convStatus', conv.status)}</Badge>
        <span>{fmtDateTime(conv.createdAt, locale)}</span>
        {conv.summaryOrigin && <Badge tone={conv.summaryOrigin === 'REAL_AI' ? 'green' : 'amber'}>{te('origin', conv.summaryOrigin)}</Badge>}
        {conv.consent && (
          <Badge tone={conv.consent.wantsUpdates ? 'brand' : 'slate'}>
            {t('customers.consent')}: {conv.consent.wantsUpdates ? t('common.yes') : t('common.no')}
          </Badge>
        )}
      </div>
      {s && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('insights.stated')}</h4>
            <ul className="space-y-2">
              {s.statedReasons.map((r, i) => (
                <li key={i} className="border-l-2 border-brand-300 pl-2 text-sm text-slate-800">
                  “{r}”
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-dashed border-slate-300 bg-violet-50/40 p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">{t('insights.hypotheses')}</h4>
            <ul className="space-y-2">
              {s.aiHypotheses.map((h, i) => (
                <li key={i} className="text-sm text-slate-800">
                  <Badge tone={strengthTone(h.strength)} className="mr-1">
                    {te('finding.strength', h.strength)}
                  </Badge>
                  {h.text}
                  {h.relatedCaseIds.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {h.relatedCaseIds.map((id) => (
                        <Link key={id} to={`/cases/${id}`} className="rounded bg-white px-1.5 py-0.5 text-xs text-brand-700 ring-1 ring-slate-200 hover:underline">
                          {caseTitles[id] ?? t('insights.relatedCases')}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <dl className="grid gap-2 text-sm md:col-span-2 md:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">{t('insights.coreProblem')}</dt>
              <dd className="text-slate-800">{s.coreProblem ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('insights.service')}</dt>
              <dd className="text-slate-800">{s.affectedService ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('insights.fix')}</dt>
              <dd className="text-slate-800">{s.possibleFix ?? '—'}</dd>
            </div>
          </dl>
          {s.missing.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-500 md:col-span-2">
              {s.missing.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">{t('insights.conversation')}</summary>
        <ol className="mt-3 space-y-2">
          {conv.messages.map((m, i) => (
            <li key={i} className={cx('max-w-[85%] rounded-lg px-3 py-2 text-sm', m.role === 'customer' ? 'ml-auto bg-brand-600 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200')}>
              {m.text}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
