import type { Locale } from './i18n';

// Browsers' ICU data has no short Azerbaijani month names (renders "M10"), so format by hand.
const AZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const pad = (n: number) => String(n).padStart(2, '0');

export function fmtDate(v: string | Date | null | undefined, locale: Locale) {
  if (!v) return '—';
  const d = new Date(v);
  if (locale === 'az') return `${pad(d.getDate())} ${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(v: string | Date | null | undefined, locale: Locale) {
  if (!v) return '—';
  const d = new Date(v);
  return `${fmtDate(d, locale)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const isOverdue = (due: string | null | undefined, done = false) => !!due && !done && new Date(due) < new Date();
