'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type GrantScope, type GrantView } from '../../lib/api';
import { GRANT_SCOPES } from '../../lib/constants';
import { cn } from '../../lib/cn';
import { Button, Chip, SectionHeader, Toggle } from '../ui';

/**
 * Authorise EventHub — Figma screen 19 (`41:5215`).
 *
 * What this screen is for is stated on the screen itself: the grant is held
 * against the registry package, not against the Pointy Wizard account, and the
 * two are deliberately separate. So the modal's job is to be honest about
 * scope — which is why half of it is a list of what the grant *cannot* do.
 *
 * Two departures from the frame, both because the thing behind them does not
 * exist yet:
 *
 *  - AUTHORISE AS lists organisations. There are no organisations in this
 *    model, so it names the signed-in account and says so.
 *  - The frame is opened from the publish flow (screen 11). Publishing is not
 *    built, so it is opened from the pipeline's SOURCES section instead, which
 *    is the other place a registry actually matters.
 *
 * The grant itself is real: stored per user, listed, and revocable.
 */

const COPY: Record<GrantScope, { title: string; body: string; required?: boolean }> = {
  read: {
    title: 'read',
    body: 'Resolve hub:: events when the pipeline compiles. Without it nothing on this canvas builds.',
    required: true,
  },
  publish: {
    title: 'publish',
    body: 'Push new event versions to this package.',
  },
  deprecate: {
    title: 'deprecate',
    body: 'Set a sunset date on versions you published. Not required today — grant it later if you need it.',
  },
};

const CANNOT = [
  'Delete or edit packages published by anyone else',
  'Add, remove or change organisation members',
  'Read pipelines you have not published',
  'Sign you in to Pointy Wizard, or change that account',
];

export function AuthoriseEventHub({
  packageName,
  existing,
  onClose,
  onGranted,
}: {
  packageName: string;
  existing?: GrantView;
  onClose: () => void;
  onGranted: (grant: GrantView) => void;
}) {
  const [scopes, setScopes] = useState<GrantScope[]>(existing?.scopes ?? ['read', 'publish']);
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .session()
      .then(({ user }) => setAccount(user?.email ?? null))
      .catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void authorise();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function toggle(scope: GrantScope) {
    if (COPY[scope].required) return;
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    );
  }

  async function authorise() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { grant } = await api.authorise(packageName, scopes);
      onGranted(grant);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record the authorisation.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim p-6">
      <div
        role="dialog"
        aria-modal
        aria-label="Authorise EventHub"
        className="flex max-h-full w-full max-w-[900px] flex-col overflow-hidden rounded-[10px] border border-edge bg-bg-surface shadow-modal"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-edge px-[22px] py-4">
          <h2 className="font-sans text-[15px] font-medium text-primary">Authorise EventHub</h2>
          <Chip tone={existing ? 'green' : 'neutral'}>
            {existing ? 'connected' : 'not connected'}
          </Chip>
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
          <SectionHeader>AUTHORISE AS</SectionHeader>
          <div className="mt-2.5 rounded-[7px] border border-seq bg-seq-tint px-3 py-2.5">
            <p className="font-sans text-[12.5px] text-primary">{account ?? '…'}</p>
            <p className="mt-0.5 font-sans text-[9.5px] text-tertiary">
              Your Pointy Wizard account. There are no organisations yet, so this grant is
              yours alone.
            </p>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[1fr_378px]">
          <section className="border-edge px-[22px] py-4 md:border-r">
            <SectionHeader>SCOPES REQUESTED</SectionHeader>
            <div className="mt-3 flex flex-col gap-2">
              {GRANT_SCOPES.map((scope) => {
                const copy = COPY[scope];
                const on = copy.required || scopes.includes(scope);
                return (
                  <div
                    key={scope}
                    className={cn(
                      'flex items-start gap-4 rounded-[7px] border px-3.5 py-3',
                      on ? 'border-edge-strong bg-bg-sunken' : 'border-edge bg-bg-sunken/50',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[12px] text-primary">
                        {copy.title}
                        {copy.required && (
                          <span className="ml-2 font-sans text-[9.5px] text-tertiary">
                            required
                          </span>
                        )}
                      </p>
                      <p className="mt-1 font-sans text-[10.5px] leading-[15px] text-tertiary">
                        {copy.body}
                      </p>
                    </div>
                    <Toggle
                      checked={on}
                      locked={copy.required}
                      onChange={() => toggle(scope)}
                      label={`${copy.title} scope`}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="px-[22px] py-4">
            <SectionHeader>THIS GRANT CANNOT</SectionHeader>
            <ul className="mt-3 flex flex-col gap-2">
              {CANNOT.map((line) => (
                <li key={line} className="flex gap-2 font-sans text-[10.5px] text-secondary">
                  <span aria-hidden className="text-danger">
                    ⊘
                  </span>
                  {line}
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <SectionHeader>STORED AGAINST</SectionHeader>
              <p className="mt-2.5 font-mono text-[11px] text-primary">{packageName}</p>
              <p className="mt-2 font-sans text-[10px] leading-[15px] text-tertiary">
                Not your Pointy Wizard account — the two are deliberately separate. Revoke it
                any time from the pipeline&apos;s SOURCES section.
              </p>
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-edge px-[22px] py-3.5">
          <p className="font-sans text-[10.5px] text-tertiary">
            {error ?? 'Nothing is pushed anywhere — this records your consent.'}
          </p>
          <span className="flex-1" />
          <Button kind="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button kind="primary" shortcut="⌘↵" onClick={authorise} disabled={busy}>
            {existing ? 'Update grant' : 'Authorise EventHub'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
