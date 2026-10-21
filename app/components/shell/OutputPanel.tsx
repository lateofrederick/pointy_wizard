'use client';

import { useMemo } from 'react';
import { highlight, TOKEN_CLASS } from '../../lib/pointy/highlight';
import type { Diagnostic } from '../../lib/pointy';
import { hasErrors } from '../../lib/pointy';
import { cn } from '../../lib/cn';
import type { RunEvent, RunView } from '../../lib/runView';
import { RUN_STATUS_COPY } from '../../lib/runView';
import { Chip } from '../ui';

/**
 * LIVE POINTY OUTPUT — Figma screen 03, and its error state on screen 10.
 *
 * The source is emitted from the document on every change, so it is never a
 * stale copy of the graph: if the panel and the canvas disagree, that is a bug
 * in emit(), not a sync problem.
 *
 * When there are diagnostics the panel splits and the problems list appears
 * beside the code, with the offending line numbers tinted.
 *
 * RUN OUTPUT — screen 12's chrome, and only its chrome. There is no runner
 * service behind this build (todo.txt, "WHY 11 AND 12 ARE NOT BUILT"), so the
 * mode shows the gutter and the absence of a run instead of the sample log the
 * frame was drawn with: no run number, no timings, no per-event lines. Full
 * logs and Re-run explain on click rather than failing silently or pretending.
 *
 * The panel FILLS its slot (h-full) rather than hugging its content: the
 * PROBLEMS column comes and goes with the diagnostics, and a content-sized
 * panel would shrink when they clear, leaving the page background showing
 * under the slot. Collapse is controlled by AppShell, which owns the slot's
 * height — so collapsing genuinely reclaims the space instead of revealing a
 * dark strip below a fixed-height wrapper.
 */
