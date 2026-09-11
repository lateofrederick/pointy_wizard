'use client';

import { cn } from '../../lib/cn';

/**
 * Field — Figma component set 61:5781.
 *
 * The Figma set has one property, `kind = text·select·stepper·focused·error`,
 * because a second variant axis is expensive to author there. In code those are
 * two independent things, so they are two props: `kind` is the control shape,
 * `state` is how it is behaving. Do not collapse them back.
 *
 * Values render mono because they are Pointy source, not prose; labels render
 * sans. The hint line is optional and is the only place a constraint
 * ("off · min 2 when set") or an error reason belongs.
 */
export type FieldKind = 'text' | 'select' | 'stepper';
export type FieldState = 'default' | 'focused' | 'error';

export interface FieldProps {
  label: string;
  value: string | number;
  hint?: string;
  kind?: FieldKind;
  state?: FieldState;
  /** text: fires per keystroke. select/stepper: fires with the new value. */
  onValueChange?: (next: string) => void;
  /** stepper only */
  min?: number;
  max?: number;
  /** select only — rendered by the caller's own popover; this just draws the row. */
  onOpenOptions?: () => void;
  className?: string;
  id?: string;
}

const BORDER: Record<FieldState, string> = {
  default: 'border-edge',
  focused: 'border-seq border-[1.5px]',
  error: 'border-danger border-[1.5px]',
};

export function Field({
  label,
  value,
  hint,
  kind = 'text',
  state = 'default',
  onValueChange,
  min,
  max,
  onOpenOptions,
  className,
  id,
}: FieldProps) {
  const inputId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const step = (delta: number) => {
    const current = Number(value);
    if (Number.isNaN(current)) return;
    let next = current + delta;
    if (typeof min === 'number') next = Math.max(min, next);
    if (typeof max === 'number') next = Math.min(max, next);
    onValueChange?.(String(next));
  };

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="font-sans text-[10.5px] leading-[19px] text-secondary">
        {label}
      </label>

      <div
        className={cn(
          'flex h-[34px] items-center rounded-[6px] border bg-bg-sunken',
          kind === 'stepper' ? 'px-1' : 'px-3',
          BORDER[state],
        )}
      >
        {kind === 'stepper' && (
          <StepperButton label={`Decrease ${label}`} onClick={() => step(-1)}>
            −
          </StepperButton>
        )}

        {kind === 'select' ? (
          <button
            id={inputId}
            type="button"
            onClick={onOpenOptions}
            className="flex flex-1 cursor-pointer items-center justify-between gap-2 text-left font-mono text-[11.5px] text-code"
          >
            <span className="truncate">{value}</span>
            <span aria-hidden className="text-[9px] text-tertiary">
              ▾
            </span>
          </button>
        ) : (
          <input
            id={inputId}
            value={value}
            onChange={(e) => onValueChange?.(e.target.value)}
            inputMode={kind === 'stepper' ? 'numeric' : undefined}
            aria-invalid={state === 'error' || undefined}
            className={cn(
              'w-full min-w-0 bg-transparent font-mono text-[11.5px] text-code outline-none',
              'placeholder:text-disabled',
              kind === 'stepper' && 'text-center',
            )}
          />
        )}

        {kind === 'stepper' && (
          <StepperButton label={`Increase ${label}`} onClick={() => step(1)}>
            ＋
          </StepperButton>
        )}
      </div>

      {hint && (
        <p
          className={cn(
            'font-sans text-[9.5px] leading-[15px]',
            state === 'error' ? 'text-danger' : 'text-tertiary',
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function StepperButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'grid h-[26px] w-7 shrink-0 cursor-pointer place-items-center rounded-[4px]',
        'font-sans text-[12px] text-tertiary hover:bg-neutral-tint hover:text-primary',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-seq',
      )}
    >
      {children}
    </button>
  );
}
