'use client';

import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';

/**
 * OperatorLegend — Figma screen 03, floating over the canvas's bottom-left.
 *
 * The wire is the execution-model language (§6 of docs/ui-migration.md) and it
 * is unreadable until someone has learned it, so the legend carries the three
 * operators with the one sentence each that cannot be inferred from the
 * drawing: what the arrow *waits for*, what streaming starts early, what
 * parallel actually runs on. The glyphs are the wire forms at reduced scale —
 * solid strand, chevroned strand, split lanes — not the text operators alone,
 * because the form is half the meaning.
 *
 * It is ONCE-ONLY onboarding, not permanent chrome: the moment it is first
 * shown its flag is written, so it never returns — close or no close. The ✕
 * is for "not now", the flag is for "not again". Without the flag the card
 * would fight the canvas it floats over for every user who has already
 * learned the language.
 *
 * Shown from an effect, never from render: the server cannot know the flag,
 * so rendering it optimistically would either flash the card for users who
 * dismissed it or desync the first client paint.
 */
const SEEN_KEY = 'pw-execution-model-seen';

const ROWS = [
  {
    op: '->',
    name: 'sequential',
    description: 'next event waits for (True, result)',
    className: 'text-seq',
    spec: (
      <>
        <path
          d="M4 10H40.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M40 5.5 51 10 40 14.5Z" fill="currentColor" />
      </>
    ),
  },
  {
    op: '|->',
    name: 'streaming',
    description: 'downstream starts before upstream ends',
    className: 'text-flow',
    spec: (
      <>
        <path
          d="M4 10H40.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M40 5.5 51 10 40 14.5Z" fill="currentColor" />
        <path
          d="M13 6.5 16.5 10 13 13.5M25 6.5 28.5 10 25 13.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </>
    ),
  },
  {
    op: '||',
    name: 'parallel',
    description: 'both run at once in a process pool',
    className: 'text-flow',
    spec: (
      <>
        <path
          d="M4 5.5C14 5.5 26 10 40.5 10M4 14.5C14 14.5 26 10 40.5 10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M40 5.5 51 10 40 14.5Z" fill="currentColor" />
      </>
    ),
  },
] as const;

const FOOTNOTE = [
  { op: '*n', name: 'retry' },
  { op: '( )', name: 'branch' },
  { op: '{ }', name: 'concurrency group' },
] as const;

export function OperatorLegend() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== null) return;
      // First sight IS the one appearance — flag it now, not on close, so the
      // card never comes back even to someone who never presses ✕.
      localStorage.setItem(SEEN_KEY, '1');
      setVisible(true);
    } catch {
      // Private mode keeps no memory; the card simply shows each session.
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <aside className="absolute bottom-6 left-5 z-10 rounded-[8px] border border-edge bg-bg-surface px-4 py-[14px]">
      <div className="flex items-center">
        <h2 className="ds-section-label">EXECUTION MODEL</h2>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Close execution model card"
          title="Close — this card will not appear again"
          className={cn(
            '-mt-px -mr-1 cursor-pointer px-1 font-sans text-[12px] text-tertiary',
            'hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
          )}
        >
          ✕
        </button>
      </div>

      <div className="mt-[11px] flex flex-col gap-[7px]">
        {ROWS.map((row) => (
          <div key={row.op} className="flex h-[26px] items-center gap-[11px]">
            <svg
              width="58"
              height="20"
              viewBox="0 0 58 20"
              aria-hidden
              className={`shrink-0 ${row.className}`}
            >
              {row.spec}
            </svg>
            <span className={`w-6 font-mono text-[11px] font-medium ${row.className}`}>
              {row.op}
            </span>
            <span className="w-16 font-sans text-[10.5px] font-medium text-primary/90">
              {row.name}
            </span>
            <span className="font-sans text-[9.5px] text-tertiary">{row.description}</span>
          </div>
        ))}
      </div>

      <div className="mt-[11px] flex items-baseline gap-5">
        {FOOTNOTE.map((item) => (
          <span key={item.op} className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="font-mono text-[11px] font-medium text-tertiary">{item.op}</span>
            <span className="font-sans text-[10px] text-disabled">{item.name}</span>
          </span>
        ))}
      </div>
    </aside>
  );
}
