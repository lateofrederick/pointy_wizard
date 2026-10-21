'use client';

import { useEffect, useRef } from 'react';
import { useStore } from 'reactflow';
import type { WireOperator } from '../../lib/pointy';
import type { Point } from '../../lib/pointy/geometry';
import { cn } from '../../lib/cn';

export interface WirePopoverProps {
  /** PopHeader line: `From → to`. */
  title: string;
  operator: WireOperator;
  /** The wire's midpoint in flow coordinates — the popover hangs off this. */
  anchor: Point;
  onSetOperator: (operator: 'seq' | 'pipe' | 'parallel') => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * The operator popover on a wire — Figma screen 07, layer `WirePopover`
 * (17:2164).
 *
 * Opens on wire CLICK: Phase 0 settled that the operator chips on wires stay
 * as visual labels, so the wire itself (its 14px invisible stroke) is the
 * click target, and the popover is the canvas-side control that pairs with the
 * inspector's OPERATOR section. Both call the same pure operations —
 * `setWireOperator` / `setParallel` to change, `disconnect` to delete — so
 * neither can drift.
 *
 * All three operators are live. `||` is structural rather than a relabel, but
 * that is an implementation detail, not a reason to dim the row: the popover
 * routes it through `setParallel`, which rewrites the join in both directions.
 * Only a branch wire is not changeable here — its identity is the descriptor
 * port it leaves, and that is edited on the node.
 *
 * Position: flow-coordinates midpoint + reactflow's live viewport transform,
 * so the popover stays glued to the wire while the canvas pans or zooms.
 * Anchored bottom-centre, above the wire, the way screen 07 sits it.
 */
export function WirePopover({
  title,
  operator,
  anchor,
  onSetOperator,
  onDelete,
  onClose,
}: WirePopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tx, ty, zoom] = useStore((s) => s.transform);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  /** A branch wire's operator is its descriptor — that lives on the node. */
  const editable = operator !== 'branch';

  const blockedReason =
    'A branch wire is defined by its descriptor, which comes from the port it leaves. Edit the branch rows on the node instead.';

  /** Skip the write when the row is already the current operator — no undo noise. */
  const pick = (op: 'seq' | 'pipe' | 'parallel') => {
    if (op !== operator) onSetOperator(op);
  };

  const rowBase = 'flex w-full items-center gap-2.5 px-[11px] py-[7px] text-left';

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Connection ${title}`}
      style={{
        left: tx + anchor.x * zoom,
        top: ty + anchor.y * zoom - 10,
        transform: 'translate(-50%, -100%)',
      }}
      className="absolute z-50 w-[230px] rounded-[9px] border border-edge-strong bg-bg-surface pb-[5px] shadow-modal"
    >
      <p className="truncate border-b border-edge-subtle px-[11px] pt-[9px] pb-2 font-mono text-[9.4px] text-tertiary">
        {title}
      </p>

      <button
        type="button"
        role="menuitem"
        disabled={!editable}
        aria-disabled={!editable}
        onClick={() => pick('seq')}
        className={cn(
          rowBase,
          !editable && 'cursor-not-allowed',
          operator === 'seq' ? 'bg-seq-tint' : editable && 'cursor-pointer hover:bg-neutral-tint',
        )}
      >
        <span aria-hidden className="font-mono text-[10.5px] font-medium text-seq">
          -&gt;
        </span>
        <span
          className={cn(
            'font-sans text-[10.5px]',
            operator === 'seq'
              ? 'font-medium text-primary'
              : editable
                ? 'text-secondary'
                : 'text-disabled',
          )}
        >
          Sequential
        </span>
        <span className="flex-1" />
        {operator === 'seq' && (
          <span aria-hidden className="text-[10px] text-seq">
            ✓
          </span>
        )}
      </button>

      <button
        type="button"
        role="menuitem"
        disabled={!editable}
        aria-disabled={!editable}
        onClick={() => pick('pipe')}
        className={cn(
          rowBase,
          !editable && 'cursor-not-allowed',
          operator === 'pipe' ? 'bg-flow-tint' : editable && 'cursor-pointer hover:bg-neutral-tint',
        )}
      >
        <span aria-hidden className="font-mono text-[10.5px] font-medium text-flow">
          |-&gt;
        </span>
        <span
          className={cn(
            'font-sans text-[10.5px]',
            operator === 'pipe'
              ? 'font-medium text-primary'
              : editable
                ? 'text-secondary'
                : 'text-disabled',
          )}
        >
          Streaming pipe
        </span>
        <span className="flex-1" />
        {operator === 'pipe' && (
          <span aria-hidden className="text-[10px] text-flow">
            ✓
          </span>
        )}
      </button>

      <button
        type="button"
        role="menuitem"
        disabled={!editable}
        aria-disabled={!editable}
        onClick={() => pick('parallel')}
        className={cn(
          rowBase,
          !editable && 'cursor-not-allowed',
          operator === 'parallel' ? 'bg-flow-tint' : editable && 'cursor-pointer hover:bg-neutral-tint',
        )}
      >
        <span aria-hidden className="font-mono text-[10.5px] font-medium text-flow">
          ||
        </span>
        <span
          className={cn(
            'font-sans text-[10.5px]',
            operator === 'parallel'
              ? 'font-medium text-primary'
              : editable
                ? 'text-secondary'
                : 'text-disabled',
          )}
        >
          Parallel
        </span>
        <span className="flex-1" />
        {operator === 'parallel' && (
          <span aria-hidden className="text-[10px] text-flow">
            ✓
          </span>
        )}
      </button>

      {/* Same note the context menu shows: a rule the canvas enforces should
          say why, not just dim the row. */}
      {!editable && (
        <div className="mx-2 mt-1.5 rounded-[6px] border border-warn/35 bg-warn-tint px-2.5 py-2">
          <p className="font-sans text-[9.5px] font-medium text-warn">
            ⊘ Operator isn’t changeable here
          </p>
          <p className="mt-1 font-sans text-[9px] leading-[14px] text-secondary">{blockedReason}</p>
        </div>
      )}

      <div className="my-1 border-t border-edge-subtle" />

      <button
        type="button"
        role="menuitem"
        // A || wire cannot be cut on its own — the pure op refuses it anyway;
        // dimming here shows the rule before the click, not after. The
        // Sequential row is the way out of a pair.
        disabled={operator === 'parallel'}
        aria-disabled={operator === 'parallel'}
        onClick={() => {
          onDelete();
          onClose();
        }}
        className={cn(
          rowBase,
          'font-sans text-[10.5px]',
          operator === 'parallel'
            ? 'cursor-not-allowed text-disabled'
            : 'cursor-pointer text-danger hover:bg-danger-tint',
        )}
      >
        <span aria-hidden className="font-mono text-[10px]">
          ✕
        </span>
        <span className="flex-1">Delete connection</span>
        <span className="font-mono text-[9.5px] text-tertiary">⌫</span>
      </button>
    </div>
  );
}
