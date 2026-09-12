'use client';

import { memo } from 'react';
import type { NodeProps } from 'reactflow';
import type { Descriptor, EventRef } from '../../types/pointy';
import { cn } from '../../lib/cn';
import { Port } from './Port';
import {
  AccentBar,
  AttributeLine,
  ExecutorBadge,
  MetaRow,
  NodeTitle,
  SHELL_STATE,
  SourceBadge,
  VersionLabel,
  type NodeState,
} from './nodeShared';

export interface BranchRow {
  descriptor: Descriptor;
  /** UI metadata only — never emitted. */
  label?: string;
}

export interface BranchNodeData {
  ref: EventRef;
  state: NodeState;
  rows: BranchRow[];
  accent?: string;
}

const BRANCH_WIDTH = 220;
/** Where the first descriptor port sits, and the pitch between rows. */
const FIRST_PORT_Y = 77;
const PORT_PITCH = 28;

/**
 * A branch — Figma screens 03 and 09.
 *
 * Descriptors are integers by design: 0 is success, 1 is failure, 2–9 are
 * user-defined via `self.goto(n, ok, result)`. They are never free text, so
 * rows render the number and an optional UI-only label beside it.
 *
 * Each row gets its own right-hand port, which is what lets two wires leave the
 * node at different heights and stay attached to their descriptor.
 */
function BranchNodeImpl({ data, selected }: NodeProps<BranchNodeData>) {
  const { ref, rows } = data;
  const state: NodeState = selected ? 'selected' : data.state;

  return (
    <div
      style={{ width: BRANCH_WIDTH }}
      className={cn(
        'relative rounded-[9px] border bg-bg-raised shadow-raised',
        SHELL_STATE[state],
      )}
    >
      <AccentBar tone={data.accent ?? 'bg-keyword'} />

      <div className="flex flex-col gap-[7px] px-3 pt-[9px] pb-[11px]">
        <MetaRow>
          <span className="inline-flex items-center gap-[3px] rounded-[3px] bg-keyword-tint px-[5px] py-[2px] font-mono text-[8.6px] leading-none font-medium text-keyword">
            <span aria-hidden>◆</span>
            branch
          </span>
          <VersionLabel version={ref.version} />
          {ref.namespace !== 'local' && <SourceBadge namespace={ref.namespace} />}
          <ExecutorBadge />
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

        <div className="flex flex-col gap-0.5 rounded-[6px] border border-edge-subtle bg-bg-sunken p-1.5">
          {rows.map((row) => (
            <div
              key={row.descriptor}
              className="flex items-center gap-[7px] rounded-[4px] bg-keyword/[0.07] px-[7px] py-1.5"
            >
              <span aria-hidden className="font-sans text-[7px] text-keyword">
                ◆
              </span>
              <span className="font-mono text-[11px] font-medium text-keyword">
                {row.descriptor}
              </span>
              {row.label && (
                <span className="font-mono text-[10.5px] text-tertiary">{row.label}</span>
              )}
              <span className="flex-1" />
              <span className="font-mono text-[10px] text-tertiary">-&gt;</span>
            </div>
          ))}

          <button
            type="button"
            className="flex cursor-pointer items-center gap-1.5 rounded-[4px] px-[7px] py-1.5 text-left hover:bg-neutral-tint"
          >
            <span aria-hidden className="font-sans text-[9px] text-tertiary">
              ＋
            </span>
            <span className="font-sans text-[10px] text-tertiary">add branch</span>
            <span className="flex-1" />
            {/* The 0–9 descriptor range is why a branch caps at ten paths. */}
            <span className="font-sans text-[10px] text-tertiary">{rows.length} / 10</span>
          </button>
        </div>
      </div>

      <Port type="target" side="top" offset={BRANCH_WIDTH / 2} tone="seq" />
      {rows.map((row, i) => (
        <Port
          key={row.descriptor}
          id={`d${row.descriptor}`}
          type="source"
          side="right"
          offset={FIRST_PORT_Y + i * PORT_PITCH}
          tone="keyword"
        />
      ))}
    </div>
  );
}

export const BranchNode = memo(BranchNodeImpl);
