import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { ApiError } from '../lib/api';
import { Alert, Button, Field, Input } from '../components/ui';
import { Brand, LanguageSwitch } from '../components/Layout';


export function LoginPage() {
  const { t } = useI18n();
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      nav((loc.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      // Only a real 401 means wrong credentials; anything else (server down, proxy error) is reported as such.
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') setError(t('login.rateLimited'));
      else if (err instanceof ApiError && err.status === 401) setError(t('login.invalid'));
      else setError(t('login.serverDown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_0%_0%,rgba(99,102,241,0.35),transparent_60%),radial-gradient(60%_50%_at_100%_100%,rgba(236,72,153,0.18),transparent_60%)]" aria-hidden />
        <div className="relative">
          <Brand to="/login" />
        </div>
        <div className="relative max-w-md">
          <p className="text-2xl font-semibold leading-snug tracking-tight xl:text-3xl">{t('app.tagline')}</p>
        </div>
        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} Mindrift</p>
      </aside>

      <main className="flex flex-col px-4 py-6 sm:px-8 sm:py-10">
        <div className="flex items-center justify-between gap-3">
          <div className="lg:invisible">
            <Brand to="/login" light />
          </div>
          <LanguageSwitch />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('login.title')}</h1>
          <p className="mt-2 text-sm text-slate-500 lg:hidden">{t('app.tagline')}</p>
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label={t('login.email')} required>
              {(id) => <Input id={id} type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            </Field>
            <Field label={t('login.password')} required>
              {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
            </Field>
            <Button type="submit" className="w-full" loading={busy} disabled={!email || !password}>
              {t('login.submit')}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
