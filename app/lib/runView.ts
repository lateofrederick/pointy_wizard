/**
 * The output panel's two views, and the honesty rules for the one that has no
 * service behind it.
 *
 * SCREEN 12 IS AN INERT SHELL — a product decision, not a stub waiting to be
 * finished (todo.txt, "WHY 11 AND 12 ARE NOT BUILT"). There is no runner, so
 * there is no run to number, time or log: the view records the absence instead
 * of inventing one.
 *
 * The transitions live here rather than inline in AppShell so that the one
 * piece of real logic — the second press of Run is a re-run, the first is not —
 * is testable without mounting the shell.
 */

/** 'source' is LIVE POINTY OUTPUT (screen 03); 'run' is RUN OUTPUT (screen 12). */
export type RunView = 'source' | 'run';

export type RunEvent =
  /** Run pipeline / Re-run pipeline — from the top bar or the panel header. */
  | { type: 'run' }
  /** Full logs — offered in the run view, and not openable. */
  | { type: 'logs' }
  /** Leave the run view: back to the emitted source. */
  | { type: 'source' };

export interface RunState {
  view: RunView;
  /** Why the last press that could not do what it said did not. Null otherwise. */
  notice: string | null;
}

export const INITIAL_RUN_STATE: RunState = { view: 'source', notice: null };

/** The header's status line — the slot screen 12 fills with "run #14 · started 2 min ago". */
export const RUN_STATUS_COPY = 'no run yet · runner service not connected';

export const LOGS_UNAVAILABLE =
  'No logs to open — this build has no runner service, so no run has produced any.';

export const RERUN_UNAVAILABLE =
  'Nothing to re-run — this build has no runner service, so nothing has run yet.';

export function runReducer(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case 'run':
      // The first press opens the view, and the view explains itself. Pressing
      // again while it is open is a re-run with nothing to re-run, which has to
      // say so out loud rather than silently do nothing.
      return state.view === 'run'
        ? { view: 'run', notice: RERUN_UNAVAILABLE }
        : { view: 'run', notice: null };
    case 'logs':
      // Reading logs does not close the run view — there is nothing to read,
      // but there is also nothing to go back to.
      return { view: state.view, notice: LOGS_UNAVAILABLE };
    case 'source':
      return INITIAL_RUN_STATE;
    default:
      return state;
  }
}

/** Figma's BtnRun: "Run pipeline", then "Re-run pipeline" once the view is open. */
export function runButtonLabel(view: RunView): string {
  return view === 'run' ? '▶ Re-run pipeline' : '▶ Run pipeline';
}
