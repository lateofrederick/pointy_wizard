/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AppShell } from '../shell/AppShell';
import { ThemeProvider } from '../../lib/theme';
import { SessionProvider } from '../../lib/session';
import { sampleDocument } from '../../lib/sampleDocument';
import type { PointyDocument } from '../../types/pointy';
import type { SessionUser } from '../../lib/api';

/**
 * Mount smoke tests.
 *
 * jsdom has no layout, so reactflow cannot measure nodes and the canvas renders
 * nothing meaningful — the graph itself is not covered here. What these do catch
 * is the class of failure most likely to slip past a green build: a component
 * that throws on mount, a missing provider, a hook used wrongly.
 *
 * The canvas needs a real browser to verify. See todo.txt.
 */

/**
 * There is no App Router outside Next, and `useRouter` throws rather than
 * degrading. The shell only ever navigates, so a stub is enough — and it makes
 * the destination assertable, which is the point of the signed-out test below.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const someone: SessionUser = { id: 'usr_1', email: 'lateo@volnux.dev', name: 'lateo' };

function mount({
  user = null,
  initial = sampleDocument,
  keepDraft = false,
}: {
  user?: SessionUser | null;
  initial?: PointyDocument;
  /**
   * Draft/definition-cache persistence is off by default here so unrelated
   * tests start from a clean browser; the tests that assert persistence pass
   * true (and rely on the global localStorage.clear() for isolation).
   */
  keepDraft?: boolean;
} = {}) {
  return render(
    <ThemeProvider>
      <SessionProvider user={user}>
        <AppShell initial={initial} keepDraft={keepDraft} />
      </SessionProvider>
    </ThemeProvider>,
  );
}

// `globals` is off, so testing-library's automatic cleanup is not registered.
// localStorage too: mount() writes real flags (the legend's once-only marker,
// the draft), and a test that asserts first-run behaviour must not inherit
// the previous test's history.
afterEach(() => {
  cleanup();
  push.mockClear();
  localStorage.clear();
});

/**
 * A local event with no definitionId: lint's missing-definition is the one
 * diagnostic in the app that ships a fix, and its label is the button that
 * both clears the warning and selects the event (attachDefinition returns a
 * focusId), which is how any test reaches the event inspector — the canvas
 * cannot select in jsdom.
 */
const bare: PointyDocument = {
  name: 'bare',
  directives: {},
  variables: [],
  sources: [],
  staged: [],
  definitions: {},
  layout: {},
  chain: {
    kind: 'event',
    ref: { id: 'e1', name: 'LocalTask', namespace: 'local', attributes: [] },
  },
};

describe('AppShell', () => {
  it('mounts without throwing', () => {
    expect(() => mount()).not.toThrow();
  });

  it('renders the top bar with the file name and validity', () => {
    mount();
    // The filename shows in the top bar and again in the output panel header —
    // scope to the banner so this asserts the one it means.
    const banner = within(screen.getByRole('banner'));
    expect(banner.getByText('my-etl-pipeline.pointy')).toBeDefined();
    expect(banner.getByText('✓ VALID POINTY')).toBeDefined();
  });

  it('renders the registry palette', () => {
    mount();
    expect(screen.getByText('EVENTHUB REGISTRY')).toBeDefined();
    expect(screen.getByText('Blank event')).toBeDefined();
    expect(screen.getByLabelText('Search the registry')).toBeDefined();
  });

  it('renders the emitted source in the output panel, not a stale copy', () => {
    mount();
    expect(screen.getByText('LIVE POINTY OUTPUT')).toBeDefined();
    // The namespace token only exists because emit() produced it.
    expect(screen.getAllByText('hub::').length).toBeGreaterThan(0);
  });

  it('shows the pipeline inspector when nothing is selected', () => {
    mount();
    expect(screen.getByText('DIRECTIVES')).toBeDefined();
    expect(screen.getByText('SOURCES')).toBeDefined();
  });

  it('disables Run only when the pipeline does not compile', () => {
    mount();
    const run = screen.getByRole('button', { name: /Run pipeline/ });
    // The sample document is valid, so Run is available.
    expect(run.hasAttribute('disabled')).toBe(false);
  });

  it('keeps Run impossible when lint reports errors — compile, not runtime', () => {
    // No registered source: every hub:: event is an unresolved namespace, which
    // is an error, so the chip is red and Run is off.
    mount({ initial: { ...sampleDocument, sources: [] } });
    const run = screen.getByRole('button', { name: /Run pipeline/ });
    expect(run.hasAttribute('disabled')).toBe(true);

    // The press never reaches the run view — there is nothing to be honest
    // about, because a pipeline that does not compile cannot be run.
    fireEvent.click(run);
    expect(screen.queryByText('RUN OUTPUT')).toBeNull();
    expect(screen.getByText('LIVE POINTY OUTPUT')).toBeDefined();
  });
});

