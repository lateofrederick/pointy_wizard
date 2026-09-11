'use client';

import { cn } from '../../lib/cn';
import { useTheme, type ThemePreference } from '../../lib/theme';

const OPTIONS: { value: ThemePreference; label: string; glyph: string }[] = [
  { value: 'dark', label: 'Dark', glyph: '◐' },
  { value: 'light', label: 'Light', glyph: '◑' },
  { value: 'system', label: 'System', glyph: '⌗' },
];

/**
 * Three-way theme control. The designs are dark-first, so dark is the default
 * and sits first; 'system' is last because choosing it is a deliberate act.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-[6px] border border-edge bg-bg-sunken p-[3px]',
        className,
      )}
    >
      {OPTIONS.map((o) => {
        const active = preference === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(o.value)}
            title={o.label}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-[4px] px-2.5 py-1',
              'font-sans text-[10.5px] transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-seq',
              active
                ? 'bg-seq-tint text-seq font-medium'
                : 'text-tertiary hover:text-secondary',
            )}
          >
            <span aria-hidden className="font-mono">
              {o.glyph}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
