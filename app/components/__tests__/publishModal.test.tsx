/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AppShell } from '../shell/AppShell';
import { ThemeProvider } from '../../lib/theme';
import { SessionProvider } from '../../lib/session';
import { sampleDocument } from '../../lib/sampleDocument';
import type { SessionUser } from '../../lib/api';

/**
 * Screen 11 — Publish to EventHub.
 *
 * The modal is an inert shell: there is no registry service behind it. What is
 * worth testing is therefore (a) it opens and closes, and (b) it never claims
 * a publish happened or invents registry data — the class of failure that
 * matters here is dishonesty, not a missing feature.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const someone: SessionUser = { id: 'usr_1', email: 'lateo@volnux.dev', name: 'lateo' };

function mount({ user = null }: { user?: SessionUser | null } = {}) {
  return render(
    <ThemeProvider>
      <SessionProvider user={user}>
        <AppShell initial={sampleDocument} keepDraft={false} />
      </SessionProvider>
    </ThemeProvider>,
  );
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: '◇ Publish to EventHub' }));
  return screen.getByRole('dialog', { name: 'Publish to EventHub' });
}

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe('Publish to EventHub', () => {
  it('opens from the top bar, for a signed-out user as well', () => {
    mount();
    const dialog = open();
    expect(within(dialog).getByText('Publish to EventHub')).toBeDefined();
  });

  it('previews the real document, not invented package contents', () => {
    mount();
    const dialog = open();
    // The file name and the address are derived from the document and the
    // version field; nothing here comes from a registry.
    expect(within(dialog).getByText('my-etl-pipeline.pointy')).toBeDefined();
    expect(within(dialog).getByText('hub::my-etl-pipeline@0.1.0')).toBeDefined();
    expect(within(dialog).getByText(/emitted from the canvas/)).toBeDefined();
  });

  it('never claims a contract is satisfied or a version is unused', () => {
    mount();
    open();
    // Those are facts only a registry has; the shell must not invent them.
    expect(screen.queryByText(/Contract satisfied/)).toBeNull();
    expect(screen.queryByText(/is unused/)).toBeNull();
  });

  it('Publish says plainly that nothing was published', () => {
    mount();
    const dialog = open();
    // The button's accessible name includes its ⌘↵ hint, so match by prefix —
    // "◇ Publish to EventHub" in the top bar starts with the glyph instead.
    fireEvent.click(screen.getByRole('button', { name: /^Publish/ }));
    // A warning callout carries role="status" — it is information, not a
    // failure that stopped something happening.
    const notice = within(dialog).getByRole('status');
    expect(notice.textContent).toMatch(/not wired up yet/);
    expect(notice.textContent).toMatch(/nothing was published/);
  });

  it('closes on Cancel', () => {
    mount();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape and on a click on the scrim', () => {
    mount();
    const dialog = open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    // The scrim is the modal's direct parent — the dialog sits inside it.
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names the signed-in account instead of an organisation that does not exist', () => {
    mount({ user: someone });
    const dialog = open();
    expect(within(dialog).getByText(/Connected as lateo@volnux\.dev/)).toBeDefined();
    expect(within(dialog).getByText(/no organisation exists yet/)).toBeDefined();
  });
});
