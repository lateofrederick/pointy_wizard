/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { ZoomControl } from '../ZoomControl';
import { ToolPill } from '../ToolPill';
import { OperatorLegend } from '../OperatorLegend';

/**
 * Chrome-only mount tests.
 *
 * The viewport store is module state, so these run in one file on purpose: the
 * first assertion pins the initial reading and the rest move it. Each test
 * file gets its own module registry, so nothing leaks sideways into the shell
 * smoke tests.
 */
// cleanup, plus localStorage: OperatorLegend books its one appearance in
// localStorage the moment it shows, so a fresh render in the next test would
// be invisible unless each test starts from "never seen".
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('ZoomControl', () => {
  it('starts at the canvas default viewport — screen 03 draws 92%', () => {
    render(<ZoomControl />);
    expect(screen.getByText('92%')).toBeDefined();
  });

  it('steps by roughly 10% a click and resets to 100%', () => {
    render(<ZoomControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    // 0.92 * 1.1, rounded to whole percent.
    expect(screen.getByText('101%')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom to 100%' }));
    expect(screen.getByText('100%')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('91%')).toBeDefined();
  });

  it('clamps at the canvas zoom floor rather than reaching 0', () => {
    render(<ZoomControl />);
    const out = screen.getByRole('button', { name: 'Zoom out' });
    for (let i = 0; i < 40; i += 1) fireEvent.click(out);
    expect(screen.getByText('30%')).toBeDefined();
  });
});

describe('ToolPill', () => {
  it('offers the three modes with select active, plus fit-to-view', () => {
    render(
      <ReactFlowProvider>
        <ToolPill />
      </ReactFlowProvider>,
    );
    const select = screen.getByRole('button', { name: 'Select tool' });
    expect(select.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Pan tool' }));
    expect(select.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Pan tool' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('fits the view without throwing on an empty canvas', () => {
    render(
      <ReactFlowProvider>
        <ToolPill />
      </ReactFlowProvider>,
    );
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Fit view to graph' })),
    ).not.toThrow();
  });
});

describe('OperatorLegend', () => {
  it('names the three operators and what each one means', () => {
    render(<OperatorLegend />);
    expect(screen.getByText('EXECUTION MODEL')).toBeDefined();
    expect(screen.getByText('next event waits for (True, result)')).toBeDefined();
    expect(screen.getByText('downstream starts before upstream ends')).toBeDefined();
    expect(screen.getByText('both run at once in a process pool')).toBeDefined();
  });

  it('carries the footnote for the operators that are not wire forms', () => {
    render(<OperatorLegend />);
    expect(screen.getByText('retry')).toBeDefined();
    expect(screen.getByText('branch')).toBeDefined();
    expect(screen.getByText('concurrency group')).toBeDefined();
  });
});
