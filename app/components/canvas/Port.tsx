'use client';

import { Handle, Position } from 'reactflow';
import { cn } from '../../lib/cn';

/**
 * A connection port — the 10px dot on a node's edge.
 *
 * Ports sit on the left and right at y=38 of an 82-high card, and on the
 * horizontal centre for top/bottom. A branch node overrides `offset` to pin one
 * port per descriptor row. See docs/ui-migration.md §7.
 *
 * Filled means connected, hollow means available. reactflow's default handle
 * styling is overridden wholesale.
 */
export interface PortProps {
  id?: string;
  type: 'source' | 'target';
  side: 'left' | 'right' | 'top' | 'bottom';
  /** px from the top for left/right ports, from the left for top/bottom. */
  offset?: number;
  /** Tone of the wire this port carries. */
  tone?: 'seq' | 'flow' | 'keyword';
  filled?: boolean;
}

const POSITION = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
} as const;

const TONE = {
  seq: 'border-seq',
  flow: 'border-flow',
  keyword: 'border-keyword',
} as const;

const FILL = {
  seq: 'bg-seq',
  flow: 'bg-flow',
  keyword: 'bg-keyword',
} as const;

export function Port({
  id,
  type,
  side,
  offset = 38,
  tone = 'seq',
  filled = true,
}: PortProps) {
  const vertical = side === 'left' || side === 'right';

  return (
    <Handle
      id={id}
      type={type}
      position={POSITION[side]}
      style={vertical ? { top: offset } : { left: offset }}
      className={cn(
        // `!` because reactflow ships its own .react-flow__handle rules.
        '!h-2.5 !w-2.5 !rounded-full !border-[1.5px] !min-w-0 !min-h-0',
        TONE[tone],
        filled ? FILL[tone] : '!bg-bg-canvas',
      )}
    />
  );
}
