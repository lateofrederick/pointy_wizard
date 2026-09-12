'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { MIN_PASSWORD } from '../../lib/constants';
import { ThemeToggle } from '../ui';
import { MarketingPanel } from './MarketingPanel';

/**
 * Sign in / Sign up — Figma screens 01 (`29:533`) and 02 (`29:596`).
 *
 * The two screens are the same layout with different copy, so they are one
 * component. The right panel is the same on both and never changes, which is
 * why it lives in its own file.
 *
 * Account ≠ EventHub grant. Nothing here asks for registry access; that is
 * screen 19, and it happens later, on purpose.
 */
export function AuthScreen({ mode }: { mode: 'signin' | 'signup' }) {
  const router = useRouter();
  const signingUp = mode === 'signup';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      if (signingUp) await api.signUp(email, password);
      else await api.signIn(email, password);
      // replace, not push: the back button should not return to a form the
      // user has already completed.
      router.replace('/pipelines');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-bg-base">
      <section className="flex w-full shrink-0 flex-col justify-center border-r border-edge-subtle bg-bg-surface px-8 py-16 sm:px-[72px] lg:w-[640px]">
        <div className="mx-auto flex w-full max-w-[496px] flex-col">
          <div className="flex items-center gap-3">
            <div className="h-[30px] w-[30px] shrink-0 rounded-lg bg-seq" />
            <span className="font-mono text-[15px] font-medium text-primary">
              Pointy Wizard
            </span>
            <span className="flex-1" />
            <ThemeToggle />
          </div>

          <h1 className="mt-11 font-sans text-[30px] leading-[39px] font-medium text-primary">
            {signingUp ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="font-sans text-[14px] leading-[30px] text-tertiary">
            {signingUp
              ? 'Free while Pointy is in preview.'
              : 'Your pipelines, saved and versioned.'}
          </p>

          <div className="mt-[30px] flex flex-col gap-2.5">
            <ProviderButton
              label={`${signingUp ? 'Sign up' : 'Continue'} with GitHub`}
              onUnavailable={setNote}
            />
            <ProviderButton
              label={`${signingUp ? 'Sign up' : 'Continue'} with Google`}
              onUnavailable={setNote}
            />
          </div>

          <div className="flex items-center gap-3.5 py-3.5">
            <span className="h-px flex-1 bg-edge-subtle" />
            <span className="font-sans text-[11px] text-tertiary">or</span>
            <span className="h-px flex-1 bg-edge-subtle" />
          </div>

          <form onSubmit={submit} noValidate>
            <label
              htmlFor="email"
              className="block font-sans text-[11.5px] leading-[22px] text-secondary"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />

            <div className="mt-4 flex items-center justify-between pb-1.5">
              <label htmlFor="password" className="font-sans text-[11.5px] text-secondary">
                Password
              </label>
              {signingUp ? (
                <span className="font-sans text-[11.5px] text-secondary">
                  at least {MIN_PASSWORD} characters
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setNote('Password reset is not available in preview yet.')
                  }
                  className="cursor-pointer font-sans text-[11.5px] text-seq hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </div>

            <div className="relative">
              <input
                id="password"
                type={reveal ? 'text' : 'password'}
                autoComplete={signingUp ? 'new-password' : 'current-password'}
                required
                minLength={signingUp ? MIN_PASSWORD : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(inputClass, 'pr-16')}
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="absolute top-0 right-3.5 h-11 cursor-pointer font-sans text-[11px] text-tertiary hover:text-primary"
              >
                {reveal ? 'hide' : 'show'}
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-3 font-sans text-[11.5px] text-danger">
                {error}
              </p>
            )}
            {note && (
              <p className="mt-3 font-sans text-[11.5px] text-tertiary">{note}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className={cn(
                'mt-6 h-[46px] w-full rounded-lg font-sans text-[14px] font-medium',
                'bg-seq text-bg-sunken transition-[filter] hover:brightness-110',
                busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              )}
            >
              {busy
                ? 'One moment…'
                : signingUp
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>

          <p className="mt-[22px] flex items-center gap-[7px] font-sans text-[12.5px] text-tertiary">
            {signingUp ? 'Already have an account?' : 'No account yet?'}
            <Link
              href={signingUp ? '/signin' : '/signup'}
              className="font-medium text-seq hover:underline"
            >
              {signingUp ? 'Sign in →' : 'Create one →'}
            </Link>
          </p>
        </div>
      </section>

      <MarketingPanel />
    </div>
  );
}

const inputClass = cn(
  'h-11 w-full rounded-lg border border-edge bg-bg-sunken px-3.5',
  'font-mono text-[13.5px] text-primary outline-none',
  'placeholder:text-disabled focus:border-seq',
);

/**
 * The OAuth buttons are drawn in the designs but there is no provider behind
 * them yet. Disabling them silently would look broken, so they say so.
 */
function ProviderButton({
  label,
  onUnavailable,
}: {
  label: string;
  onUnavailable: (message: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onUnavailable('Single sign-on is not wired up yet — use email and password.')}
      className={cn(
        'flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg',
        'border border-edge bg-bg-raised font-sans text-[13px] font-medium text-primary',
        'hover:bg-neutral-tint',
      )}
    >
      <span aria-hidden className="text-[13px]">
        ●
      </span>
      {label}
    </button>
  );
}
