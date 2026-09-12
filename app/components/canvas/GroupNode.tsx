'use client';

import { memo } from 'react';
import type { NodeProps } from 'reactflow';

export interface GroupNodeData {
  /** `{ } ai-branch` */
  label: string;
  /** `[timeout=60]`, already formatted. */
  attributes?: string;
  width: number;
  height: number;
}

/**
 * A `{ }` concurrency group — the dashed container on screens 03 and 16.
 *
 * Derived, not authored: its box is the bounding box of its members plus
 * padding, recomputed whenever they move. It is not draggable or selectable —
 * dragging the container would imply moving the group as a unit, and group
 * membership is structural, not positional.
 *
 * A group orchestrates rather than executes, which is why `||` may not contain
 * one. lint() enforces that; this only draws it.
 */
function GroupNodeImpl({ data }: NodeProps<GroupNodeData>) {
  return (
    <div
      style={{ width: data.width, height: data.height }}
      className="pointer-events-none relative rounded-[10px] border border-dashed border-flow/55"
    >
      <div className="absolute -top-[10px] left-3 flex items-center gap-1.5 rounded-[4px] border border-flow/40 bg-bg-canvas px-2 py-[3px]">
        <span className="font-mono text-[9.4px] font-medium text-flow">{data.label}</span>
        {data.attributes && (
          <span className="font-mono text-[9.4px] text-tertiary">{data.attributes}</span>
        )}
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeImpl);
