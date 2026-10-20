'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { events, highlight, TOKEN_CLASS } from '../../lib/pointy';
import { useSession } from '../../lib/session';
import type { PointyDocument } from '../../types/pointy';
import { Button, Callout, Chip, Field, SectionHeader } from '../ui';

/**
 * Publish to EventHub — Figma screen 11 (`35:1198`).
 *
 * AN INERT SHELL, ON PURPOSE. The design is the full publish flow — target,
 * version, visibility, manifest, package preview — and none of it can be made
 * real: there is no registry service to push a version to, no organisation
 * model to publish under, and no way to learn whether a version is taken
 * without one. So the modal is honest rather than either disabled or fake:
 *
 *  - everything derived from the document is derived for real — the file name,
 *    the emitted source, the line count, the address that WOULD be claimed;
 *  - everything that needs the registry says so. Publish states plainly that
 *    nothing was published, and the footer never claims a contract is
 *    satisfied or a version is unused, which is data only a registry has.
 *
 * Same pattern as the GitHub/Google buttons on the sign-in screens: drawn,
 * interactive, and explicit about what is not wired.
 */

/** Glyph colours follow the operators: -> is seq, |-> and || are flow. */
const KINDS = [
  { id: 'transform', glyph: '->', name: 'Transform', desc: 'Reshape the payload', tone: 'text-seq' },
  { id: 'agent', glyph: '|->', name: 'AI Agent', desc: 'Model call + branch', tone: 'text-flow' },
  { id: 'validator', glyph: '✓', name: 'Validator', desc: 'Pass or fail with reason', tone: 'text-keyword' },
  { id: 'notifier', glyph: '||', name: 'Notifier', desc: 'Side effect only', tone: 'text-flow' },
] as const;

type KindId = (typeof KINDS)[number]['id'];

/** Sunset options for the Deprecates stepper; 0 is "not set". */
const SUNSET_DAYS = [0, 30, 90, 180];

