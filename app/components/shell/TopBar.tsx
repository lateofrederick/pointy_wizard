'use client';

import Link from 'next/link';
import type { Diagnostic } from '../../lib/pointy';
import { hasErrors, summarise } from '../../lib/pointy';
import { Button, Chip, EditableName, ThemeToggle } from '../ui';
import { useSession } from '../../lib/session';
import { runButtonLabel, type RunView } from '../../lib/runView';
import { ZoomControl } from '../canvas/ZoomControl';

/**
 * Top bar — Figma screen 03.
 *
 * The validity chip and the Run button are the same fact stated twice: a
 * pipeline that does not compile cannot be run, so Run is disabled whenever the
 * chip is red. Screen 12 is the reminder that a *runtime* failure is a separate
 * state — the pipeline stays VALID and Run stays enabled.
 *
 * Run opens the output panel's RUN OUTPUT view, and while that view is open the
 * button says "Re-run pipeline" (Figma's BtnRun on screen 12). There is no
 * runner service behind either press — lib/runView.ts owns what the panel says
 * about that — but the disable rule does not change with the label: lint errors
 * keep Run impossible in both states.
 */
export function TopBar({
  filename,
  onRename,
  diagnostics,
  dirty,
  saving,
  savedAt,
  error,
  onSave,
  saveLabel = 'Save',
  onExport,
  onPublish,
  runView = 'source',
  onRun,
}: {
  filename: string;
  /** Renames the document — the name is edited where it is read. */
  onRename: (name: string) => void;
  diagnostics: Diagnostic[];
  dirty?: boolean;
  saving?: boolean;
  savedAt?: string;
  error?: string | null;
  /** Omitted on the local scratchpad, which has nowhere to save to. */
  onSave?: () => void;
  /** "Save", "Save to my pipelines", or "Sign in to save" — see AppShell. */
  saveLabel?: string;
  onExport?: () => void;
  /** Opens the Publish to EventHub modal — an inert shell, see PublishModal. */
  onPublish?: () => void;
  /** Which label the Run button wears — 'run' while RUN OUTPUT is open. */
  runView?: RunView;
  /** Opens the run view; pressed again while it is open, it is a re-run. */
  onRun?: () => void;
}) {
  const user = useSession();
  const broken = hasErrors(diagnostics);
  const summary = summarise(diagnostics);
  const warnOnly = !broken && diagnostics.length > 0;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-edge bg-bg-surface px-[22px]">
      <Link
        href="/pipelines"
        aria-label="Back to your pipelines"
        className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-seq"
      >
        <span aria-hidden className="font-mono text-[12px] font-medium text-bg-sunken">
          ▸
        </span>
      </Link>

      <EditableName
        name={filename}
        onRename={onRename}
        className="font-mono text-[13px] font-medium text-primary"
        inputClassName="font-mono text-[13px] font-medium"
      />
      {dirty && <span aria-label="Unsaved changes" className="text-[8px] text-seq">●</span>}
      <span className="font-sans text-[10.5px] text-tertiary">
        {saving
          ? 'Saving…'
          : !user
            ? 'Kept in this browser'
            : dirty
              ? 'Unsaved changes'
              : savedAt
                ? 'Saved'
                : 'Not saved yet'}
      </span>
      {error && (
        <span role="alert" className="font-sans text-[10.5px] text-danger">
          {error}
        </span>
      )}

      <span className="flex-1" />

      <Chip tone={broken ? 'red' : warnOnly ? 'amber' : 'green'}>
        {broken ? `✕ ${summary.toUpperCase()}` : warnOnly ? `⚠ ${summary}` : '✓ VALID POINTY'}
      </Chip>

      {/* Zoom belongs to the canvas, not the bar — the control just reports
          what the viewport is doing and hands back a click. See
          canvas/ZoomControl and canvas/viewportStore. */}
      <ZoomControl />
      <span aria-hidden className="h-5 w-px bg-edge" />

      <Button kind="secondary" onClick={onExport}>
        ↓ Export .pointy
      </Button>

      {/* Open to anyone, signed out included — like the rest of the editor.
          What is gated is the publish itself, and the modal says so. */}
      {onPublish && (
        <Button kind="secondary" onClick={onPublish}>
          ◇ Publish to EventHub
        </Button>
      )}

      {onSave && (
        <Button
          kind="secondary"
          shortcut="⌘S"
          onClick={onSave}
          // Signed out, Save is an invitation rather than a no-op, so it stays
          // live even when nothing has changed.
          disabled={saving || (!!user && !dirty)}
        >
          {saveLabel}
        </Button>
      )}

      {/* Compile, not runtime, decides this: a broken pipeline has no run to
          start or re-start, so the label changes with the view but `disabled`
          does not — see the comment at the top of the file. */}
      <Button kind="primary" shortcut="⌘↵" disabled={broken} onClick={onRun}>
        {runButtonLabel(runView)}
      </Button>

      {/* Signed out there is no second "Sign in" here: the Save button already
          says "Sign in to save", and two of them on one bar is one too many. */}
      {user && (
        <Link
          href="/pipelines"
          className="grid h-[26px] w-[26px] place-items-center rounded-[6px] bg-flow font-sans text-[11px] font-medium text-white"
          aria-label="Your pipelines"
        >
          {(user.name?.trim() || user.email).slice(0, 1).toUpperCase()}
        </Link>
      )}

      <ThemeToggle />
    </header>
  );
}
