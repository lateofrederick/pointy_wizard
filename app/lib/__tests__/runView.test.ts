import { describe, expect, it } from 'vitest';
import {
  INITIAL_RUN_STATE,
  LOGS_UNAVAILABLE,
  RERUN_UNAVAILABLE,
  RUN_STATUS_COPY,
  runButtonLabel,
  runReducer,
} from '../runView';

/**
 * Screen 12 is an inert shell by decision: there is no runner service, so the
 * view may state that fact and must never state a run that did not happen.
 * These tests are the enforcement — the copy is asserted so a later "helpful"
 * placeholder cannot slip in unnoticed.
 */
describe('runReducer', () => {
  it('opens the run view on the first press, with nothing claimed', () => {
    const next = runReducer(INITIAL_RUN_STATE, { type: 'run' });
    expect(next.view).toBe('run');
    expect(next.notice).toBeNull();
  });

  it('treats a press while the run view is open as a re-run, and says why not', () => {
    const open = runReducer(INITIAL_RUN_STATE, { type: 'run' });
    const next = runReducer(open, { type: 'run' });
    expect(next.view).toBe('run');
    expect(next.notice).toBe(RERUN_UNAVAILABLE);
  });

  it('explains Full logs without leaving the run view', () => {
    const open = runReducer(INITIAL_RUN_STATE, { type: 'run' });
    const next = runReducer(open, { type: 'logs' });
    expect(next.view).toBe('run');
    expect(next.notice).toBe(LOGS_UNAVAILABLE);
  });

  it('leaves for the source view and forgets the notice', () => {
    const open = runReducer(runReducer(INITIAL_RUN_STATE, { type: 'run' }), { type: 'logs' });
    expect(runReducer(open, { type: 'source' })).toEqual(INITIAL_RUN_STATE);
  });

  it('never invents a run: the status copy names the missing service', () => {
    expect(RUN_STATUS_COPY).toMatch(/no run yet/);
    expect(RUN_STATUS_COPY).not.toMatch(/run\s*#\d/);
    expect(RUN_STATUS_COPY).not.toMatch(/\d+(.\d+)?\s*s\b/);
  });
});

describe('runButtonLabel', () => {
  it('is Run pipeline until the run view is open, then Re-run pipeline', () => {
    expect(runButtonLabel('source')).toBe('▶ Run pipeline');
    expect(runButtonLabel('run')).toBe('▶ Re-run pipeline');
  });
});
