'use client';

import { viewport, useViewportZoom } from './viewportStore';

/**
 * The `− 92% +` segmented control — Figma screen 03, between the validity chip
 * and Export.
 *
 * The percentage is the canvas's live zoom, not local state: the display and
 * the viewport are one fact, so it follows wheel-zoom, trackpad pinch and
 * fit-to-view as faithfully as its own buttons. It lives in canvas/ because
 * that is where the state it reports is born; the top bar only renders it.
 */
export function ZoomControl() {
  const zoom = useViewportZoom();

  return (
    <div className="inline-flex h-[26px] items-stretch rounded-[6px] border border-edge bg-bg-raised font-mono text-[11px] font-medium">
      <button
        type="button"
        aria-label="Zoom out"
        onClick={() => viewport.zoomBy(1 / 1.1)}
        className="w-[26px] cursor-pointer rounded-l-[5px] text-tertiary transition-colors hover:bg-neutral-tint hover:text-primary"
      >
        <span aria-hidden>−</span>
      </button>
      <button
        type="button"
        aria-label="Reset zoom to 100%"
        onClick={viewport.reset}
        className="w-[44px] cursor-pointer text-secondary transition-colors hover:bg-neutral-tint hover:text-primary"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        onClick={() => viewport.zoomBy(1.1)}
        className="w-[26px] cursor-pointer rounded-r-[5px] text-tertiary transition-colors hover:bg-neutral-tint hover:text-primary"
      >
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}
