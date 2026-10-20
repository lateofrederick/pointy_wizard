/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CollapsibleSection } from '../CollapsibleSection';

// `globals` is off, so testing-library's automatic cleanup is not registered.
afterEach(() => {
  cleanup();
});

describe('CollapsibleSection', () => {
  it('starts expanded and says so to assistive tech', () => {
    render(<CollapsibleSection title="IDENTITY">body</CollapsibleSection>);
    const toggle = screen.getByRole('button', { name: 'IDENTITY' });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // getByText finds hidden elements too, so `.hidden` is the real assertion:
    // the content exists AND is hidden, never unmounted.
    const body = screen.getByText('body');
    expect(body.hidden).toBe(false);
  });

  it('collapses on the first press and restores on the second', () => {
    render(<CollapsibleSection title="EXECUTION">body</CollapsibleSection>);
    const toggle = screen.getByRole('button', { name: 'EXECUTION' });

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const body = screen.getByText('body');
    expect(body.hidden).toBe(true);
    // Still mounted: collapsing must not throw the editor's state away.
    expect(screen.queryByText('body')).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('body').hidden).toBe(false);
  });

  it('pressing the trailing action does not toggle the section', () => {
    const onAction = vi.fn();
    render(
      <CollapsibleSection title="ATTRIBUTES" action="＋ add" onAction={onAction}>
        body
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole('button', { name: 'ATTRIBUTES' });

    fireEvent.click(screen.getByRole('button', { name: '＋ add' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('body').hidden).toBe(false);
  });

  it('honours defaultOpen: false', () => {
    render(
      <CollapsibleSection title="SOURCE FILE" defaultOpen={false}>
        body
      </CollapsibleSection>,
    );
    expect(screen.getByRole('button', { name: 'SOURCE FILE' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.getByText('body').hidden).toBe(true);
  });

  it('controlled mode: state comes from the prop, every press reports back', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CollapsibleSection title="FLOW" open={true} onOpenChange={onOpenChange}>
        body
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole('button', { name: 'FLOW' });

    fireEvent.click(toggle);
    // open is controlled — the DOM does not flip until the owner passes it back.
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(
      <CollapsibleSection title="FLOW" open={false} onOpenChange={onOpenChange}>
        body
      </CollapsibleSection>,
    );
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('body').hidden).toBe(true);
  });
});
