import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 active:bg-indigo-600 disabled:opacity-50',
  secondary: 'bg-white text-slate-700 border border-slate-300 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500 disabled:opacity-50',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'min-h-8 px-2.5 py-1.5 text-xs' : 'min-h-10 px-4 py-2 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- Layout bits
export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx('min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Badge
type Tone = 'slate' | 'brand' | 'green' | 'amber' | 'red' | 'blue' | 'violet';
const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};
export function Badge({ children, tone = 'slate', className, title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Forms
export function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: string; children: (id: string) => ReactNode; required?: boolean }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm sm:text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 aria-[invalid=true]:border-red-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(inputCls, className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(inputCls, 'min-h-[90px]', className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cx(inputCls, 'pr-8', className)} {...p} />;
});

// ---------------------------------------------------------------- States
export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label ?? t('common.loading')}
    </div>
  );
}

export function EmptyState({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {icon}
      {children}
    </div>
  );
}

export function errorMessage(e: unknown, t: (k: string) => string): string {
  if (e instanceof ApiError) {
    const known = t(`errors.${e.code}`);
    if (known !== `errors.${e.code}`) return known;
    if (e.code === 'BAD_REQUEST' && Array.isArray(e.details)) {
      return `${t('errors.VALIDATION')} ${(e.details as { path: string; message: string }[]).map((d) => `${d.path}: ${d.message}`).join('; ')}`;
    }
    return e.message;
  }
  return (e as Error)?.message ?? t('common.error');
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {t('common.error')}
      </div>
      <p>{errorMessage(error, t)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', children, title }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; title?: ReactNode }) {
  const styles = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cx('flex gap-2 rounded-lg border px-3 py-2.5 text-sm', styles)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <div className="font-medium">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Modal (native <dialog>: focus trap + Esc for free)
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-auto w-[calc(100%-1.5rem)] rounded-xl border border-slate-200 p-0 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-[2px]',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
            <h2 className="min-w-0 break-words text-base font-semibold text-slate-900">{title}</h2>
            <button type="button" onClick={onClose} className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={t('common.close')}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------- Tabs (keyboard: arrow keys)
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next]!.id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onChange(tab.id)}
          className={cx(
            '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            value === tab.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
          )}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-px text-xs font-semibold text-indigo-700">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Toasts
interface ToastItem {
  id: number;
  text: string;
  tone: 'success' | 'danger' | 'info';
}
const ToastCtx = createContext<(text: string, tone?: ToastItem['tone']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastItem['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((i) => (
          <div
            key={i.id}
            className={cx(
              'pointer-events-auto w-full max-w-md rounded-lg px-4 py-2.5 text-sm shadow-lg sm:w-auto',
              i.tone === 'success' && 'bg-emerald-600 text-white',
              i.tone === 'danger' && 'bg-red-600 text-white',
              i.tone === 'info' && 'bg-[#0f172a] text-white ring-1 ring-white/10',
            )}
          >
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- Stat tile
const statStyles: Record<Tone, { card: string; icon: string; value: string }> = {
  slate: { card: 'before:bg-slate-400', icon: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
  brand: { card: 'before:bg-indigo-500', icon: 'bg-indigo-50 text-indigo-600', value: 'text-slate-900' },
  green: { card: 'before:bg-emerald-500', icon: 'bg-emerald-50 text-emerald-600', value: 'text-slate-900' },
  amber: { card: 'before:bg-amber-500', icon: 'bg-amber-50 text-amber-600', value: 'text-slate-900' },
  red: { card: 'before:bg-rose-500', icon: 'bg-rose-50 text-rose-600', value: 'text-slate-900' },
  blue: { card: 'before:bg-sky-500', icon: 'bg-sky-50 text-sky-600', value: 'text-slate-900' },
  violet: { card: 'before:bg-violet-500', icon: 'bg-violet-50 text-violet-600', value: 'text-slate-900' },
};

export function Stat({ label, value, hint, tone = 'slate', to, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; to?: string; icon?: ReactNode }) {
  const s = statStyles[tone];
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium leading-snug text-slate-500 sm:text-sm">{label}</div>
        <div className={cx('mt-1.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl', s.value)}>{value}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
      </div>
      {icon && <div className={cx('hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg min-[400px]:flex', s.icon)}>{icon}</div>}
    </div>
  );
  const cls = cx('relative block overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all before:absolute before:inset-x-0 before:top-0 before:h-0.5 sm:p-5', s.card);
  return to ? (
    <Link to={to} className={cx(cls, 'hover:border-slate-300 hover:shadow-md')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
