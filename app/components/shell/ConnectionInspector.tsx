'use client';

import type { PointyDocumentStore } from '../../hooks/usePointyDocument';
import { cn } from '../../lib/cn';
import { Callout, SectionHeader } from '../ui';

const OPERATORS = [
  {
    id: 'seq' as const,
    glyph: '->',
    name: 'Sequential',
    blurb: 'The next event waits for (True, result).',
  },
  {
    id: 'pipe' as const,
    glyph: '|->',
    name: 'Streaming pipe',
    blurb: 'Downstream starts before upstream ends. Memory-bounded.',
  },
];

/**
 * The Connection panel — Figma screen 07.
 *
 * Selecting a wire turns the inspector into this. It is where the operator is
 * changed, which matters because the on-wire chips are currently hidden pending
 * a design decision: routing the change through the inspector means the
 * execution model is still editable without pre-empting that call.
 *
 * `||` and branch wires are not editable here. Making a pair parallel or
 * promoting to a branch restructures the chain rather than relabelling one
 * connection, and both have their own gestures.
 */
export function ConnectionInspector({ store }: { store: PointyDocumentStore }) {
  const { selectedWire, flow, changeWireOperator, selectWire } = store;
  if (!selectedWire) return null;

  const name = (id: string) => flow.nodes.find((n) => n.id === id)?.ref.name ?? id;
  const editable = selectedWire.operator === 'seq' || selectedWire.operator === 'pipe';

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-edge bg-bg-surface">
      <div className="flex items-center gap-2 border-l-2 border-seq px-[14px] pt-4 pb-1">
        <h2 className="font-mono text-[13px] font-medium text-primary">
          {name(selectedWire.source)} → {name(selectedWire.target)}
        </h2>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => selectWire(null)}
          aria-label="Clear selection"
          className="cursor-pointer font-sans text-[12px] text-tertiary hover:text-primary"
        >
          ✕
        </button>
      </div>
      <p className="px-[14px] pb-3 font-mono text-[9.4px] text-tertiary">
        <span className="text-seq">CONNECTION</span> · {selectedWire.operator}
      </p>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[14px] py-4">
        <SectionHeader>ENDPOINTS</SectionHeader>
        <div className="rounded-[7px] border border-edge bg-bg-sunken px-3 py-2.5">
          <p className="font-mono text-[10.5px] text-code">
            <span className="text-tertiary">from </span>
            {name(selectedWire.source)}
          </p>
          <p className="mt-1 font-mono text-[10.5px] text-code">
            <span className="text-tertiary">to&nbsp;&nbsp; </span>
            {name(selectedWire.target)}
          </p>
        </div>

        <SectionHeader>OPERATOR</SectionHeader>

        {editable ? (
          <div className="flex flex-col gap-1.5">
            {OPERATORS.map((op) => {
              const active = selectedWire.operator === op.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() =>
                    changeWireOperator(selectedWire.source, selectedWire.target, op.id)
                  }
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded-[7px] border px-3 py-2.5 text-left',
                    active
                      ? 'border-seq/60 bg-seq-tint'
                      : 'border-edge bg-bg-sunken hover:border-edge-strong',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'font-mono text-[11px] font-medium',
                        op.id === 'seq' ? 'text-seq' : 'text-flow',
                      )}
                    >
                      {op.glyph}
                    </span>
                    <span className="font-sans text-[11px] font-medium text-primary">
                      {op.name}
                    </span>
                    {active && <span className="ml-auto text-[10px] text-seq">✓</span>}
                  </span>
                  <span className="font-sans text-[9.5px] leading-[15px] text-tertiary">
                    {op.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Callout tone="info" title={`This is a ${selectedWire.operator} connection`}>
            {selectedWire.operator === 'branch'
              ? 'A branch wire is defined by its descriptor, which comes from the port it leaves. Edit the branch rows on the node instead.'
              : 'A || pair is a structural relationship, not a relabelled connection. Change it by regrouping the events.'}
          </Callout>
        )}

        <SectionHeader>EMITS</SectionHeader>
        <div className="rounded-[7px] border border-edge bg-bg-sunken px-3 py-2.5">
          <code className="font-mono text-[10.5px]">
            <span className="text-primary">{name(selectedWire.source)}</span>{' '}
            <span className={selectedWire.operator === 'pipe' ? 'text-flow' : 'text-seq'}>
              {selectedWire.operator === 'pipe'
                ? '|->'
                : selectedWire.operator === 'parallel'
                  ? '||'
                  : '->'}
            </span>{' '}
            <span className="text-primary">{name(selectedWire.target)}</span>
          </code>
        </div>
      </div>
    </aside>
  );
}