export function OutputPanel({
  filename,
  source,
  diagnostics,
  onDownload,
  onFix,
  runView = 'source',
  runNotice = null,
  onRunEvent,
  collapsed,
  onToggleCollapse,
}: {
  filename: string;
  source: string;
  diagnostics: Diagnostic[];
  onDownload?: () => void;
  /** Runs the single fix a diagnostic promises. */
  onFix?: (d: Diagnostic) => void;
  /** Which pair of header/body is showing: the source, or screen 12's run view. */
  runView?: RunView;
  /** Why the last Full logs / Re-run press did nothing — see lib/runView.ts. */
  runNotice?: string | null;
  /** How this view's controls reach the run state AppShell owns. */
  onRunEvent?: (event: RunEvent) => void;
  /** Controlled by AppShell — its wrapper's height follows this. */
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const lines = useMemo(() => highlight(source), [source]);
  const broken = hasErrors(diagnostics);
  const inRun = runView === 'run';

  return (
    <section className="flex h-full min-h-0 flex-col border-t border-edge bg-bg-surface">
      <div className="flex h-[42px] shrink-0 items-center gap-3 px-5">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand output panel' : 'Collapse output panel'}
          className="cursor-pointer font-sans text-[9px] text-tertiary hover:text-primary"
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span className="ds-section-label">
          {inRun ? 'RUN OUTPUT' : 'LIVE POINTY OUTPUT'}
        </span>
        {inRun ? (
          <span className="font-mono text-[10px] text-tertiary">{RUN_STATUS_COPY}</span>
        ) : (
          <span className="font-mono text-[10px] text-tertiary">{filename}.pointy</span>
        )}

        {/* Stays the COMPILE chip while the run view is open, deliberately: a
            run that never happened has no outcome to report, and a pipeline
            broken while this view is open must keep saying so. Compile and
            runtime are separate states — the reason screen 12 exists. */}
        <Chip tone={broken ? 'red' : 'green'}>
          {broken
            ? `✕ ${diagnostics.filter((d) => d.severity === 'error').length} errors`
            : '✓ compiled'}
        </Chip>

        <span className="flex-1" />
        {inRun ? (
          <>
            <PanelAction
              label="⧉ Full logs"
              onClick={() => onRunEvent?.({ type: 'logs' })}
            />
            <PanelAction label="↓ Re-run" onClick={() => onRunEvent?.({ type: 'run' })} />
            {/* The run view is a view, not a destination: the emitted source
                stays one click away. */}
            <PanelAction
              label="← Source"
              onClick={() => onRunEvent?.({ type: 'source' })}
            />
          </>
        ) : (
          <>
            <PanelAction
              label="⧉ Copy"
              onClick={() => navigator.clipboard?.writeText(source)}
            />
            <PanelAction label="↓ Download" onClick={onDownload} />
          </>
        )}
      </div>

      {!collapsed && inRun && <RunOutputEmptyState notice={runNotice} />}

      {!collapsed && !inRun && (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto px-5 pb-4">
            <pre className="font-mono text-[10px] leading-4">
              {lines.map((line) => (
                <div key={line.number} className="flex">
                  <span
                    className={cn(
                      'mr-4 w-6 shrink-0 select-none text-right',
                      'text-tertiary',
                    )}
                  >
                    {line.number}
                  </span>
                  <code className="whitespace-pre">
                    {line.tokens.map((t, i) => (
                      <span key={i} className={TOKEN_CLASS[t.kind]}>
                        {t.value}
                      </span>
                    ))}
                  </code>
                </div>
              ))}
            </pre>
          </div>

          {diagnostics.length > 0 && (
            <div className="w-[340px] shrink-0 overflow-auto border-l border-edge px-4 py-3">
              <p className="ds-section-label mb-2">PROBLEMS</p>
              <div className="flex flex-col gap-2">
                {diagnostics.map((d, i) => (
                  <div key={`${d.code}-${i}`} className="flex gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        'mt-[2px] font-mono text-[9px]',
                        d.severity === 'error' ? 'text-danger' : 'text-warn',
                      )}
                    >
                      {d.severity === 'error' ? '✕' : '⚠'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-sans text-[10px] leading-[15px] text-secondary">
                        {d.message}
                      </p>
                      {/* Every diagnostic names the rule it broke — "invalid
                          pipeline" on its own is not an acceptable string. */}
                      <p className="mt-0.5 font-sans text-[9px] leading-[14px] text-tertiary">
                        {d.rule}
                      </p>
                      {d.fix && (
                        <button
                          type="button"
                          onClick={() => onFix?.(d)}
                          className="mt-1 cursor-pointer font-sans text-[9.5px] font-medium text-seq hover:underline"
                        >
                          {d.fix.label}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PanelAction({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-[5px] border border-edge px-2.5 py-1 font-sans text-[10px] text-secondary hover:text-primary"
    >
      {label}
    </button>
  );
}

/* The run view's body: screen 12's gutter, and the truth where its sample log
 * was. One invented line — a timing, an event name, a "run #14" — would be
 * fabricating history for a service that does not exist, so the panel renders
 * the absence instead. A runtime would append to these lines as it goes.
 */
const RUN_EMPTY_LINES = [
  'no run output',
  '',
  'This build has no runner service, so Run pipeline opens this view and starts',
  'nothing: the pipeline is not executed anywhere, no logs are written, and',
  'there is no run to report.',
  '',
  'A runtime would write one line per event here as it runs — timings, retries,',
  'the descriptor each branch took, and how the run ended.',
];

function RunOutputEmptyState({ notice }: { notice: string | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-5 pb-4">
      <pre className="font-mono text-[10px] leading-4">
        {RUN_EMPTY_LINES.map((text, i) => (
          <div key={i} className="flex">
            <span
              aria-hidden
              className="mr-4 w-6 shrink-0 select-none text-right text-tertiary"
            >
              {i + 1}
            </span>
            <code
              className={cn(
                'whitespace-pre-wrap',
                i === 0 ? 'text-secondary' : 'text-tertiary',
              )}
            >
              {text}
            </code>
          </div>
        ))}
      </pre>

      {/* The click that could not do what it said. Same pattern as the SSO
          buttons on the sign-in screen: say why, in place, rather than look
          broken or pretend the action ran. */}
      {notice && (
        <p
          role="status"
          className="mt-3 ml-10 max-w-[70ch] font-sans text-[10px] leading-[15px] text-secondary"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
