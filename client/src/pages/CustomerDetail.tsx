import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, LogOut as ExitIcon, Pencil, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { fmtDate } from '../lib/format';
import type { CaseRow, Customer, ExitConversation, User } from '../lib/types';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, errorMessage, useToast } from '../components/ui';
import { CustomerForm, customerTone } from './Customers';
import { ExitConversationView } from '../components/ExitConversationView';
import { caseStatusTone, salesTone } from './CaseDetail';

export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => api.get<{ users: User[] }>('/users'), staleTime: 60_000 });

function NewCaseForm({ customerId, onDone }: { customerId: string; onDone: (c: CaseRow) => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const users = useUsers();
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: '', initialRequest: '', coreNeed: '', ownerId: user?.id ?? '' });
  const [touched, setTouched] = useState(false);
  const errs = {
    title: touched && form.title.trim().length < 3 ? t('common.required') : undefined,
    initialRequest: touched && form.initialRequest.trim().length < 3 ? t('common.required') : undefined,
  };
  const m = useMutation({
    mutationFn: () => api.post<{ case: CaseRow }>('/cases', { customerId, ...form, coreNeed: form.coreNeed || null }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      onDone(r.case);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (form.title.trim().length < 3 || form.initialRequest.trim().length < 3) return;
    m.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {m.error && <Alert tone="danger">{errorMessage(m.error, t)}</Alert>}
      <Field label={t('caseForm.title')} required error={errs.title}>
        {(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-invalid={!!errs.title} />}
      </Field>
      <Field label={t('caseForm.initialRequest')} required error={errs.initialRequest}>
        {(id) => <Textarea id={id} value={form.initialRequest} onChange={(e) => setForm({ ...form, initialRequest: e.target.value })} aria-invalid={!!errs.initialRequest} />}
      </Field>
      <Field label={`${t('caseForm.coreNeed')} (${t('common.optional')})`}>
        {(id) => <Textarea id={id} value={form.coreNeed} onChange={(e) => setForm({ ...form, coreNeed: e.target.value })} />}
      </Field>
      {user?.role === 'ADMIN' && (
        <Field label={t('caseForm.owner')}>
          {(id) => (
            <Select id={id} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
              {users.data?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={m.isPending}>
          {t('common.create')}
        </Button>
      </div>
    </form>
  );
}

export function CopyLink({ url, hint }: { url: string; hint: string }) {
  const { t } = useI18n();
  const toast = useToast();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="URL" />
        <Button
          variant="secondary"
          icon={<Copy className="h-4 w-4" />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast(t('common.copied'));
            } catch {
              /* clipboard blocked: the field is selectable */
            }
          }}
        >
          {t('common.copy')}
        </Button>
      </div>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { t, te, locale } = useI18n();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [newCase, setNewCase] = useState(false);
  const [exitUrl, setExitUrl] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get<{ customer: Customer; cases: CaseRow[]; exitConversations: ExitConversation[] }>(`/customers/${id}`),
  });
  const exitLink = useMutation({
    mutationFn: () => api.post<{ url: string }>(`/customers/${id}/exit-link`),
    onSuccess: (r) => setExitUrl(r.url),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { customer, cases, exitConversations } = q.data!;
  const caseTitles = Object.fromEntries(cases.map((c) => [c.id, c.title]));
  return (
    <div className="space-y-4">
      <PageHeader
        title={customer.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={customerTone(customer.status)}>
              {t('case.customerStatusLabel')}: {te('customers.status', customer.status)}
            </Badge>
            {customer.industry && <span>{customer.industry}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
            <Button variant="secondary" icon={<ExitIcon className="h-4 w-4" />} onClick={() => exitLink.mutate()} loading={exitLink.isPending} disabled={cases.length === 0}>
              {t('customers.exitLink')}
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewCase(true)}>
              {t('customers.newCase')}
            </Button>
          </>
        }
      />
      {exitLink.error && <Alert tone="danger">{errorMessage(exitLink.error, t)}</Alert>}
      {exitUrl && (
        <Card title={t('customers.exitLink')}>
          <CopyLink url={exitUrl} hint={t('customers.exitLinkHint')} />
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('customers.profile')}>
          <dl className="space-y-2 text-sm">
            {(
              [
                ['customers.contactName', customer.contactName],
                ['customers.contactEmail', customer.contactEmail],
                ['customers.phone', customer.phone],
                ['customers.notes', customer.notes],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{t(k)}</dt>
                <dd className="whitespace-pre-wrap text-slate-800">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title={t('customers.cases')} className="lg:col-span-2">
          {cases.length === 0 ? (
            <EmptyState>{t('common.empty')}</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/cases/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {fmtDate(c.createdAt, locale)} · {c.owner?.name ?? t('case.noOwner')}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={caseStatusTone(c.status)}>{te('case.status', c.status)}</Badge>
                    <Badge tone={salesTone(c.salesOutcome)}>{te('case.sales', c.salesOutcome)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {exitConversations.length > 0 && (
        <Card title={t('customers.exitConversations')}>
          <div className="space-y-6">
            {exitConversations.map((c) => (
              <ExitConversationView key={c.id} conv={c} caseTitles={caseTitles} />
            ))}
          </div>
        </Card>
      )}
      <Modal open={editing} onClose={() => setEditing(false)} title={t('common.edit')}>
        <CustomerForm initial={customer} onDone={() => setEditing(false)} />
      </Modal>
      <Modal open={newCase} onClose={() => setNewCase(false)} title={t('customers.newCase')}>
        <NewCaseForm customerId={customer.id} onDone={(c) => nav(`/cases/${c.id}`)} />
      </Modal>
    </div>
  );
}
