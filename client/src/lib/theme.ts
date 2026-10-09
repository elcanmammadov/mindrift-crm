import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'mindrift-theme';

/** The class on <html> is the source of truth; index.html sets it before the first paint (no flash). */
const current = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
const listeners = new Set<() => void>();

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage blocked (private mode): the theme still applies for this visit */
  }
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => 'light' as Theme,
  );
  const toggle = useCallback(() => setTheme(current() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle };
}
