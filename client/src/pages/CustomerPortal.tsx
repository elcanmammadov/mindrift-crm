import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Send, XCircle } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { ExitMessage } from '../lib/types';
import { Alert, Button, Spinner, Textarea, cx, errorMessage } from '../components/ui';
import { Brand, LanguageSwitch } from '../components/Layout';

interface PortalData {
  purpose: 'CONFIRMATION' | 'EXIT';
  customerName: string;
  caseTitle: string;
  criteria?: { id: string; description: string; requiresCustomerConfirmation: boolean }[];
  answered?: { outcome: string; note: string | null } | null;
  conversation?: { id: string; status: string; messages: ExitMessage[]; wantsUpdates: boolean | null } | null;
  maxQuestions?: number;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          {/* The customer only has access to this page, so the logo leads back to its top. */}
          <Brand to={pathname} light />
          <LanguageSwitch />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-2xl px-4 pb-6 text-center text-xs text-slate-400">{t('portal.limitedAccess')}</footer>
    </div>
  );
}

function Confirmation({ token, data }: { token: string; data: PortalData }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<'RESOLVED' | 'PROBLEM_REMAINS' | null>(null);
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: () => api.post(`/public/${token}/confirm`, { outcome, note: note || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', token] }),
  });
  if (data.answered) return <Alert tone={send.isSuccess ? 'success' : 'info'}>{send.isSuccess ? t('portal.thanks') : t('portal.already')}</Alert>;
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 className="text-lg font-semibold">{t('portal.confirmTitle')}</h1>
      <p className="text-sm text-slate-600">{t('portal.confirmIntro', { customer: data.customerName, case: data.caseTitle })}</p>
      {data.criteria && data.criteria.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-700">{t('portal.criteria')}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {data.criteria.map((c) => (
              <li key={c.id}>{c.description}</li>
            ))}
          </ul>
        </div>
      )}
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">{t('portal.confirmTitle')}</legend>
        {(['RESOLVED', 'PROBLEM_REMAINS'] as const).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={outcome === o}
            onClick={() => setOutcome(o)}
            className={cx(
              'flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium',
              outcome === o ? (o === 'RESOLVED' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-red-600 bg-red-50 text-red-800') : 'border-slate-200 text-slate-700 hover:border-slate-300',
            )}
          >
            {o === 'RESOLVED' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {o === 'RESOLVED' ? t('portal.resolved') : t('portal.remains')}
          </button>
        ))}
      </fieldset>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('portal.notePlaceholder')} aria-label={t('common.note')} />
      {send.error && <Alert tone="danger">{errorMessage(send.error, t)}</Alert>}
      <Button className="w-full sm:w-auto" disabled={!outcome} loading={send.isPending} onClick={() => send.mutate()}>
        {t('portal.submit')}
      </Button>
    </div>
  );
}

function ExitChat({ token, data }: { token: string; data: PortalData }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [consent, setConsent] = useState<boolean | null | undefined>(undefined);
  const [ended, setEnded] = useState<'COMPLETED' | 'SKIPPED' | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const conv = data.conversation;
  const refresh = () => qc.invalidateQueries({ queryKey: ['portal', token] });
  const start = useMutation({ mutationFn: () => api.post(`/public/${token}/exit/start`, { locale }), onSuccess: refresh });
  const send = useMutation({
    mutationFn: (skip: boolean) => api.post<{ done: boolean }>(`/public/${token}/exit/message`, { text: skip ? '' : text, skip, locale }),
    onSuccess: () => {
      setText('');
      refresh();
    },
  });
  const finish = useMutation({
    mutationFn: (declined: boolean) => api.post<{ status: 'COMPLETED' | 'SKIPPED' }>(`/public/${token}/exit/finish`, { declined, wantsUpdates: consent ?? null }),
    onSuccess: (r) => {
      setEnded(r.status);
      refresh();
    },
  });
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [conv?.messages.length]);

  if (ended || (conv && conv.status !== 'ACTIVE')) {
    const declined = (ended ?? conv?.status) === 'SKIPPED';
    return <Alert tone="success">{declined ? t('portal.exitDeclined') : t('portal.exitDone')}</Alert>;
  }
  if (!conv) {
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h1 className="text-lg font-semibold">{t('portal.exitTitle')}</h1>
        <p className="text-sm text-slate-600">{t('portal.exitIntro', { n: data.maxQuestions ?? 4 })}</p>
        {start.error && <Alert tone="danger">{errorMessage(start.error, t)}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button loading={start.isPending} onClick={() => start.mutate()}>
            {t('portal.start')}
          </Button>
        </div>
      </div>
    );
  }
  const last = conv.messages[conv.messages.length - 1];
  const awaitingAnswer = last?.role === 'assistant' && conv.messages.filter((m) => m.role === 'assistant').length > 1;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="mb-3 text-lg font-semibold">{t('portal.exitTitle')}</h1>
        <ol className="space-y-2" aria-live="polite">
          {conv.messages.map((m, i) => (
            <li key={i} className={cx('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm', m.role === 'customer' ? 'ml-auto bg-brand-600 text-white' : 'bg-slate-100 text-slate-800')}>
              {m.text}
            </li>
          ))}
        </ol>
        <div ref={endRef} />
        {awaitingAnswer && (
          <form
            className="mt-4 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send.mutate(false);
            }}
          >
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('portal.answer')} aria-label={t('portal.answer')} rows={3} />
            {send.error && <Alert tone="danger">{errorMessage(send.error, t)}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" icon={<Send className="h-4 w-4" />} loading={send.isPending && !!text} disabled={!text.trim()}>
                {t('portal.send')}
              </Button>
              <Button variant="secondary" onClick={() => send.mutate(true)} disabled={send.isPending}>
                {t('portal.skip')}
              </Button>
            </div>
          </form>
        )}
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <p className="text-sm font-medium text-slate-800">{t('portal.consentQ')}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {[
            { v: true, l: t('portal.consentYes') },
            { v: false, l: t('portal.consentNo') },
            { v: null, l: t('portal.consentSkip') },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={consent === o.v}
              onClick={() => setConsent(o.v)}
              className={cx('rounded-lg border px-3 py-1.5 text-sm', consent === o.v ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-700')}
            >
              {o.l}
            </button>
          ))}
        </div>
        {finish.error && <Alert tone="danger">{errorMessage(finish.error, t)}</Alert>}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <Button loading={finish.isPending} onClick={() => finish.mutate(false)}>
            {t('portal.finish')}
          </Button>
          <Button variant="ghost" onClick={() => finish.mutate(true)} disabled={finish.isPending}>
            {t('portal.decline')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Token-only page for customers: confirmation of a resolution or the voluntary exit conversation. */
export function CustomerPortalPage() {
  const { token = '' } = useParams();
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['portal', token], queryFn: () => api.get<PortalData>(`/public/${token}`), retry: false });
  return (
    <Shell>
      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <Alert tone="danger">{q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 410) ? t('portal.invalid') : errorMessage(q.error, t)}</Alert>
      ) : q.data!.purpose === 'CONFIRMATION' ? (
        <Confirmation token={token} data={q.data!} />
      ) : (
        <ExitChat token={token} data={q.data!} />
      )}
    </Shell>
  );
}
