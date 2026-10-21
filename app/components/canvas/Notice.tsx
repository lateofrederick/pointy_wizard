'use client';

import { useEffect } from 'react';
import { cn } from '../../lib/cn';

/**
 * What just happened, or why it didn't.
 *
 * The model refuses a good number of gestures on purpose — connecting into
 * nothing, wrapping a `||` member in a group, a tenth branch path — and every
 * refusal carries the Pointy rule behind it. Without somewhere to put that
 * sentence the canvas simply appears not to respond, which is indistinguishable
 * from being broken.
 *
 * Sits over the canvas rather than in a corner of the window: it is about the
 * gesture you just made, and that is where you are looking.
 */
export function Notice({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    // Long enough to read a sentence about a language rule, then gone.
    const id = window.setTimeout(onDismiss, 7000);
    return () => window.clearTimeout(id);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2',
        'flex max-w-[560px] items-start gap-3 rounded-[8px] border border-edge-strong',
        'bg-bg-raised px-4 py-3 shadow-modal',
      )}
    >
      <span aria-hidden className="mt-px font-mono text-[11px] leading-none text-seq">
        ⓘ
      </span>
      <p className="font-sans text-[11.5px] leading-[17px] text-secondary">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-1 cursor-pointer font-sans text-[11px] leading-none text-tertiary hover:text-primary"
      >
        ✕
      </button>
    </div>
  );
}
