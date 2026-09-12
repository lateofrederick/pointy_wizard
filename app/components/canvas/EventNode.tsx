'use client';

import { memo } from 'react';
import type { NodeProps } from 'reactflow';
import type { EventRef } from '../../types/pointy';
import { cn } from '../../lib/cn';
import { Port } from './Port';
import {
  AccentBar,
  AttributeLine,
  ExecutorBadge,
  MetaRow,
  NODE_WIDTH,
  NodeTitle,
  SHELL_STATE,
  SourceBadge,
  StatusNote,
  VersionLabel,
  type NodeState,
} from './nodeShared';

export interface EventNodeData {
  ref: EventRef;
  state: NodeState;
  /** Run status text for the meta row, e.g. "✕ failed 1.4s". */
  status?: { tone: string; text: string };
  accent?: string;
}

/**
 * A plain event on the canvas — Figma component set 61:5722.
 *
 * Branch nodes and concurrency groups are *different components*, not states of
 * this one, because their anatomy differs: a branch carries a row list and one
 * port per descriptor, a group is a container.
 */
function EventNodeImpl({ data, selected }: NodeProps<EventNodeData>) {
  const { ref, status } = data;
  const state: NodeState = selected ? 'selected' : data.state;

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        'relative rounded-[9px] border bg-bg-raised shadow-raised',
        SHELL_STATE[state],
      )}
    >
      <AccentBar tone={data.accent ?? 'bg-keyword'} />

      <div className="flex flex-col gap-[7px] px-3 pt-[9px] pb-[11px]">
        <MetaRow>
          <SourceBadge namespace={ref.namespace} />
          <VersionLabel version={ref.version} />
          <ExecutorBadge />
          {status && <StatusNote tone={status.tone}>{status.text}</StatusNote>}
          <span className="flex-1" />
          <button
            type="button"
            aria-label={`${ref.name} actions`}
            className="cursor-pointer px-0.5 font-sans text-[11px] leading-none text-tertiary hover:text-primary"
          >
            ⋮
          </button>
        </MetaRow>

        <NodeTitle ref={ref} />
        <AttributeLine ref={ref} />
      </div>

      <Port type="target" side="left" />
      <Port type="source" side="right" />
    </div>
  );
}

export const EventNode = memo(EventNodeImpl);
