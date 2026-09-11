'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'pw-theme';

/**
 * Runs in <head> before first paint so the correct theme class is on <html>
 * when the first pixel lands. Without it the app flashes the wrong ground on
 * every load. Kept as a string because it must be inlined, not hydrated.
 *
 * Defaults to dark: the designs are dark-first, so an unconfigured visitor
 * should see the design as drawn rather than the accommodation.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var resolved = stored === 'light' || stored === 'dark'
      ? stored
      : (stored === 'system'
          ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
          : 'dark');
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.dataset.theme = resolved;
  } catch (e) {
    document.documentElement.classList.add('dark');
    document.documentElement.dataset.theme = 'dark';
  }
})();
`.trim();

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = resolved;
}

interface ThemeContextValue {
  /** What the user chose, including 'system'. */
  preference: ThemePreference;
  /** What is actually on screen right now. */
  theme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  /** Flip between light and dark, leaving 'system' behind. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start at 'dark' to match the bootstrap script's default. The real stored
  // value is read in the effect below, after hydration, so server and client
  // markup agree on the first pass.
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [theme, setTheme] = useState<ResolvedTheme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    const next: ThemePreference =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
    const resolved = next === 'system' ? systemTheme() : next;
    setPreferenceState(next);
    setTheme(resolved);
    apply(resolved);
  }, []);

  // Only follow the OS while the user has actually asked us to.
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const resolved = systemTheme();
      setTheme(resolved);
      apply(resolved);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    const resolved = next === 'system' ? systemTheme() : next;
    setPreferenceState(next);
    setTheme(resolved);
    apply(resolved);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode — the class is still applied for this session */
    }
  }, []);

  const toggle = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setPreference]);

  const value = useMemo(
    () => ({ preference, theme, setPreference, toggle }),
    [preference, theme, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
