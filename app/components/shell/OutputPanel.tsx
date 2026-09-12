'use client';

import { useMemo, useState } from 'react';
import { highlight, TOKEN_CLASS } from '../../lib/pointy/highlight';
import type { Diagnostic } from '../../lib/pointy';
import { hasErrors } from '../../lib/pointy';
import { cn } from '../../lib/cn';
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
 */
export function OutputPanel({
  filename,
  source,
  diagnostics,
}: {
  filename: string;
  source: string;
  diagnostics: Diagnostic[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const lines = useMemo(() => highlight(source), [source]);
  const broken = hasErrors(diagnostics);

  return (
    <section className="flex min-h-0 flex-col border-t border-edge bg-bg-surface">
      <div className="flex h-[42px] shrink-0 items-center gap-3 px-5">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="cursor-pointer font-sans text-[9px] text-tertiary hover:text-primary"
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span className="ds-section-label">LIVE POINTY OUTPUT</span>
        <span className="font-mono text-[10px] text-tertiary">{filename}.pointy</span>

        <Chip tone={broken ? 'red' : 'green'}>
          {broken
            ? `✕ ${diagnostics.filter((d) => d.severity === 'error').length} errors`
            : '✓ compiled'}
        </Chip>

        <span className="flex-1" />
        <PanelAction label="⧉ Copy" onClick={() => navigator.clipboard?.writeText(source)} />
        <PanelAction label="↓ Download" />
      </div>

      {!collapsed && (
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
