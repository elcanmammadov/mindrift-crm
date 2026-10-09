import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, BarChart3, ClipboardList, LayoutDashboard, LogOut, Menu, PlugZap, Settings, Sparkles, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n, type Locale } from '../lib/i18n';
import { Badge, cx } from './ui';

export interface AppSettings {
  aiMode: 'REAL' | 'DEMO';
  hasApiKey: boolean;
  model: string;
  demoModeEnv: boolean;
  demoResetAllowed: boolean;
  maxInputChars: number;
}

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.get<AppSettings>('/settings'), staleTime: 30_000 });

export function LanguageSwitch({ className, dark }: { className?: string; dark?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className={cx('inline-flex rounded-lg p-0.5 text-xs', dark ? 'bg-white/10 ring-1 ring-white/10' : 'border border-slate-200 bg-white shadow-sm', className)}
      role="group"
      aria-label={t('common.language')}
    >
      {(['az', 'en'] as Locale[]).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale === l}
          onClick={() => setLocale(l)}
          className={cx(
            'rounded-md px-2.5 py-1 font-semibold uppercase transition-colors',
            locale === l ? (dark ? 'bg-white text-slate-900' : 'bg-indigo-600 text-white') : dark ? 'text-slate-300 hover:text-white' : 'text-slate-500 hover:text-slate-900',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function ModeBadge() {
  const { t } = useI18n();
  const s = useSettings();
  if (s.data?.aiMode !== 'REAL') return null;
  return (
    <Badge tone="green" title={s.data.model}>
      <Sparkles className="h-3 w-3" aria-hidden /> {t('mode.REAL')}
    </Badge>
  );
}

/** Number of incoming WhatsApp/Telegram messages nobody has handled yet (shown next to the menu item). */
const useNewMessages = () =>
  useQuery({ queryKey: ['integrations'], queryFn: () => api.get<{ newCount: number }>('/integrations'), refetchInterval: 30_000, select: (d) => d.newCount });

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const newMessages = useNewMessages().data ?? 0;
  const items: { to: string; label: string; icon: ReactNode; color: string; count?: number }[] = [
    { to: '/', label: t('nav.dashboard'), icon: <LayoutDashboard className="h-[18px] w-[18px]" />, color: 'text-sky-400' },
    { to: '/customers', label: t('nav.customers'), icon: <Users className="h-[18px] w-[18px]" />, color: 'text-emerald-400' },
    { to: '/board', label: t('nav.board'), icon: <ClipboardList className="h-[18px] w-[18px]" />, color: 'text-amber-400' },
    { to: '/handovers', label: t('nav.handovers'), icon: <ArrowLeftRight className="h-[18px] w-[18px]" />, color: 'text-rose-400' },
    { to: '/insights', label: t('nav.insights'), icon: <BarChart3 className="h-[18px] w-[18px]" />, color: 'text-violet-400' },
    { to: '/integrations', label: t('nav.integrations'), icon: <PlugZap className="h-[18px] w-[18px]" />, color: 'text-emerald-400', count: newMessages },
    { to: '/settings', label: t('nav.settings'), icon: <Settings className="h-[18px] w-[18px]" />, color: 'text-slate-400' },
  ];
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cx(
              'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-indigo-400" aria-hidden />}
              <span className={cx('shrink-0 transition-colors', isActive ? i.color : 'text-slate-500 group-hover:text-slate-300')}>{i.icon}</span>
              {i.label}
              {!!i.count && (
                <span className="ml-auto rounded-full bg-emerald-500 px-1.5 py-px text-xs font-semibold text-white" aria-label={t('integrations.newCount', { n: i.count })}>
                  {i.count}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Logo: always links back to the dashboard. */
export function Brand({ to = '/', onClick, light }: { to?: string; onClick?: () => void; light?: boolean }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-label="Mindrift CRM"
      className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-offset-4"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5 transition-transform group-hover:scale-105">
        <img src="/favicon.svg" alt="" className="h-5 w-5" />
      </span>
      <span className={cx('text-[15px] font-semibold tracking-tight', light ? 'text-slate-900' : 'text-white')}>
        Mindrift <span className={light ? 'text-indigo-600' : 'text-indigo-300'}>CRM</span>
      </span>
    </Link>
  );
}

const sidebarBg = 'bg-slate-950 bg-[radial-gradient(120%_60%_at_0%_0%,rgba(99,102,241,0.25),transparent_60%)]';

export function Layout() {
  const { user, logout } = useAuth();
  const { t, te } = useI18n();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer on navigation and with Escape; lock page scroll while it is open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const doLogout = async () => {
    await logout();
    nav('/login');
  };
  const userBox = user && (
    <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold text-white" aria-hidden>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">{user.name}</div>
          <div className="truncate text-xs text-slate-400">{te('settings.roles', user.role)}</div>
        </div>
      </div>
      <button type="button" onClick={doLogout} className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label={t('common.logout')} title={t('common.logout')}>
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <aside className={cx('hidden w-64 shrink-0 flex-col gap-6 px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh', sidebarBg)}>
        <div className="px-3">
          <Brand />
        </div>
        <NavItems />
        <div className="mt-auto space-y-4 px-2">
          <div className="flex items-center justify-between gap-2">
            <ModeBadge />
            <LanguageSwitch dark />
          </div>
          {userBox}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur-md lg:hidden">
        <Brand light />
        <div className="flex items-center gap-1.5">
          <ModeBadge />
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            onClick={() => setOpen(true)}
            aria-label={t('nav.menu')}
            aria-expanded={open}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className={cx('absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col gap-6 overflow-y-auto p-4 shadow-2xl', sidebarBg)}>
            <div className="flex items-center justify-between">
              <Brand onClick={() => setOpen(false)} />
              <button type="button" className="rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)} aria-label={t('common.close')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavItems onNavigate={() => setOpen(false)} />
            <div className="mt-auto space-y-4">
              <LanguageSwitch dark />
              {userBox}
            </div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
