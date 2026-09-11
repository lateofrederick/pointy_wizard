'use client';

import { cn } from '../../lib/cn';

/**
 * Toggle — Figma component set 61:5603.
 *
 * `locked` reads as on but cannot be changed — used for the EventHub `read`
 * scope, which every grant must include. Always pair it with the word
 * "required" next to the label: a disabled control with no explanation is the
 * thing people file bugs about.
 */
export interface ToggleProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  /** Renders as on, ignores input, and announces itself as disabled. */
  locked?: boolean;
  /** Accessible name — required, since the control has no visible label. */
  label: string;
  className?: string;
}

export function Toggle({ checked, onChange, locked = false, label, className }: ToggleProps) {
  const on = locked || checked;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-disabled={locked || undefined}
      disabled={locked}
      onClick={() => !locked && onChange?.(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
        locked ? 'bg-seq/35 cursor-not-allowed' : on ? 'bg-seq cursor-pointer' : 'bg-neutral-tint cursor-pointer',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] h-3.5 w-3.5 rounded-full transition-[left] duration-150',
          on ? 'left-[18px]' : 'left-[4px]',
          locked ? 'bg-bg-sunken/75' : on ? 'bg-bg-sunken' : 'bg-tertiary',
        )}
      />
    </button>
  );
}
