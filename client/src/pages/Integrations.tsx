import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Inbox, Link2, MessageCircle, PlugZap, RefreshCw, Send, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { fmtDateTime } from '../lib/format';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Select, Spinner, Tabs, cx, errorMessage, useToast } from '../components/ui';

type Provider = 'WHATSAPP' | 'TELEGRAM';
interface IntegrationInfo {
  provider: Provider;
  enabled: boolean;
  config: Record<string, string | null>;
  lastEventAt: string | null;
  lastError: string | null;
}
interface InboxMessage {
  id: string;
  provider: Provider;
  fromId: string;
  fromName: string | null;
  text: string;
  receivedAt: string;
  status: 'NEW' | 'ATTACHED' | 'IGNORED';
  suggestedCase: { id: string; title: string; customerName: string } | null;
  attachedCase: { id: string; title: string; customerName: string } | null;
}
interface CaseOption {
  id: string;
  title: string;
  status: string;
  customer: { name: string };
}

const FIELDS: Record<Provider, { key: string; secret?: boolean; required?: boolean }[]> = {
  WHATSAPP: [
    { key: 'phoneNumberId', required: true },
    { key: 'accessToken', secret: true, required: true },
    { key: 'verifyToken', required: true },
    { key: 'appSecret', secret: true },
  ],
  TELEGRAM: [{ key: 'botToken', secret: true, required: true }],
};

const BRAND: Record<Provider, { name: string; icon: ReactNode; chip: string }> = {
  WHATSAPP: { name: 'WhatsApp Business', icon: <MessageCircle className="h-5 w-5" />, chip: 'bg-emerald-50 text-emerald-600' },
  TELEGRAM: { name: 'Telegram', icon: <Send className="h-5 w-5" />, chip: 'bg-sky-50 text-sky-600' },
};

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-slate-100 px-2 py-1.5 text-xs text-slate-700">{value}</code>
        <Button
          size="sm"
          variant="secondary"
          aria-label={t('integrations.copy')}
          icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked: the value is visible and selectable */
            }
          }}
        />
      </div>
    </div>
  );
}

