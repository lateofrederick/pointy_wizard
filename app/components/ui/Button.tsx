'use client';

import { cn } from '../../lib/cn';

/**
 * Button — Figma component set 61:5589.
 *
 * Height is fixed at 34. The shortcut hint is optional — omit it on buttons
 * without a keyboard shortcut. Primary is the only kind that may appear twice
 * on a screen, and only if the second is in a modal footer.
 *
 * `disabled` is a real variant in the designs rather than an opacity filter,
 * so it is driven by the native `disabled` prop here and styled explicitly.
 */
export type ButtonKind = 'primary' | 'secondary' | 'ghost';

const KIND: Record<ButtonKind, string> = {
  primary: 'bg-seq text-bg-sunken hover:brightness-110 active:brightness-95',
  secondary:
    'border border-edge-strong text-secondary hover:bg-neutral-tint hover:text-primary',
  ghost: 'text-seq hover:bg-seq-tint',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: ButtonKind;
  /** e.g. "⌘↵" — rendered mono and dimmed inside the button. */
  shortcut?: string;
}

export function Button({
  kind = 'secondary',
  shortcut,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'inline-flex h-[34px] items-center justify-center gap-[9px] rounded-[7px] px-[18px]',
        'font-sans text-[11.5px] font-medium whitespace-nowrap',
        'transition-[background-color,color,filter] duration-100',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
        disabled
          ? 'bg-neutral-tint text-disabled cursor-not-allowed'
          : cn(KIND[kind], 'cursor-pointer'),
        className,
      )}
      {...rest}
    >
      <span>{children}</span>
      {shortcut && (
        <span
          className={cn(
            'font-mono text-[9.5px]',
            kind === 'primary' && !disabled ? 'opacity-55' : 'text-tertiary',
          )}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}
