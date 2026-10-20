'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * CollapsibleSection — a group label that opens and closes with the pointer.
 *
 * Same header treatment as SectionHeader (Figma 61:5856) — the label is typed
 * uppercase, mono, tertiary — plus a disclosure: the label itself is a `<button>`
 * carrying aria-expanded/aria-controls, so mouse, keyboard and screen readers all
 * operate the same one control. The chevron rotates; nothing else moves.
 *
 * Three rules to keep if this grows:
 *
 *  - `title` holds the label and `children` the CONTENT, unlike SectionHeader
 *    where children is the label. A collapsible has two payloads, so the label
 *    needed its own prop; overloading children would make both unreadable.
 *  - The trailing action (＋ add, Open editor →) is a SIBLING of the toggle,
 *    never its child: HTML forbids nested buttons, and pressing the action must
 *    not toggle the section it acts on.
 *  - Children stay MOUNTED while collapsed — hidden via the `hidden` attribute
 *    and stripped of layout classes so the attribute's display:none cannot lose
 *    a specificity fight. Collapsing the source file must not throw away the
 *    editor's cursor, scroll position or a half-typed form state.
 *
 * Controlled (`open` + `onOpenChange`) when the panel owns the state — that is
 * what lets a collapse survive switching events and tabs. Uncontrolled
 * (`defaultOpen`) for self-contained uses. If both are passed, `open` wins.
 */
export interface CollapsibleSectionProps {
  /** Group label, uppercase typed into the string like SectionHeader. */
  title: string;
  /** Controlled state. When present it overrides `defaultOpen`. */
  open?: boolean;
  /** Fires on every toggle, controlled or not. */
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled initial state. Sections start expanded. */
  defaultOpen?: boolean;
  /** Trailing ghost action, e.g. `＋ add`. Does not toggle the section. */
  action?: string;
  onAction?: () => void;
  /** Classes for the outer wrapper (layout in the parent column). */
  className?: string;
  /** Classes for the content region, e.g. `min-h-0 flex-1` to fill a panel. */
  contentClassName?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  open,
  onOpenChange,
  defaultOpen = true,
  action,
  onAction,
  className,
  contentClassName,
  children,
}: CollapsibleSectionProps) {
  const contentId = useId();
  const [selfOpen, setSelfOpen] = useState(defaultOpen);
  const isOpen = open ?? selfOpen;

  function toggle() {
    const next = !isOpen;
    if (open === undefined) setSelfOpen(next);
    onOpenChange?.(next);
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex min-h-4 w-full items-center">
        {/*
          The disclosure itself. py/-my widens the pointer target past the
          16px row without changing the row's height.
        */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className={cn(
            'group -ml-1 flex cursor-pointer items-center gap-1.5 py-1 pl-1',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'font-mono text-[7px] leading-none text-tertiary transition-transform duration-150',
              'group-hover:text-secondary',
              isOpen && 'rotate-90',
            )}
          >
            ▶
          </span>
          <span className="ds-section-label group-hover:text-secondary">{title}</span>
        </button>

        <span className="flex-1" />

        {action && (
          <button
            type="button"
            onClick={onAction}
            className={cn(
              '-my-1 cursor-pointer py-1 font-sans text-[10.5px] text-seq hover:underline',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
            )}
          >
            {action}
          </button>
        )}
      </div>

      {/* Collapsed: only the `hidden` attribute — no display class to beat it. */}
      <div
        id={contentId}
        hidden={!isOpen}
        className={isOpen ? cn('mt-4 flex flex-col', contentClassName) : undefined}
      >
        {children}
      </div>
    </div>
  );
}
