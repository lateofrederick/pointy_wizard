'use client';

import { cn } from '../../lib/cn';

/**
 * Callout — Figma component set 61:5881.
 *
 * Three lines, in this order: what happened, why, and the one action that fixes
 * it. The action is a ghost link, never a button — a callout is not a dialog.
 *
 * Every error the canvas can show has to name the Pointy rule it broke.
 * "Invalid pipeline" on its own is not an acceptable string.
 */
export type CalloutTone = 'error' | 'warning' | 'info' | 'success';

const TONE: Record<CalloutTone, { box: string; title: string; glyph: string }> = {
  error: { box: 'bg-danger-tint border-danger/35', title: 'text-danger', glyph: '✕' },
  warning: { box: 'bg-warn-tint border-warn/35', title: 'text-warn', glyph: '⚠' },
  info: { box: 'bg-seq-tint border-seq/30', title: 'text-seq', glyph: '◇' },
  success: { box: 'bg-keyword-tint border-keyword/30', title: 'text-keyword', glyph: '✓' },
};

export interface CalloutProps {
  tone?: CalloutTone;
  title: string;
  children: React.ReactNode;
  /** The single fix. Rendered as a link, not a button. */
  action?: string;
  onAction?: () => void;
  className?: string;
}

export function Callout({
  tone = 'info',
  title,
  children,
  action,
  onAction,
  className,
}: CalloutProps) {
  const t = TONE[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('w-full rounded-[7px] border px-3 pt-[11px] pb-3', t.box, className)}
    >
      <p className={cn('flex items-start gap-2 font-sans text-[10.5px] font-medium', t.title)}>
        <span aria-hidden>{t.glyph}</span>
        <span>{title}</span>
      </p>

      <p className="mt-1.5 font-sans text-[9.5px] leading-[15px] text-secondary">{children}</p>

      {action && (
        <button
          type="button"
          onClick={onAction}
          className={cn(
            'mt-1.5 cursor-pointer font-sans text-[10px] font-medium text-seq hover:underline',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
          )}
        >
          {action}
        </button>
      )}
    </div>
  );
}
