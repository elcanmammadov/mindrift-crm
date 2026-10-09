import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { Customer } from '../lib/types';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, errorMessage, useToast } from '../components/ui';

const AVATAR = ['from-indigo-500 to-violet-600', 'from-pink-500 to-rose-600', 'from-amber-400 to-orange-500', 'from-emerald-500 to-teal-600', 'from-sky-500 to-blue-600', 'from-fuchsia-500 to-purple-600'];

export const customerTone = (s: string) => (s === 'ACTIVE' ? 'green' : s === 'CHURNED' ? 'red' : 'blue') as 'green' | 'red' | 'blue';

export function CustomerForm({ initial, onDone }: { initial?: Partial<Customer>; onDone: (c: Customer) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    industry: initial?.industry ?? '',
    contactName: initial?.contactName ?? '',
    contactEmail: initial?.contactEmail ?? '',
    phone: initial?.phone ?? '',
    status: initial?.status ?? 'PROSPECT',
    notes: initial?.notes ?? '',
  });
  const [touched, setTouched] = useState(false);
  const nameError = touched && form.name.trim().length < 2 ? t('common.required') : undefined;
  const emailError = touched && form.contactEmail && !/^\S+@\S+\.\S+$/.test(form.contactEmail) ? 'E-mail' : undefined;
  const m = useMutation({
    mutationFn: () =>
      initial?.id
        ? api.patch<{ customer: Customer }>(`/customers/${initial.id}`, form)
        : api.post<{ customer: Customer }>('/customers', form),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer'] });
      toast(t('common.saved'));
      onDone(r.customer);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (form.name.trim().length < 2 || emailError) return;
    m.mutate();
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {m.error && <Alert tone="danger">{errorMessage(m.error, t)}</Alert>}
      <Field label={t('common.name')} required error={nameError}>
        {(id) => <Input id={id} value={form.name} onChange={set('name')} aria-invalid={!!nameError} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('customers.industry')}>{(id) => <Input id={id} value={form.industry} onChange={set('industry')} />}</Field>
        <Field label={t('common.status')}>
          {(id) => (
            <Select id={id} value={form.status} onChange={set('status')}>
              {['PROSPECT', 'ACTIVE', 'CHURNED'].map((s) => (
                <option key={s} value={s}>
                  {t(`customers.status.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('customers.contactName')}>{(id) => <Input id={id} value={form.contactName} onChange={set('contactName')} />}</Field>
        <Field label={t('customers.contactEmail')} error={emailError}>
          {(id) => <Input id={id} type="email" value={form.contactEmail} onChange={set('contactEmail')} aria-invalid={!!emailError} />}
        </Field>
        <Field label={t('customers.phone')}>{(id) => <Input id={id} value={form.phone} onChange={set('phone')} />}</Field>
      </div>
      <Field label={t('customers.notes')}>{(id) => <Textarea id={id} value={form.notes} onChange={set('notes')} />}</Field>
      <div className="flex justify-end">
        <Button type="submit" loading={m.isPending}>
          {initial?.id ? t('common.save') : t('common.create')}
        </Button>
      </div>
    </form>
  );
}

export function CustomersPage() {
  const { t, te } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ['customers', q, status],
    queryFn: () => api.get<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(q)}&status=${status}`),
    placeholderData: (prev) => prev,
  });
  return (
    <div>
      <PageHeader
        title={t('customers.title')}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            {t('customers.new')}
          </Button>
        }
      />
      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <Input className="pl-9" placeholder={t('customers.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
          </div>
          <Select className="sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('common.status')}>
            <option value="">{t('common.all')}</option>
            {['PROSPECT', 'ACTIVE', 'CHURNED'].map((s) => (
              <option key={s} value={s}>
                {te('customers.status', s)}
              </option>
            ))}
          </Select>
        </div>
        {list.isLoading ? (
          <Spinner />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.customers.length === 0 ? (
          <EmptyState>{t('customers.noResults')}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('common.name')}</th>
                  <th className="hidden py-2 pr-3 font-medium sm:table-cell">{t('customers.industry')}</th>
                  <th className="hidden py-2 pr-3 font-medium md:table-cell">{t('customers.contactName')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.status')}</th>
                  <th className="py-2 font-medium">{t('customers.cases')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data!.customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3">
                      <Link to={`/customers/${c.id}`} className="flex items-center gap-2.5 font-medium text-indigo-800 hover:underline">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow ${AVATAR.at(c.name.length % AVATAR.length)}`} aria-hidden>
                          {c.name.slice(0, 1)}
                        </span>
                        {c.name}
                      </Link>
                    </td>
                    <td className="hidden py-2.5 pr-3 text-slate-600 sm:table-cell">{c.industry ?? '—'}</td>
                    <td className="hidden py-2.5 pr-3 text-slate-600 md:table-cell">{c.contactName ?? '—'}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={customerTone(c.status)}>{te('customers.status', c.status)}</Badge>
                    </td>
                    <td className="py-2.5 tabular-nums text-slate-600">
                      {c.caseCount} <span className="text-xs text-slate-400">({c.openCaseCount} {t('customers.openCases')})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title={t('customers.new')}>
        <CustomerForm onDone={(c) => nav(`/customers/${c.id}`)} />
      </Modal>
    </div>
  );
}