export function PublishModal({
  doc,
  source,
  onClose,
}: {
  doc: PointyDocument;
  source: string;
  onClose: () => void;
}) {
  const user = useSession();

  const [version, setVersion] = useState('0.1.0');
  const [summary, setSummary] = useState(() => defaultSummary(doc, source));
  const [kind, setKind] = useState<KindId>('transform');
  const [sunset, setSunset] = useState(0);
  const [placeOnCanvas, setPlaceOnCanvas] = useState(true);
  const [attempted, setAttempted] = useState(false);

  const lines = useMemo(() => highlight(source), [source]);
  const orgLabel = user ? (user.name?.trim() || user.email) : 'no account';

  // One honest answer to every press that needs the registry: Publish, ⌘↵,
  // and opening either select, which would otherwise fail silently.
  const attempt = useCallback(() => setAttempted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') attempt();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, attempt]);

  return (
    // Click the scrim itself to close; clicks inside the dialog do not reach it.
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-scrim p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Publish to EventHub"
        className="flex max-h-full w-full max-w-[900px] flex-col overflow-hidden rounded-[10px] border border-edge bg-bg-surface shadow-modal"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-edge px-[22px] py-[18px]">
          <h2 className="font-sans text-[15px] font-medium text-primary">Publish to EventHub</h2>
          {/* The design's pink "local → hub" chip is the local-namespace
              colour; Chip has no accent tone, so it is drawn directly. */}
          <span className="inline-flex items-center rounded-[4px] bg-accent-tint px-2 py-[3px] font-mono text-[9px] leading-none font-medium tracking-[0.4px] text-accent">
            local → hub
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer font-sans text-[13px] text-tertiary hover:text-primary"
          >
            ✕
          </button>
        </header>

        <div className="shrink-0 border-b border-edge px-[22px] py-4">
          <SectionHeader>PUBLISHING AS</SectionHeader>
          <div className="mt-2.5 flex gap-2.5 overflow-x-auto pb-0.5">
            <div className="flex min-w-[200px] flex-1 flex-col gap-[3px] rounded-[7px] border border-seq bg-seq-tint px-3 py-[11px]">
              <span aria-hidden className="font-mono text-[12px] text-seq">
                ◇
              </span>
              <p className="font-mono text-[12px] text-primary">{doc.name}</p>
              <p className="font-sans text-[9.5px] text-tertiary">
                {user
                  ? `Connected as ${user.email} · no organisation exists yet`
                  : 'Not signed in · publishing would ask you to sign in'}
              </p>
            </div>

            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={kind === k.id}
                className={cn(
                  'flex w-[150px] shrink-0 cursor-pointer flex-col gap-[3px] rounded-[7px] border px-3 py-[11px] text-left',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
                  kind === k.id
                    ? 'border-edge-strong bg-bg-raised'
                    : 'border-edge bg-bg-raised/60 hover:border-edge-strong',
                )}
              >
                <span aria-hidden className={cn('font-mono text-[12px]', k.tone)}>
                  {k.glyph}
                </span>
                <span className="font-sans text-[11.5px] text-primary">{k.name}</span>
                <span className="font-sans text-[9.5px] text-tertiary">{k.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[400px_1fr]">
          <section className="flex flex-col gap-3.5 border-edge px-[22px] py-[18px] md:border-r">
            <SectionHeader>RELEASE</SectionHeader>

            <Field
              label="Version"
              value={version}
              onValueChange={setVersion}
              hint="semver · must increase on each publish"
            />

            <Field
              label="Visibility"
              kind="select"
              value={`Organisation — ${orgLabel}`}
              hint="There are no organisations yet, so this is the only visibility on offer."
              onOpenOptions={attempt}
            />

            <div className="h-1" />

            <SectionHeader>MANIFEST</SectionHeader>

            <Field label="Summary" value={summary} onValueChange={setSummary} />

            <Field
              label="License"
              kind="select"
              value="Apache-2.0"
              hint="Default. The list would come from the registry."
              onOpenOptions={attempt}
            />

            <div className="flex w-full flex-col gap-1.5">
              <span className="font-sans text-[10.5px] leading-[19px] text-secondary">
                Deprecates
              </span>
              <div className="flex h-[34px] items-center rounded-[6px] border border-edge bg-bg-sunken px-1">
                <StepperButton
                  label="Fewer days until sunset"
                  onClick={() => stepSunset(sunset, setSunset, -1)}
                >
                  −
                </StepperButton>
                <span className="flex-1 text-center font-mono text-[11.5px] text-tertiary">
                  {sunset === 0 ? 'not set' : `${sunset} days`}
                </span>
                <StepperButton
                  label="More days until sunset"
                  onClick={() => stepSunset(sunset, setSunset, 1)}
                >
                  ＋
                </StepperButton>
              </div>
              <p className="font-sans text-[9.5px] leading-[15px] text-tertiary">
                optional · sets a sunset date once a version exists
              </p>
            </div>
          </section>

          <section className="flex min-w-0 flex-col bg-bg-sunken px-[22px] py-[18px]">
            <div className="flex items-center gap-2">
              <span className="ds-section-label">PACKAGE CONTENTS</span>
              <span className="flex-1" />
              <span className="font-sans text-[9.5px] text-tertiary">1 file · preview only</span>
            </div>

            <div className="mt-2.5 overflow-hidden rounded-[7px] border border-edge bg-bg-canvas">
              <div className="flex items-center gap-1.5 border-b border-edge bg-bg-raised px-2.5 py-1.5">
                <span aria-hidden className="font-mono text-[9.4px] font-medium text-keyword">
                  {'{}'}
                </span>
                <span className="font-mono text-[9.6px] text-secondary">{doc.name}.pointy</span>
                <span className="flex-1" />
                <span className="font-sans text-[9px] text-tertiary">
                  {lines.length} lines · emitted from the canvas
                </span>
              </div>
              <div className="max-h-[280px] overflow-auto p-2.5">
                <pre className="font-mono text-[10px] leading-4">
                  {lines.map((line) => (
                    <div key={line.number} className="flex">
                      <span className="mr-4 w-6 shrink-0 select-none text-right text-tertiary">
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
            </div>

            <div className="mt-3">
              <SectionHeader>AFTER PUBLISH</SectionHeader>
            </div>
            <div className="mt-1.5 rounded-[7px] border border-edge bg-bg-canvas px-3 py-2.5">
              <p className="font-mono text-[10.5px] text-code">
                {`hub::${doc.name}@${version || '0.0.0'}`}
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="font-sans text-[9px] text-tertiary">available to</span>
                <Chip tone="green">{orgLabel}</Chip>
                <Chip tone="violet">{KINDS.find((k) => k.id === kind)?.name}</Chip>
              </div>
            </div>
          </section>
        </div>

        {attempted && (
          <div className="shrink-0 border-t border-edge px-[22px] py-3">
            <Callout tone="warning" title="Publishing is not wired up yet">
              There is no EventHub registry service behind this dialog, so nothing was published
              and no version was reserved. Everything on this screen is a preview, derived from
              this document only.
            </Callout>
          </div>
        )}

        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-edge px-[22px] py-4">
          <p className="flex items-center gap-1.5 font-sans text-[10px] text-tertiary">
            <span aria-hidden className="text-warn">
              ⚠
            </span>
            Preview only · there is no registry to check against
          </p>
          <span className="flex-1" />

          <button
            type="button"
            role="checkbox"
            aria-checked={placeOnCanvas}
            onClick={() => setPlaceOnCanvas((v) => !v)}
            className="flex cursor-pointer items-center gap-[7px]"
          >
            <span
              aria-hidden
              className={cn(
                'grid h-[14px] w-[14px] place-items-center rounded-[3px] border font-sans text-[9px] font-medium',
                placeOnCanvas
                  ? 'border-seq bg-seq text-bg-sunken'
                  : 'border-edge-strong text-transparent',
              )}
            >
              ✓
            </span>
            <span className="font-sans text-[10.5px] text-secondary">Swap canvas node to hub::</span>
          </button>

          <Button kind="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="primary" shortcut="⌘↵" onClick={attempt}>
            Publish
          </Button>
        </footer>
      </div>
    </div>
  );
}

/**
 * A publish needs a description; one invented here would be shown forever, so
 * it is derived from the document and left editable.
 */
function defaultSummary(doc: PointyDocument, source: string): string {
  const count = events(doc.chain).length;
  const lines = source.split('\n').length;
  return `${doc.name} — ${count} event${count === 1 ? '' : 's'}, ${lines} lines of Pointy.`;
}

function stepSunset(current: number, set: (next: number) => void, dir: 1 | -1) {
  const i = SUNSET_DAYS.indexOf(current);
  const next = SUNSET_DAYS[Math.min(SUNSET_DAYS.length - 1, Math.max(0, i + dir))];
  set(next);
}

function StepperButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'grid h-[26px] w-7 shrink-0 cursor-pointer place-items-center rounded-[4px]',
        'font-sans text-[12px] text-tertiary hover:bg-neutral-tint hover:text-primary',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-seq',
      )}
    >
      {children}
    </button>
  );
}
