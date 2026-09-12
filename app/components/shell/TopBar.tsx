'use client';

import type { Diagnostic } from '../../lib/pointy';
import { hasErrors, summarise } from '../../lib/pointy';
import { Button, Chip, ThemeToggle } from '../ui';

/**
 * Top bar — Figma screen 03.
 *
 * The validity chip and the Run button are the same fact stated twice: a
 * pipeline that does not compile cannot be run, so Run is disabled whenever the
 * chip is red. Screen 12 is the reminder that a *runtime* failure is a separate
 * state — the pipeline stays VALID and Run stays enabled.
 */
export function TopBar({
  filename,
  diagnostics,
  dirty,
}: {
  filename: string;
  diagnostics: Diagnostic[];
  dirty?: boolean;
}) {
  const broken = hasErrors(diagnostics);
  const summary = summarise(diagnostics);
  const warnOnly = !broken && diagnostics.length > 0;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-edge bg-bg-surface px-[22px]">
      <div className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-seq">
        <span aria-hidden className="font-mono text-[12px] font-medium text-bg-sunken">
          ▸
        </span>
      </div>

      <span className="font-mono text-[13px] font-medium text-primary">
        {filename}.pointy
      </span>
      {dirty && <span aria-label="Unsaved changes" className="text-[8px] text-seq">●</span>}
      <span className="font-sans text-[10.5px] text-tertiary">Edited just now</span>

      <span className="flex-1" />

      <Chip tone={broken ? 'red' : warnOnly ? 'amber' : 'green'}>
        {broken ? `✕ ${summary.toUpperCase()}` : warnOnly ? `⚠ ${summary}` : '✓ VALID POINTY'}
      </Chip>

      <ThemeToggle />

      <Button kind="secondary">↓ Export .pty</Button>
      <Button kind="primary" shortcut="⌘↵" disabled={broken}>
        ▶ Run pipeline
      </Button>
    </header>
  );
}
