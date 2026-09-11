'use client';

import { cn } from '../../lib/cn';

/**
 * SectionHeader — Figma component set 61:5856.
 *
 * The same treatment for every group label in the inspector, the modal and the
 * output panel: IDENTITY, DIRECTIVES, SCOPES REQUESTED, PACKAGE CONTENTS…
 *
 * Uppercase is typed into the string, not applied with text-transform, so what
 * ships is what is written here. Screen readers and copy-paste both get the
 * real text.
 */
export interface SectionHeaderProps {
  children: string;
  /** Renders the trailing ghost action. Omit for a plain label. */
  action?: string;
  onAction?: () => void;
  className?: string;
}

export function SectionHeader({
  children,
  action,
  onAction,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex h-4 w-full items-center', className)}>
      <span className="ds-section-label">{children}</span>
      {action && (
        <>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onAction}
            className={cn(
              'cursor-pointer font-sans text-[10.5px] text-seq hover:underline',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
            )}
          >
            {action}
          </button>
        </>
      )}
    </div>
  );
}
