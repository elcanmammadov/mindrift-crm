import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fmtDateTime } from '../lib/format';
import type { Source } from '../lib/types';
import type { SourceFocus } from '../pages/case/context';
import { Alert, Badge, ErrorState, Modal, Spinner, cx } from './ui';

interface SourceDetail {
  source: Source;
  revisions: { id: string; version: number; content: string; createdAt: string }[];
  chunks: { id: string; version: number; index: number; startOffset: number; endOffset: number }[];
}

/** Locates a quote in text when stored offsets don't apply (e.g. a different version). */
function locate(text: string, quote: string): [number, number] | null {
  const idx = text.toLowerCase().indexOf(quote.toLowerCase());
  return idx >= 0 ? [idx, idx + quote.length] : null;
}

export function SourceViewer({ focus, onClose }: { focus: SourceFocus | null; onClose: () => void }) {
  const { t, te, locale } = useI18n();
  const q = useQuery({
    queryKey: ['source', focus?.sourceId],
    queryFn: () => api.get<SourceDetail>(`/sources/${focus!.sourceId}`),
    enabled: !!focus,
  });
  const [version, setVersion] = useState<number | null>(null);
  const markRef = useRef<HTMLElement>(null);

  // Show the version the evidence was recorded against, so the quote is always findable.
  useEffect(() => {
    setVersion(focus?.evidence?.sourceVersion ?? null);
  }, [focus]);

  const data = q.data;
  const shownVersion = version ?? data?.source.version ?? 1;
  const text = useMemo(() => {
    if (!data) return '';
    if (shownVersion === data.source.version) return data.source.content;
    return data.revisions.find((r) => r.version === shownVersion)?.content ?? data.source.content;
  }, [data, shownVersion]);

  const range = useMemo<[number, number] | null>(() => {
    const ev = focus?.evidence;
    if (!ev || !text) return null;
    if (ev.startOffset !== null && ev.endOffset !== null && ev.sourceVersion === shownVersion && text.slice(ev.startOffset, ev.endOffset).length > 0) {
      return [ev.startOffset, ev.endOffset];
    }
    return locate(text, ev.quote);
  }, [focus, text, shownVersion]);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: 'center' });
  }, [range, data]);

  const chunkCount = data?.chunks.filter((c) => c.version === shownVersion).length ?? 0;

  return (
    <Modal open={!!focus} onClose={onClose} title={data ? data.source.title : t('sources.viewer')} wide>
      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : data ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge tone="brand">{te('sources.types', data.source.type)}</Badge>
            <Badge tone={data.source.authorSide === 'CUSTOMER' ? 'blue' : 'slate'}>{te('sources.side', data.source.authorSide)}</Badge>
            <span>{data.source.author}</span>
            <span>· {fmtDateTime(data.source.occurredAt, locale)}</span>
            {data.source.packageRef && <Badge tone="violet">{data.source.packageRef}</Badge>}
            <span className="font-mono text-[11px] text-slate-400">ID {data.source.id}</span>
          </div>
          {data.source.origin === 'DEMO_IMPORT' && <Alert tone="info">{t('sources.importedNote', { channel: te('sources.types', data.source.type) })}</Alert>}
          {focus?.evidence && focus.evidence.sourceVersion !== data.source.version && <Alert tone="warning">{t('sources.changed')}</Alert>}
          {data.revisions.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500">{t('sources.history')}:</span>
              {data.revisions.map((r) => (
                <button
                  key={r.version}
                  type="button"
                  onClick={() => setVersion(r.version)}
                  className={cx('rounded px-2 py-0.5 ring-1', r.version === shownVersion ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}
                >
                  v{r.version} · {fmtDateTime(r.createdAt, locale)}
                </button>
              ))}
            </div>
          )}
          <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
            {range ? (
              <>
                {text.slice(0, range[0])}
                <mark ref={markRef} className="quote">
                  {text.slice(range[0], range[1])}
                </mark>
                {text.slice(range[1])}
              </>
            ) : (
              text
            )}
          </div>
          <div className="text-xs text-slate-400">
            v{shownVersion} · {chunkCount} {t('sources.chunks')}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
