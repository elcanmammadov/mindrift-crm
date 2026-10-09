import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Alert, Badge, Button, Card, ErrorState, Field, Input, PageHeader, Select, Spinner, errorMessage, useToast } from '../components/ui';
import { useSettings } from '../components/Layout';
import { useUsers } from './CustomerDetail';

export function SettingsPage() {
  const { t, te } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const s = useSettings();
  const users = useUsers();
  const isAdmin = user?.role === 'ADMIN';
  const [testResult, setTestResult] = useState<{ ok: boolean; tested: boolean; message?: string; model?: string; ms?: number } | null>(null);
  const [nu, setNu] = useState({ name: '', email: '', password: '', role: 'AGENT' });

  const err = (e: unknown) => toast(errorMessage(e, t), 'danger');
  const setMode = useMutation({
    mutationFn: (mode: 'DEMO' | 'REAL') => api.put('/settings/ai-mode', { mode }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast(t('common.saved'));
    },
    onError: err,
  });
  const test = useMutation({ mutationFn: () => api.post<NonNullable<typeof testResult>>('/settings/test-ai'), onSuccess: setTestResult, onError: err });
  const addUser = useMutation({
    mutationFn: () => api.post('/users', nu),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setNu({ name: '', email: '', password: '', role: 'AGENT' });
      toast(t('common.saved'));
    },
    onError: err,
  });

  if (s.isLoading) return <Spinner />;
  if (s.error) return <ErrorState error={s.error} onRetry={() => s.refetch()} />;
  const d = s.data!;
  const submitUser = (e: FormEvent) => {
    e.preventDefault();
    addUser.mutate();
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('settings.title')} />
      <div className="grid gap-4">
        <Card title={t('settings.aiMode')}>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={d.aiMode === 'REAL' ? 'green' : 'amber'} className="text-sm">
                {t(`mode.${d.aiMode}`)}
              </Badge>
            </div>
            <dl className="space-y-1">
              <div>
                <dt className="inline text-slate-500">{t('settings.apiKey')}: </dt>
                <dd className="inline">{d.hasApiKey ? t('settings.configured') : t('settings.missing')}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">{t('settings.model')}: </dt>
                <dd className="inline font-mono">{d.model}</dd>
              </div>
            </dl>
            <p className="text-xs text-slate-500">{t('settings.keyNote')}</p>
            <p className="text-xs text-slate-500">{t('settings.modesExplained')}</p>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                {d.aiMode === 'DEMO' ? (
                  <Button size="sm" disabled={!d.hasApiKey} loading={setMode.isPending} onClick={() => setMode.mutate('REAL')}>
                    {t('settings.switchReal')}
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" loading={setMode.isPending} onClick={() => setMode.mutate('DEMO')}>
                    {t('settings.switchDemo')}
                  </Button>
                )}
                <Button size="sm" variant="secondary" icon={<FlaskConical className="h-4 w-4" />} loading={test.isPending} onClick={() => test.mutate()}>
                  {t('settings.test')}
                </Button>
              </div>
            )}
            {testResult && (
              <Alert tone={testResult.ok ? 'success' : testResult.tested ? 'danger' : 'warning'} title={testResult.ok ? t('settings.testOk') : t('settings.testNotRun')}>
                {testResult.ok ? `${testResult.model} · ${testResult.ms} ms` : testResult.message}
              </Alert>
            )}
          </div>
        </Card>
      </div>
      <Card title={t('settings.users')}>
        <ul className="divide-y divide-slate-100 text-sm">
          {users.data?.users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                {u.name} <span className="break-all text-slate-500">· {u.email}</span>
              </span>
              <Badge tone={u.role === 'ADMIN' ? 'brand' : 'slate'}>{te('settings.roles', u.role)}</Badge>
            </li>
          ))}
        </ul>
        {isAdmin && (
          <form onSubmit={submitUser} className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={t('common.name')} required>
              {(id) => <Input id={id} value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} required minLength={2} />}
            </Field>
            <Field label={t('login.email')} required>
              {(id) => <Input id={id} type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required />}
            </Field>
            <Field label={t('login.password')} required hint="≥ 8">
              {(id) => <Input id={id} type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} required minLength={8} />}
            </Field>
            <Field label={t('settings.role')}>
              {(id) => (
                <Select id={id} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
                  <option value="AGENT">{te('settings.roles', 'AGENT')}</option>
                  <option value="ADMIN">{te('settings.roles', 'ADMIN')}</option>
                </Select>
              )}
            </Field>
            <div className="flex items-end">
              <Button type="submit" icon={<UserPlus className="h-4 w-4" />} loading={addUser.isPending} disabled={nu.name.length < 2 || !nu.email || nu.password.length < 8}>
                {t('settings.addUser')}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
