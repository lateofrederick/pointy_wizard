'use client';

import { getBezierPath, type ConnectionLineComponentProps } from 'reactflow';
import { DESCRIPTORS, type Descriptor } from '../../types/pointy';

/**
 * Mid-drag branch promotion preview — Figma screen 08 (node 25:2210).
 *
 * Dragging a second wire out of an already-wired port will PROMOTE the source
 * to a branch on drop, so the gesture has to say that before the drop: the
 * wire turns dashed (nothing is committed yet), a snap ring marks the port the
 * release will land on, and a pill tells the user which path they are about to
 * create. `edit.ts connect()` owns the actual promotion; this file only talks
 * to the user, using the same facts connect() decides from.
 *
 * It renders inside reactflow's connection-line <svg> (flow coordinates, on
 * top of everything), so everything here is SVG — the pill rides in a
 * <foreignObject> to keep real HTML box styling.
 */

/**
 * The descriptor a released wire would claim, or null when the drop would not
 * promote at all.
 *
 * Mirrors `connect()`: promotion only happens when the source already has a
 * successor; the existing successor moves to descriptor 0 (success) and the
 * wire in hand takes 1 (failure). An event that is already a branch takes the
 * next free digit — descriptors are the integers 0-9, and ten used paths means
 * the branch is full.
 *
 * @param rows  the source's path rows when it is already a branch, else undefined
 * @param sourceHasSuccessor  hasSuccessor(doc.chain, sourceId) — the exact
 *   predicate connect() tests before promoting
 */
export function nextBranchDescriptor(
  rows: { descriptor: Descriptor }[] | undefined,
  sourceHasSuccessor: boolean,
): Descriptor | null {
  if (!sourceHasSuccessor) return null;
  if (!rows) return 1;
  const used = new Set(rows.map((r) => r.descriptor));
  return DESCRIPTORS.find((d) => !used.has(d)) ?? null;
}

/**
 * The words of the hint pill. 0 and 1 carry their conventional names — the
 * design calls them out everywhere — beyond that a path is just its number
 * (2-9 only ever exist alongside an explicit self.goto()).
 */
export function branchPromotionHint(descriptor: Descriptor): string {
  const label = descriptor === 0 ? ' (success)' : descriptor === 1 ? ' (failure)' : '';
  return `Release to add branch ${descriptor}${label}`;
}

/** SnapRing 25:2713 — 22px across, 1.5px seq stroke over a 10px port. */
const RING_RADIUS = 11;
/** DropHint 25:2714 sits below-right of the ring centre. */
const HINT_DX = 20;
const HINT_DY = 60;
/**
 * DragWire 64:6326 — 1.75px, dash 5/4, round cap, sequential cyan, and no
 * arrowhead: a pending wire points nowhere until it is released. The colour is
 * the token behind VariableID:2:16, the same one committed seq wires draw with.
 */
const PENDING_STROKE = 'var(--op-seq)';

export type PendingConnectionLineProps = ConnectionLineComponentProps & {
  /** What dropping on a valid target will do, e.g. "Release to add branch 1 (failure)". */
  hint: string;
};

/**
 * The connection line while a promoting drag is in flight. Mounted only for
 * that case by Canvas — every other drag keeps reactflow's stock line.
 *
 * The ring and the pill appear only when reactflow reports a valid snap
 * (toX/toY is then the port centre): the release does nothing over empty
 * canvas, so promising a branch there would be a lie.
 */
export function PendingConnectionLine({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
  connectionStatus,
  hint,
}: PendingConnectionLineProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });

  const snapped = connectionStatus === 'valid';

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke={PENDING_STROKE}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeDasharray="5 4"
      />

      {snapped && (
        <g>
          <circle
            cx={toX}
            cy={toY}
            r={RING_RADIUS}
            fill="none"
            stroke={PENDING_STROKE}
            strokeWidth={1.5}
          />
          <foreignObject x={toX + HINT_DX} y={toY + HINT_DY} width={280} height={30}>
            <div className="pointer-events-none flex w-fit items-center gap-1.5 rounded-[5px] border border-seq bg-bg-raised py-[5px] pl-[9px] pr-[10px] shadow-raised">
              <span className="text-[8.5px] leading-none text-seq">◆</span>
              <span className="text-[9.5px] leading-none text-secondary">{hint}</span>
            </div>
          </foreignObject>
        </g>
      )}
    </>
  );
}
