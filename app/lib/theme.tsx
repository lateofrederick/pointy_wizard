'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'pw-theme';

/**
 * Routes that ignore the stored preference and follow the OS instead.
 *
 * Theme is a setting, and a setting belongs to someone. Before you are signed
 * in there is nobody to hold it, so the sign-in and sign-up screens follow the
 * system and offer no toggle. The preference is untouched and comes back the
 * moment you are inside.
 */
export const SYSTEM_THEME_ROUTES = ['/signin', '/signup'];

/**
 * Runs in <head> before first paint so the correct theme class is on <html>
 * when the first pixel lands. Without it the app flashes the wrong ground on
 * every load. Kept as a string because it must be inlined, not hydrated.
 *
 * Defaults to dark: the designs are dark-first, so an unconfigured visitor
 * should see the design as drawn rather than the accommodation. The auth routes
 * are the exception, and the path is checked here rather than after hydration
 * so they do not flash the stored theme first.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var systemRoutes = ${JSON.stringify(SYSTEM_THEME_ROUTES)};
    var system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var onAuthRoute = systemRoutes.indexOf(location.pathname.replace(/\\/$/, '')) !== -1;
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var resolved = onAuthRoute
      ? system
      : (stored === 'light' || stored === 'dark'
          ? stored
          : (stored === 'system' ? system : 'dark'));
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

  const pathname = usePathname();
  // Checked here as well as in the bootstrap script, because a client-side
  // navigation to /signin never re-runs the script.
  const followSystem = SYSTEM_THEME_ROUTES.includes(pathname ?? '');

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    const next: ThemePreference =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
    const resolved = followSystem || next === 'system' ? systemTheme() : next;
    setPreferenceState(next);
    setTheme(resolved);
    apply(resolved);
  }, [followSystem]);

  // Only follow the OS while the user has asked us to, or while on a route
  // that has nobody to hold a preference for.
  useEffect(() => {
    if (!followSystem && preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const resolved = systemTheme();
      setTheme(resolved);
      apply(resolved);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference, followSystem]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      const resolved = next === 'system' ? systemTheme() : next;
      setPreferenceState(next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* private mode — the class is still applied for this session */
      }
      // Store it, but do not paint it while the route is following the OS.
      if (followSystem) return;
      setTheme(resolved);
      apply(resolved);
    },
    [followSystem],
  );

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
