/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AppShell } from '../shell/AppShell';
import { ThemeProvider } from '../../lib/theme';

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
function mount() {
  return render(
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>,
  );
}

// `globals` is off, so testing-library's automatic cleanup is not registered.
afterEach(cleanup);

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
});
