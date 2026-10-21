'use client';

import { useSyncExternalStore } from 'react';

/**
 * The live zoom, shared between the canvas and the top bar.
 *
 * The TopBar sits outside ReactFlowProvider (see AppShell), so it cannot read
 * reactflow's store or call fitView — and AppShell is a shared file every
 * feature edits, so lifting the viewport through it would be a merge conflict
 * generator. Instead the canvas publishes the zoom it is actually showing, and
 * registers how to apply a change; this module is the wire between the two.
 *
 * The range matches Canvas's minZoom/maxZoom: the canvas is the source of
 * truth for what zoom *means*, this only enforces the ends of it.
 */
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2;

/** The canvas's defaultViewport — screen 03 draws the control reading 92%. */
const INITIAL_ZOOM = 0.92;

let zoom = INITIAL_ZOOM;
let applyZoom: ((z: number) => void) | null = null;
let fit: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const viewport = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  read(): number {
    return zoom;
  },

  /** Canvas reports the viewport reactflow is showing (wheel, pan, fit). */
  publish(next: number) {
    if (Math.abs(next - zoom) < 0.001) return;
    zoom = next;
    emit();
  },

  /** Canvas offers the handles the top bar's buttons drive. */
  register(handles: { zoomTo: (z: number) => void; fit: () => void }): () => void {
    applyZoom = handles.zoomTo;
    fit = handles.fit;
    return () => {
      applyZoom = null;
      fit = null;
    };
  },

  setZoom(next: number) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    // Published optimistically: reactflow animates viewport changes, and a
    // percentage that lags the click reads as a broken control.
    zoom = clamped;
    emit();
    applyZoom?.(clamped);
  },

  zoomBy(factor: number) {
    viewport.setZoom(zoom * factor);
  },

  reset() {
    viewport.setZoom(1);
  },

  fit() {
    fit?.();
  },
};

/** Top bar: re-render when the canvas's zoom moves. */
export function useViewportZoom(): number {
  return useSyncExternalStore(viewport.subscribe, viewport.read, viewport.read);
}