function IntegrationCard({ info, isAdmin }: { info: IntegrationInfo; isAdmin: boolean }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const brand = BRAND[info.provider];
  const [form, setForm] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const origin = window.location.origin;
  const webhookUrl = `${origin}/api/webhooks/${info.provider.toLowerCase()}`;

  const save = useMutation({
    mutationFn: (enabled: boolean) => api.put(`/integrations/${info.provider.toLowerCase()}`, { enabled, config: form }),
    onSuccess: () => {
      setForm({});
      toast(t('common.saved'));
      qc.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string }>(`/integrations/${info.provider.toLowerCase()}/test`),
    onSuccess: setTestResult,
  });
  const sync = useMutation({
    mutationFn: () => api.post<{ fetched: number; created: number }>('/integrations/telegram/sync'),
    onSuccess: (r) => {
      toast(t('integrations.synced', { n: r.created }));
      qc.invalidateQueries({ queryKey: ['integrations'] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(true);
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2.5">
          <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg', brand.chip)}>{brand.icon}</span>
          {brand.name}
        </span>
      }
      actions={<Badge tone={info.enabled ? 'green' : 'slate'}>{info.enabled ? t('integrations.connected') : t('integrations.disconnected')}</Badge>}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t(`integrations.${info.provider}.intro`)}</p>

        {info.lastError && <Alert tone="danger">{info.lastError}</Alert>}
        {info.lastEventAt && (
          <p className="text-xs text-slate-500">
            {t('integrations.lastEvent')}: {fmtDateTime(info.lastEventAt, locale)}
          </p>
        )}

        {isAdmin ? (
          <form onSubmit={submit} className="space-y-3" noValidate>
            {save.error && <Alert tone="danger">{errorMessage(save.error, t)}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS[info.provider].map((f) => (
                <Field key={f.key} label={t(`integrations.fields.${f.key}`)} required={f.required} hint={info.config[f.key] ? t('integrations.keepHint', { value: info.config[f.key]! }) : undefined}>
                  {(id) => (
                    <Input
                      id={id}
                      type={f.secret ? 'password' : 'text'}
                      autoComplete="off"
                      value={form[f.key] ?? ''}
                      placeholder={info.config[f.key] ?? ''}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  )}
                </Field>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" icon={<PlugZap className="h-4 w-4" />} loading={save.isPending && save.variables === true}>
                {info.enabled ? t('common.save') : t('integrations.connect')}
              </Button>
              {info.enabled && (
                <>
                  <Button variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
                    {t('integrations.test')}
                  </Button>
                  <Button variant="ghost" loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>
                    {t('integrations.disconnect')}
                  </Button>
                </>
              )}
            </div>
            {testResult && <Alert tone={testResult.ok ? 'success' : 'danger'}>{testResult.message || (testResult.ok ? t('integrations.testOk') : '')}</Alert>}
          </form>
        ) : (
          <Alert tone="info">{t('integrations.adminOnly')}</Alert>
        )}

        {info.provider === 'WHATSAPP' && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <CopyField label={t('integrations.webhookUrl')} value={webhookUrl} />
            <p className="text-xs text-slate-500">{t('integrations.WHATSAPP.webhookHint')}</p>
          </div>
        )}
        {info.provider === 'TELEGRAM' && info.enabled && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="min-w-0 flex-1 text-xs text-slate-500">{t('integrations.TELEGRAM.pollHint')}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={sync.isPending} onClick={() => sync.mutate()}>
              {t('integrations.syncNow')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function InboxRow({ m, cases }: { m: InboxMessage; cases: CaseOption[] }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [caseId, setCaseId] = useState(m.suggestedCase?.id ?? '');
  const done = () => {
    qc.invalidateQueries({ queryKey: ['inbox'] });
    qc.invalidateQueries({ queryKey: ['integrations'] });
  };
  const attach = useMutation({
    mutationFn: () => api.post(`/integrations/inbox/${m.id}/attach`, { caseId }),
    onSuccess: () => {
      toast(t('integrations.attached'));
      done();
    },
  });
  const ignore = useMutation({ mutationFn: () => api.post(`/integrations/inbox/${m.id}/ignore`), onSuccess: done });
  const brand = BRAND[m.provider];
  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', brand.chip)}>{brand.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-slate-900">{m.fromName ?? m.fromId}</span>
            {m.fromName && <span className="text-xs text-slate-500">{m.fromId}</span>}
            <span className="text-xs text-slate-400">· {fmtDateTime(m.receivedAt, locale)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{m.text}</p>
          {m.attachedCase && (
            <Link to={`/cases/${m.attachedCase.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline">
              <Link2 className="h-3.5 w-3.5" aria-hidden /> {m.attachedCase.customerName}: {m.attachedCase.title}
            </Link>
          )}
        </div>
      </div>
      {m.status === 'NEW' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:pl-12">
          {(attach.error || ignore.error) && <Alert tone="danger">{errorMessage(attach.error ?? ignore.error, t)}</Alert>}
          <Select className="sm:max-w-sm" value={caseId} onChange={(e) => setCaseId(e.target.value)} aria-label={t('integrations.chooseCase')}>
            <option value="">{t('integrations.chooseCase')}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer.name}: {c.title}
                {c.id === m.suggestedCase?.id ? ` — ${t('integrations.suggested')}` : ''}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button size="sm" icon={<Link2 className="h-3.5 w-3.5" />} disabled={!caseId} loading={attach.isPending} onClick={() => attach.mutate()}>
              {t('integrations.attach')}
            </Button>
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} loading={ignore.isPending} onClick={() => ignore.mutate()}>
              {t('integrations.ignore')}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function InboxCard() {
  const { t } = useI18n();
  const [status, setStatus] = useState<'NEW' | 'ATTACHED' | 'IGNORED'>('NEW');
  const inbox = useQuery({
    queryKey: ['inbox', status],
    queryFn: () => api.get<{ messages: InboxMessage[] }>(`/integrations/inbox?status=${status}`),
    refetchInterval: status === 'NEW' ? 15_000 : false,
  });
  const cases = useQuery({ queryKey: ['cases', 'open'], queryFn: () => api.get<{ cases: CaseOption[] }>('/cases'), staleTime: 30_000 });
  const openCases = (cases.data?.cases ?? []).filter((c) => c.status !== 'CLOSED');
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-indigo-600" aria-hidden /> {t('integrations.inbox')}
        </span>
      }
    >
      <div className="space-y-4">
        <Tabs
          tabs={[
            { id: 'NEW' as const, label: t('integrations.status.NEW') },
            { id: 'ATTACHED' as const, label: t('integrations.status.ATTACHED') },
            { id: 'IGNORED' as const, label: t('integrations.status.IGNORED') },
          ]}
          value={status}
          onChange={setStatus}
        />
        {inbox.isLoading ? (
          <Spinner />
        ) : inbox.error ? (
          <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} />
        ) : inbox.data!.messages.length === 0 ? (
          <EmptyState icon={<Inbox className="h-6 w-6 text-slate-400" />}>{t('integrations.emptyInbox')}</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {inbox.data!.messages.map((m) => (
              <InboxRow key={m.id} m={m} cases={openCases} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function IntegrationsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => api.get<{ integrations: IntegrationInfo[]; newCount: number }>('/integrations') });
  return (
    <div className="space-y-6">
      <PageHeader title={t('integrations.title')} subtitle={t('integrations.subtitle')} />
      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data!.integrations.map((i) => (
            <IntegrationCard key={i.provider} info={i} isAdmin={user?.role === 'ADMIN'} />
          ))}
        </div>
      )}
      <InboxCard />
    </div>
  );
}
