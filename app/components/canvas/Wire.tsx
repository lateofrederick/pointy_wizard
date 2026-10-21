'use client';

import { memo, useLayoutEffect } from 'react';
import { Position, type EdgeProps } from 'reactflow';
import type { Descriptor } from '../../types/pointy';
import { cn } from '../../lib/cn';
import type { WireOperator } from '../../lib/pointy/flow';
import { wireGeometry, wireMidpoint, type Point, type Side } from '../../lib/pointy/geometry';

export interface WireData {
  operator: WireOperator;
  descriptor?: Descriptor;
  selected?: boolean;
  /**
   * Hands this wire's midpoint (flow coordinates) up while it is selected, so
   * the popover can anchor to it. The Wire component is the one place that
   * knows the exact geometry — reactflow computes the handle points and hands
   * them in here, and Canvas sits above the pane where an overlay can float.
   */
  onMidpoint?: (point: Point) => void;
}

const SIDE: Record<Position, Side> = {
  [Position.Left]: 'left',
  [Position.Right]: 'right',
  [Position.Top]: 'top',
  [Position.Bottom]: 'bottom',
};

/**
 * Hue says whether the next event blocks; form says how data moves.
 * `branch` and `group` wires are sequential handoffs, so they take the
 * sequential treatment — the descriptor is what distinguishes a branch wire,
 * and it is carried by the port it leaves from.
 */
const STROKE: Record<WireOperator, string> = {
  seq: 'var(--op-seq)',
  pipe: 'var(--op-flow)',
  parallel: 'var(--op-flow)',
  branch: 'var(--op-seq)',
  group: 'var(--op-seq)',
};

/**
 * One edge component for every operator — Figma screen 03's legend (65:6349)
 * and the `||` pair on screen 17 (66:6383).
 *
 * reactflow's `markerEnd` is deliberately unused: it cannot do the 6px pullback
 * that keeps the tip off the port dot, and it cannot draw the split-lane form.
 * The head is a sibling <path> instead. See docs/ui-migration.md §6.
 */
function WireImpl({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<WireData>) {
  const operator = data?.operator ?? 'seq';
  const stroke = STROKE[operator];

  const geo = wireGeometry({
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY },
    sourceSide: SIDE[sourcePosition],
    targetSide: SIDE[targetPosition],
  });

  // The popover opens anchored to this wire's midpoint. A layout effect, so it
  // never paints one frame at the previous wire's anchor first; it re-fires
  // while a node drags because the handle points move with it.
  useLayoutEffect(() => {
    if (!selected) return;
    data?.onMidpoint?.(
      wireMidpoint({
        source: { x: sourceX, y: sourceY },
        target: { x: targetX, y: targetY },
        sourceSide: SIDE[sourcePosition],
        targetSide: SIDE[targetPosition],
      }),
    );
  }, [
    selected,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  ]);

  const width = selected ? 2.5 : 2;

  return (
    <g
      className={cn('pointy-wire', selected && 'pointy-wire--selected')}
      // globals.css turns the class into a drop-shadow, dark theme only.
      style={{ '--wire-stroke': stroke } as React.CSSProperties}
    >
      {/* Invisible fat stroke so the wire is clickable — selecting the wire is
          how the operator gets changed now that the chips are gone. */}
      <path d={geo.path} stroke="transparent" strokeWidth={14} fill="none" />

      {operator === 'parallel' ? (
        geo.lanes.map((d, i) => (
          <path
            key={i}
            d={d}
            stroke={stroke}
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
          />
        ))
      ) : (
        <path
          d={geo.path}
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* Streaming carries chevrons along the strand: many values flowing,
          rather than one handoff. */}
      {operator === 'pipe' &&
        geo.chevrons.map((c, i) => (
          <path
            key={i}
            d={c.d}
            stroke={stroke}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}

      <path d={geo.head} fill={stroke} />
    </g>
  );
}

export const Wire = memo(WireImpl);