/**
 * "Add event definition →" was a dead button in three places (the problems
 * list, the inspector's missing-definition callout, and the definition tab's
 * empty state) — the label promised an action and no handler was attached.
 * These assert the promise is now kept, end to end: press the fix, get the
 * stub, land in the tab that holds it.
 */
describe('Add event definition — the fix actually runs', () => {
  it('pressing the problems-list fix links a stub and opens the Definition tab', () => {
    mount({ initial: bare });

    const fix = screen.getByRole('button', { name: 'Add event definition →' });
    fireEvent.click(fix);

    // The stub is linked: the filename shows in the Definition tab's header,
    // and the tab itself is selected — not the Properties tab it started on.
    expect(screen.getByText('local_task.py')).toBeDefined();
    expect(screen.queryByText('DIRECTIVES')).toBeNull();

    // The warning that offered the fix is gone; the file now has a definition.
    expect(screen.queryByRole('button', { name: 'Add event definition →' })).toBeNull();
  });
});

/**
 * The inspector's sections open and close with the pointer (CollapsibleSection).
 * Reach the inspector the same way the fix test does — press the definition
 * fix, which selects the event — then work the disclosure controls.
 */
describe('Collapsible inspector sections', () => {
  /** The fix already opened the Definition tab; back to where the sections are. */
  function selectEventAndOpenProperties() {
    mount({ initial: bare });
    fireEvent.click(screen.getByRole('button', { name: 'Add event definition →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Properties' }));
  }

  /** aria-controls is the contract between toggle and content — read it back. */
  function contentOf(toggle: HTMLElement) {
    return document.getElementById(toggle.getAttribute('aria-controls')!) as HTMLElement;
  }

  it('hides and restores IDENTITY, and the choice survives tab switches', () => {
    selectEventAndOpenProperties();
    const toggle = screen.getByRole('button', { name: 'IDENTITY' });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(contentOf(toggle).hidden).toBe(false);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(contentOf(toggle).hidden).toBe(true);

    // Collapsing is a layout preference, not a reset: it holds across tabs.
    // /^Definition/ — the tab carries a "py" badge, and the EVENT DEFINITION
    // toggle on the Properties page also contains "Definition".
    fireEvent.click(screen.getByRole('button', { name: /^Definition/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Properties' }));
    expect(screen.getByRole('button', { name: 'IDENTITY' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('EVENT DEFINITION previews the source and both affordances open the editor', () => {
    selectEventAndOpenProperties();

    // Figma 14:46/14:54 — the card and the linked-file status live here now.
    expect(screen.getByText('definition linked · local_task.py')).toBeDefined();

    // The labelled affordance in the header…
    fireEvent.click(screen.getByRole('button', { name: 'Open editor →' }));
    expect(screen.getByRole('button', { name: 'SOURCE FILE' })).toBeDefined();

    // …and the obvious large target: the preview card itself.
    fireEvent.click(screen.getByRole('button', { name: 'Properties' }));
    fireEvent.click(screen.getByText('local_task.py').closest('button')!);
    expect(screen.queryByText('DIRECTIVES')).toBeNull();
    expect(screen.getByRole('button', { name: 'SOURCE FILE' })).toBeDefined();
  });

  it('the file-level sections collapse too when nothing is selected', () => {
    mount();
    const toggle = screen.getByRole('button', { name: 'DIRECTIVES' });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(contentOf(toggle).hidden).toBe(true);
    // The mode buttons live inside DIRECTIVES — hidden with it, still mounted.
    // getByText, not getByRole: role queries skip hidden elements by default.
    expect(within(contentOf(toggle)).getByText('DAG')).toBeDefined();
  });

  it('collapsing SOURCE FILE hides the editor but keeps the status row', () => {
    // The fix left us on the Definition tab, editor open.
    mount({ initial: bare });
    fireEvent.click(screen.getByRole('button', { name: 'Add event definition →' }));

    const toggle = screen.getByRole('button', { name: 'SOURCE FILE' });
    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(contentOf(toggle).hidden).toBe(true);
    // The editor is hidden, not unmounted — its cursor and scroll survive.
    // `.hidden` reads only an element's own attribute, so prove the editor is
    // *inside* the collapsed region (whose hidden-ness was asserted above).
    expect(contentOf(toggle).contains(screen.getByText('local_task.py'))).toBe(true);
    // And the file is still reported as linked.
    expect(screen.getByText('definition linked · local_task.py').hidden).toBe(false);
  });
});

/**
 * The shell's two layout controls: the divider that widens the inspector
 * (drag, keyboard, clamped, reset) and the button that tucks the registry
 * palette away. Both are pointer-driven chrome, which is exactly the kind of
 * thing a green build does not prove.
 */
describe('Shell layout controls', () => {
  it('the inspector divider drags, clamps, takes arrows and resets with Home', () => {
    mount();
    const sep = screen.getByRole('separator', { name: 'Resize inspector' });
    const panel = sep.parentElement as HTMLElement;
    expect(panel.style.width).toBe('340px');

    // Keyboard first, from the default: ← widens, → narrows again.
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(sep.getAttribute('aria-valuenow')).toBe('356');
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(sep.getAttribute('aria-valuenow')).toBe('340');

    // Drag 80px left — the panel's left edge follows, so the width grows.
    fireEvent.pointerDown(sep, { clientX: 700 });
    fireEvent.pointerMove(window, { clientX: 620 });
    expect(panel.style.width).toBe('420px');
    fireEvent.pointerUp(window);

    // Clamped at the ceiling however far the pointer travels.
    fireEvent.pointerDown(sep, { clientX: 700 });
    fireEvent.pointerMove(window, { clientX: 0 });
    expect(panel.style.width).toBe('640px');
    fireEvent.pointerUp(window);

    // Home is the escape hatch back to the designed width.
    fireEvent.keyDown(sep, { key: 'Home' });
    expect(panel.style.width).toBe('340px');
    expect(sep.getAttribute('aria-valuenow')).toBe('340');
  });

  it('the registry palette collapses to a rail and comes back', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse registry panel' }));

    // The palette is gone and the rail's button is the way back.
    expect(screen.queryByText('EVENTHUB REGISTRY')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand registry panel' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Expand registry panel' }));
    expect(screen.getByText('EVENTHUB REGISTRY')).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Collapse registry panel' }),
    ).toBeDefined();
  });
});

/**
 * The execution-model legend is once-only onboarding: its one appearance is
 * booked the moment it first shows (close or no close), and ✕ ends it early.
 * A remount stands in for a fresh session.
 */
describe('Execution model legend (once only)', () => {
  it('appears on first sight, closes with ✕, and never returns', () => {
    const first = mount();
    expect(screen.getByText('EXECUTION MODEL')).toBeDefined();
    // The flag is written on sight, not on close.
    expect(localStorage.getItem('pw-execution-model-seen')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Close execution model card' }));
    expect(screen.queryByText('EXECUTION MODEL')).toBeNull();

    first.unmount();
    mount();
    expect(screen.queryByText('EXECUTION MODEL')).toBeNull();
  });

  it('is gone forever even for someone who never pressed ✕', () => {
    const first = mount();
    expect(screen.getByText('EXECUTION MODEL')).toBeDefined();
    first.unmount();

    mount();
    expect(screen.queryByText('EXECUTION MODEL')).toBeNull();
  });
});

/**
 * The workspace name edits where it is read: the top bar and the pipeline
 * inspector header are the same EditableName bound to store.doc.name.
 */
describe('Workspace rename', () => {
  /** Two EditableNames carry the name — scope to the bar or take them all. */
  function barName() {
    return within(screen.getByRole('banner')).getByRole('button', {
      name: 'Rename my-etl-pipeline.pointy',
    });
  }

  it('renames from the top bar with Enter, and both places follow', () => {
    mount();
    fireEvent.click(barName());

    const input = screen.getByLabelText('Pipeline name');
    fireEvent.change(input, { target: { value: 'nightly-etl' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Top bar and inspector header both carry the new name.
    const labels = screen.getAllByRole('button', { name: 'Rename nightly-etl.pointy' });
    expect(labels.length).toBe(2);
  });

  it('commits on blur and strips a typed .pointy instead of doubling it', () => {
    mount();
    fireEvent.click(barName());

    const input = screen.getByLabelText('Pipeline name');
    fireEvent.change(input, { target: { value: 'orders.pointy' } });
    fireEvent.blur(input);

    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Rename orders.pointy' }),
    ).toBeDefined();
  });

  it('Escape cancels, and a blank name is not a rename', () => {
    mount();
    fireEvent.click(barName());

    const input = screen.getByLabelText('Pipeline name');
    fireEvent.change(input, { target: { value: 'half-typed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(barName()).toBeDefined();

    // Whitespace only: the press was not a rename, so nothing moves.
    fireEvent.click(barName());
    const blank = screen.getByLabelText('Pipeline name');
    fireEvent.change(blank, { target: { value: '   ' } });
    fireEvent.keyDown(blank, { key: 'Enter' });
    expect(barName()).toBeDefined();
  });
});

/**
 * A definition is two facts — the Python file and the event→file link — and
 * neither survives the `.pointy` round-trip (parse hands back definitions: {},
 * emit never writes definitionId), so the browser cache is the only memory.
 * The observable is PROBLEMS: the missing-definition diagnostic fires exactly
 * when the link is absent, and its fix button comes back with it.
 */
describe('Definition cache across a refresh', () => {
  it('keeps a definition added this session after a refresh', () => {
    // Control: no definition yet, so the diagnostic and its PROBLEMS column
    // are up. keepDraft=true — the cache is editor persistence, off in the
    // sandbox.
    mount({ initial: bare, keepDraft: true });
    expect(screen.getByText('PROBLEMS')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add event definition →' }));
    expect(screen.queryByText('PROBLEMS')).toBeNull();

    // A real refresh does not run React's cleanups — beforeunload is the
    // only flush — then a fresh mount on the same link-less initial doc.
    fireEvent(window, new Event('beforeunload'));
    cleanup();
    mount({ initial: bare, keepDraft: true });

    // Lint sees a linked definition again: no diagnostic, no fix button.
    expect(screen.queryByText('PROBLEMS')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add event definition →' })).toBeNull();
  });

  it('lands the write on unmount even inside the debounce window', () => {
    // No beforeunload, no sleep: unmount alone must flush — the sign-in
    // redirect and save-and-navigate path.
    const { unmount } = mount({ initial: bare, keepDraft: true });
    fireEvent.click(screen.getByRole('button', { name: 'Add event definition →' }));
    unmount();

    mount({ initial: bare, keepDraft: true });
    expect(screen.queryByRole('button', { name: 'Add event definition →' })).toBeNull();
    expect(screen.queryByText('PROBLEMS')).toBeNull();
  });
});

/**
 * Screen 12, built as an inert shell by product decision: there is no runner
 * service, so the run view may show the *absence* of a run and never an
 * invented one — no run number, no timings, no log lines (todo.txt, "WHY 11
 * AND 12 ARE NOT BUILT"). These assert the chrome that was built and the
 * honesty rules attached to it.
 */
describe('Run view (screen 12, inert)', () => {
  // fireEvent, not .click(): these tests assert the re-render a press causes,
  // and fireEvent runs inside act(), which is what flushes it in a sync test.
  function enterRunView() {
    fireEvent.click(screen.getByRole('button', { name: /Run pipeline/ }));
    const heading = screen.getByText('RUN OUTPUT');
    return { panel: heading.closest('section') as HTMLElement };
  }

  it('opens RUN OUTPUT on Run pipeline, and says no run happened', () => {
    mount();
    const { panel } = enterRunView();

    expect(screen.queryByText('LIVE POINTY OUTPUT')).toBeNull();
    expect(within(panel).getByText('no run yet · runner service not connected')).toBeDefined();
    expect(within(panel).getByText(/A runtime would write one line per event here/)).toBeDefined();
  });

  it('fabricates nothing: no run number, no timings, no sample log lines', () => {
    mount();
    const { panel } = enterRunView();

    expect(within(panel).queryByText(/run #\d+/)).toBeNull();
    expect(within(panel).queryByText(/\b\d+(?:\.\d+)?s\b/)).toBeNull();
    expect(
      within(panel).queryByText(/run started|RateLimitError|attempt \d\/\d|rows/),
    ).toBeNull();
    // The empty state still keeps the compile chip: that fact is real.
    expect(within(panel).getByText('✓ compiled')).toBeDefined();
  });

  it('renames the top bar button to Re-run pipeline while the run view is open', () => {
    mount();
    enterRunView();

    const banner = within(screen.getByRole('banner'));
    expect(banner.getByRole('button', { name: /Re-run pipeline/ })).toBeDefined();
    expect(banner.queryByRole('button', { name: /Run pipeline/ })).toBeNull();
  });

  it('explains Full logs and Re-run in place instead of pretending', () => {
    mount();
    const { panel } = enterRunView();

    fireEvent.click(within(panel).getByRole('button', { name: /Full logs/ }));
    expect(within(panel).getByRole('status').textContent).toMatch(/no runner service/i);

    fireEvent.click(within(panel).getByRole('button', { name: /Re-run/ }));
    expect(within(panel).getByRole('status').textContent).toMatch(/Nothing to re-run/);
  });

  it('says the same from the top bar, where Re-run is not disabled', () => {
    mount();
    enterRunView();

    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: /Re-run pipeline/ }),
    );

    const panel = screen.getByText('RUN OUTPUT').closest('section') as HTMLElement;
    expect(within(panel).getByRole('status').textContent).toMatch(/Nothing to re-run/);
  });

  it('returns to the emitted source from the run view', () => {
    mount();
    const { panel } = enterRunView();

    fireEvent.click(within(panel).getByRole('button', { name: /Source/ }));

    expect(screen.getByText('LIVE POINTY OUTPUT')).toBeDefined();
    expect(screen.queryByText('RUN OUTPUT')).toBeNull();
    // Still the document, not a snapshot: the namespace token comes from emit().
    expect(screen.getAllByText('hub::').length).toBeGreaterThan(0);
  });
});

/**
 * The editor is the landing page and works signed out. These assert the two
 * things that must differ, since getting them wrong means either a sign-in wall
 * on the front door or a Save button that silently does nothing.
 */
describe('AppShell signed out', () => {
  it('offers to sign in instead of pretending it can save', () => {
    mount();
    const banner = within(screen.getByRole('banner'));
    expect(banner.getByRole('button', { name: /Sign in to save/ })).toBeDefined();
  });

  it('says "sign in" exactly once — the Save button is the only invitation', () => {
    mount();
    const banner = within(screen.getByRole('banner'));
    expect(banner.queryAllByText(/sign in/i)).toHaveLength(1);
  });

  it('says where the work is being kept', () => {
    mount();
    expect(within(screen.getByRole('banner')).getByText('Kept in this browser')).toBeDefined();
  });

  it('sends Save to sign-in, with a way back', async () => {
    const { getByRole } = mount();
    getByRole('button', { name: /Sign in to save/ }).click();
    expect(push).toHaveBeenCalledWith('/signin?next=%2F');
  });
});

describe('AppShell signed in', () => {
  it('names the save destination for a document with no id yet', () => {
    mount({ user: someone });
    const banner = within(screen.getByRole('banner'));
    expect(banner.getByRole('button', { name: /Save to my pipelines/ })).toBeDefined();
    expect(banner.getByRole('link', { name: 'Your pipelines' })).toBeDefined();
  });
});

describe('ThemeToggle', () => {
  it('pictures the theme you would get, not the one you are in', () => {
    // The app defaults to dark, so the control offers light.
    mount();
    const toggle = within(screen.getByRole('banner')).getByRole('button', {
      name: 'Switch to light theme',
    });
    expect(toggle).toBeDefined();
  });

  it('is the last control on the bar', () => {
    mount();
    const banner = screen.getByRole('banner');
    const toggle = within(banner).getByRole('button', { name: /Switch to .* theme/ });
    expect(banner.lastElementChild).toBe(toggle);
  });
});
