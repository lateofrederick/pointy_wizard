'use client';

import { useState } from 'react';
import { useReactFlow } from 'reactflow';
import { cn } from '../../lib/cn';

/**
 * ToolPill — Figma screen 03, floating at the canvas's top-left.
 *
 * Three mode buttons and, after a separator, fit-to-view. The modes are a
 * selectable state only for now: the canvas has one gesture set and pretends
 * otherwise would be a lie, but the control is in every screen of the deck and
 * its absence is more conspicuous than a pill that only highlights.
 *
 * Fit is real — it hands back to reactflow, which already knows the graph's
 * bounds and the 0.3–2 zoom range.
 */
type Tool = 'select' | 'pan' | 'wire';

const TOOLS: { id: Tool; glyph: string; label: string }[] = [
  { id: 'select', glyph: '↖', label: 'Select tool' },
  { id: 'pan', glyph: '✥', label: 'Pan tool' },
  { id: 'wire', glyph: '⌗', label: 'Wire tool' },
];

export function ToolPill() {
  const { fitView } = useReactFlow();
  const [tool, setTool] = useState<Tool>('select');

  return (
    <div className="absolute left-4 top-4 z-10 flex items-center gap-[2px] rounded-[8px] border border-edge-strong bg-bg-surface p-1">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-label={t.label}
          aria-pressed={tool === t.id}
          onClick={() => setTool(t.id)}
          className={cn(
            'grid h-[26px] w-[28px] cursor-pointer place-items-center rounded-[5px]',
            'font-sans text-[12px] leading-none transition-colors',
            tool === t.id
              ? 'bg-seq-tint text-seq'
              : 'text-tertiary hover:bg-neutral-tint hover:text-secondary',
          )}
        >
          <span aria-hidden>{t.glyph}</span>
        </button>
      ))}

      <span aria-hidden className="mx-[1px] my-[5px] w-px bg-edge-strong" />

      <button
        type="button"
        aria-label="Fit view to graph"
        onClick={() => void fitView({ padding: 0.2, duration: 250 })}
        className={cn(
          'grid h-[26px] w-[28px] cursor-pointer place-items-center rounded-[5px]',
          'font-sans text-[12px] leading-none text-tertiary',
          'transition-colors hover:bg-neutral-tint hover:text-secondary',
        )}
      >
        <span aria-hidden>⤢</span>
      </button>
    </div>
  );
}
