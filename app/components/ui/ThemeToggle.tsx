'use client';

import { cn } from '../../lib/cn';
import { useTheme } from '../../lib/theme';

/**
 * One icon, one click.
 *
 * The icon shows what you are switching TO, not what you are in: in the dark
 * theme it is a sun, in the light theme a moon. A control that pictures the
 * state you are already in tells you nothing you cannot see by looking at the
 * screen.
 *
 * This drives `toggle()`, which flips between light and dark and leaves the
 * 'system' preference behind. System is still what the auth screens use and
 * still a valid stored value — it just has no button any more.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const goingTo = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${goingTo} theme`}
      title={`Switch to ${goingTo} theme`}
      className={cn(
        'grid h-[26px] w-[26px] shrink-0 cursor-pointer place-items-center rounded-[6px]',
        'text-tertiary transition-colors hover:bg-neutral-tint hover:text-primary',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-seq',
        className,
      )}
    >
      {goingTo === 'light' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4" />
        <path d="M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      {/* A crescent as one filled path, so it reads at 15px where a stroked
          outline would close up. */}
      <path
        d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11z"
        fill="currentColor"
      />
    </svg>
  );
}
