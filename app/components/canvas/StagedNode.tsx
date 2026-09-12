'use client';

import { memo, useEffect, useRef, useState } from 'react';
import type { NodeProps } from 'reactflow';
import type { EventRef } from '../../types/pointy';
import { Port } from './Port';
import { NODE_WIDTH } from './nodeShared';

export interface StagedNodeData {
  ref: EventRef;
  onRename: (name: string) => void;
  onDiscard: () => void;
}

/**
 * A dropped, unnamed event — Figma screen 06.
 *
 * This is the canvas-first route to a custom event and the primary one: drag a
 * blank tile out, name it in place, wire it up. The full modal is the secondary
 * "configure in full" path.
 *
 * It is drawn as a draft because it is not in the program yet: nothing is
 * committed to the chain until a wire reaches it.
 */
function StagedNodeImpl({ data }: NodeProps<StagedNodeData>) {
  const [name, setName] = useState(data.ref.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed) data.onRename(trimmed);
    else data.onDiscard();
  };

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className="relative rounded-[9px] border border-dashed border-seq bg-bg-raised shadow-raised"
    >
      <div className="flex flex-col gap-[7px] px-3 pt-[9px] pb-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-[3px] rounded-[3px] bg-accent-tint px-[5px] py-[2px] font-mono text-[8.6px] leading-none font-medium text-accent">
            <span aria-hidden>✎</span>
            local
          </span>
          <span className="inline-flex items-center rounded-[3px] bg-neutral-tint px-[5px] py-[2px] font-mono text-[8.6px] leading-none font-medium text-tertiary">
            draft
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={data.onDiscard}
            aria-label="Discard draft event"
            className="cursor-pointer px-0.5 font-sans text-[11px] leading-none text-tertiary hover:text-primary"
          >
            ✕
          </button>
        </div>

        <input
          ref={inputRef}
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          onBlur={commit}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') commit();
            if (ev.key === 'Escape') data.onDiscard();
            ev.stopPropagation(); // reactflow swallows keys otherwise
          }}
          aria-label="Event name"
          placeholder="EventName"
          className="w-full rounded-[5px] border border-seq/70 bg-bg-sunken px-2 py-1 font-mono text-[12px] text-primary outline-none placeholder:text-disabled"
        />

        <p className="font-sans text-[9px] text-tertiary">
          Enter to name it · Esc to discard · connect a wire to add it to the pipeline
        </p>
      </div>

      <Port type="target" side="left" filled={false} />
      <Port type="source" side="right" filled={false} />
    </div>
  );
}

export const StagedNode = memo(StagedNodeImpl);
