'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, type SessionUser } from '../../lib/api';
import { cn } from '../../lib/cn';
import { ThemeToggle } from '../ui';

/**
 * The chrome around every signed-in screen that is not the editor — Figma
 * screen 20 (`41:5374`).
 *
 * The editor has its own top bar (screen 03) because it states a different
 * fact: there, the header is about one document's validity, not about the
 * account.
 */

export function AccountBar({
  user,
  query,
  onQueryChange,
}: {
  user: SessionUser;
  query: string;
  onQueryChange: (next: string) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    await api.signOut();
    router.replace('/signin');
    router.refresh();
  }

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-edge-subtle bg-bg-surface px-[22px]">
      <Link href="/pipelines" className="flex items-center gap-3">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-seq">
          <span aria-hidden className="font-mono text-[12px] font-medium text-bg-sunken">
            ▸
          </span>
        </span>
        <span className="font-sans text-[13px] font-medium text-primary">Pointy Wizard</span>
      </Link>

      <span className="flex-1" />

      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="⌕   Search pipelines…"
        aria-label="Search pipelines"
        className={cn(
          'h-8 w-[192px] rounded-[6px] border border-edge bg-bg-sunken px-3',
          'font-sans text-[10.5px] text-primary outline-none',
          'placeholder:text-tertiary focus:border-seq',
        )}
      />

      <span className="flex-1" />

      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-label={`Account menu for ${user.email}`}
        className="h-[26px] w-[26px] cursor-pointer rounded-[6px] bg-flow font-sans text-[11px] font-medium text-white"
      >
        {initial(user)}
      </button>

      <ThemeToggle />

      {menuOpen && (
        <div
          className={cn(
            'absolute top-[52px] right-[22px] z-20 w-[220px] rounded-[8px] border border-edge',
            'bg-bg-raised p-1.5 shadow-modal',
          )}
        >
          <p className="px-2.5 pt-1.5 font-sans text-[11.5px] text-primary">{user.name}</p>
          <p className="truncate px-2.5 pb-2 font-mono text-[10px] text-tertiary">
            {user.email}
          </p>
          <button
            type="button"
            onClick={signOut}
            className="w-full cursor-pointer rounded-[5px] px-2.5 py-2 text-left font-sans text-[11.5px] text-secondary hover:bg-neutral-tint hover:text-primary"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}

function initial(user: SessionUser) {
  const source = user.name?.trim() || user.email;
  return source.slice(0, 1).toUpperCase();
}

/**
 * The rail. EventHub, Runs and Settings are drawn in the designs and have no
 * screens behind them yet, so they are shown inert rather than omitted — the
 * shape of the product is part of the screen — but they do not pretend to be
 * links.
 */
export function Rail({ user }: { user: SessionUser }) {
  return (
    <nav className="hidden w-[240px] shrink-0 flex-col border-r border-edge-subtle bg-bg-sunken px-3.5 py-[18px] md:flex">
      <div className="rounded-[7px] border border-edge-subtle bg-bg-raised px-3 py-2.5">
        <p className="truncate font-mono text-[12px] font-medium text-primary">
          {user.name}
        </p>
        <p className="truncate font-sans text-[9.5px] text-tertiary">{user.email}</p>
      </div>

      <div className="h-5" />

      <RailItem glyph="◧" label="Pipelines" href="/pipelines" active />
      <RailItem glyph="◇" label="EventHub" />
      <RailItem glyph="▸" label="Runs" />
      <RailItem glyph="⚙" label="Settings" />
    </nav>
  );
}

function RailItem({
  glyph,
  label,
  href,
  active,
}: {
  glyph: string;
  label: string;
  href?: string;
  active?: boolean;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className={cn('w-3.5 font-mono text-[11px] font-medium', active ? 'text-seq' : '')}
      >
        {glyph}
      </span>
      <span className={cn('font-sans text-[11.5px]', active && 'font-medium')}>{label}</span>
    </>
  );

  const shape = 'mb-1 flex h-[34px] items-center gap-2.5 rounded-[6px] px-[11px]';

  if (!href) {
    return (
      <span
        title="Not built yet."
        className={cn(shape, 'text-disabled select-none')}
        aria-disabled
      >
        {body}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        shape,
        active ? 'bg-seq-tint text-seq' : 'text-secondary hover:bg-neutral-tint',
      )}
    >
      {body}
    </Link>
  );
}
