import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { fmtDateTime } from '../lib/format';
import type { AnalysisRun } from '../lib/types';
import { Badge, Button, cx } from './ui';

/** Shows how and when a module's results were produced (mode, model, time, notes, failures). */
export function RunInfo({ run, onRetry, retrying }: { run?: AnalysisRun; onRetry?: () => void; retrying?: boolean }) {
  const { t, te, locale } = useI18n();
  if (!run) return <p className="text-xs text-slate-500">{t('run.never')}</p>;
  const notes = run.notes ?? [];
  return (
    <div className={cx('rounded-lg border px-3 py-2 text-xs', run.status === 'FAILED' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
        <span className="font-medium text-slate-700">{t('run.title')}:</span>
        <Badge tone={run.mode === 'REAL_AI' ? 'green' : run.mode === 'MOCK' ? 'slate' : 'amber'}>{te('origin', run.mode)}</Badge>
        {run.model && (
          <span>
            {t('run.model')}: <span className="font-mono">{run.model}</span>
          </span>
        )}
        <span>
          {t('run.at')}: {fmtDateTime(run.finishedAt ?? run.startedAt, locale)}
        </span>
        <span>
          {t('run.sources')}: {run.sourceSnapshot.length}
        </span>
      </div>
      {run.status === 'FAILED' && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-red-800">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {t('run.failed')}: {run.error?.code ? t(`errors.${run.error.code}`) : ''} {run.error?.message}
          </span>
          {onRetry && (run.error?.retryable ?? true) && (
            <Button size="sm" variant="secondary" onClick={onRetry} loading={retrying}>
              {t('common.retry')}
            </Button>
          )}
        </div>
      )}
      {run.truncated && <div className="mt-1.5 font-medium text-amber-800">⚠ {t('run.truncated')}</div>}
      {notes.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {notes.map((n, i) => (
            <li key={i} className={n.level === 'warning' ? 'text-amber-800' : 'text-slate-600'}>
              {n.level === 'warning' ? '⚠ ' : '• '}
              {locale === 'en' && n.textEn ? n.textEn : n.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
