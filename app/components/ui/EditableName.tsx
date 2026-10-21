'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

/**
 * EditableName — a document name that renames in place, click to edit.
 *
 * The name is the first thing left at a default ("untitled") and the last
 * thing anyone fixes, so it edits exactly where it is read — the top bar
 * and the pipeline inspector header both use this. The resting state is the
 * name plus the `.pointy` suffix; editing swaps in an input carrying just
 * the name, because the suffix is display chrome and typing it is noise.
 *
 * Commit rules: Enter or blur accepts, Escape cancels (no accidental
 * rename on click-away mid-thought), whitespace-only is not a rename, and
 * a typed ".pointy" is stripped rather than doubling the suffix. The
 * input sizes itself in `ch` to the text, so it never looks like a text
 * box dropped into the bar.
 */
export function EditableName({
  name,
  onRename,
  className,
  inputClassName,
}: {
  name: string;
  onRename: (name: string) => void;
  /** Classes for the resting label-button, e.g. the bar's typography. */
  className?: string;
  /** Classes for the input while editing — usually the same typography. */
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus after the swap so keystrokes land in the input, not the page.
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim().replace(/\.pointy$/i, '');
    // Empty or unchanged: the press was not a rename, so nothing moves.
    if (!next || next === name) return;
    onRename(next);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        aria-label={`Rename ${name}.pointy`}
        className={cn(
          'cursor-text rounded-[4px] px-1 hover:bg-bg-sunken',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
          className,
        )}
      >
        {name}.pointy
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      size={Math.max(draft.length + 1, 6)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        // Cancel explicitly: Escape means "leave the name alone", and that
        // intent should never travel through the commit path at all.
        if (e.key === 'Escape') setEditing(false);
      }}
      aria-label="Pipeline name"
      className={cn(
        'rounded-[4px] border border-seq/60 bg-bg-sunken px-1 text-primary outline-none',
        inputClassName,
      )}
    />
  );
}
