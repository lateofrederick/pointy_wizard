'use client';

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
 */
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
  return (
    <aside className="absolute bottom-6 left-5 z-10 rounded-[8px] border border-edge bg-bg-surface px-4 py-[14px]">
      <h2 className="ds-section-label">EXECUTION MODEL</h2>

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
