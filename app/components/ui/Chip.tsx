import { cn } from '../../lib/cn';

/**
 * Chip — Figma component set 61:5568.
 *
 * Used for pipeline validity, run outcome, registry source, node badges and
 * list status. The tone carries the meaning, so never hard-code a colour at
 * the call site: pick the tone that means what you are saying.
 */
export type ChipTone = 'neutral' | 'green' | 'amber' | 'red' | 'violet' | 'cyan';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-neutral-tint text-secondary',
  green: 'bg-keyword-tint text-keyword',
  amber: 'bg-warn-tint text-warn',
  red: 'bg-danger-tint text-danger',
  violet: 'bg-flow-tint text-flow',
  cyan: 'bg-seq-tint text-seq',
};

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  children: React.ReactNode;
}

export function Chip({ tone = 'neutral', children, className, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[4px] px-2 py-[3px]',
        'font-mono text-[9px] leading-none font-medium tracking-[0.4px]',
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
