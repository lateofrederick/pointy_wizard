'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '../../lib/cn';

/**
 * ResizeHandle — the vertical divider you drag to widen or narrow the panel
 * beside it (the inspector on the right edge of the shell).
 *
 * Interaction rules, chosen so the thing behaves like a window sash rather
 * than a decoration:
 *
 *  - Drag: pointerdown records the pointer and the panel's width, pointermove
 *    applies the delta (`startWidth + startX - clientX` — the handle sits on
 *    the panel's LEFT edge, so dragging left widens). Listeners live on
 *    `window`, not on the element, so the drag survives the pointer leaving
 *    the 6px strip, and no pointer-capture API is assumed (jsdom has none).
 *  - Clamped to [min, max]: a panel can be dragged to nothing or to the whole
 *    window, and neither is recoverable with the mouse.
 *  - Keyboard: role="separator" with valuemin/max/now and a label, arrows
 *    adjust (Shift = larger steps), Home resets. A pointer-only resize is a
 *    control some people cannot operate.
 *  - Double-click resets to the default — the standard escape hatch from a
 *    drag that went somewhere silly.
 */
export function ResizeHandle({
  width,
  min,
  max,
  label,
  onResize,
  onReset,
  className,
}: {
  /** Current panel width, mirrored into aria-valuenow. */
  width: number;
  min: number;
  max: number;
  /** Accessible name, e.g. "Resize inspector". */
  label: string;
  onResize: (width: number) => void;
  /** Restores the default width; also bound to double-click. */
  onReset: () => void;
  className?: string;
}) {
  const [dragging, setDragging] = useState(false);
  // Ref, not state: the drag must keep the width captured at pointerdown, not
  // the one from the render that happens between two moves.
  const origin = useRef<{ x: number; width: number } | null>(null);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    origin.current = { x: e.clientX, width };
    setDragging(true);
    // Dragging across text would select it under the cursor.
    document.body.style.userSelect = 'none';

    const move = (ev: globalThis.PointerEvent) => {
      const start = origin.current;
      if (!start) return;
      onResize(clamp(start.width + (start.x - ev.clientX)));
    };
    const up = () => {
      origin.current = null;
      setDragging(false);
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 48 : 16;
    switch (e.key) {
      // The panel is to the right: ← pulls its left edge left, wider.
      case 'ArrowLeft':
        e.preventDefault();
        onResize(clamp(width + step));
        break;
      case 'ArrowRight':
        e.preventDefault();
        onResize(clamp(width - step));
        break;
      case 'Home':
        e.preventDefault();
        onReset();
        break;
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
      title={`${label} · double-click to reset`}
      className={cn(
        // Straddles the panel's edge: 3px each side, so the strip is 6px
        // wide without eating content or the panel's border.
        'absolute top-0 -left-[3px] z-10 h-full w-[6px] cursor-col-resize touch-none',
        'hover:bg-seq/30 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-seq',
        dragging && 'bg-seq/50',
        className,
      )}
    />
  );
}
