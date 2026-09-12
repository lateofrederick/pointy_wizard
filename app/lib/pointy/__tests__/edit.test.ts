import { describe, expect, it } from 'vitest';
import {
  connect,
  discardStaged,
  hasSuccessor,
  newEventId,
  removeAttribute,
  removeEvent,
  setAttribute,
  setRetry,
  stageEvent,
  updateStaged,
} from '../edit';
import { emit } from '../emit';
import { chainToFlow } from '../flow';
import { lint } from '../lint';
import { events } from '../walk';
import type { Chain, EventRef, PointyDocument } from '../../../types/pointy';
import { emptyDocument } from '../../../types/pointy';

const ref = (id: string, name: string, extra: Partial<EventRef> = {}): EventRef => ({
  id,
  name,
  namespace: 'local',
  attributes: [],
  definitionId: `${id}.py`,
  ...extra,
});
const e = (r: EventRef): Chain => ({ kind: 'event', ref: r });

/** A -> B -> C */
function line(): PointyDocument {
  return {
    ...emptyDocument('t'),
    chain: {
      kind: 'seq',
      left: { kind: 'seq', left: e(ref('a', 'A')), right: e(ref('b', 'B')) },
      right: e(ref('c', 'C')),
    },
  };
}

const names = (d: PointyDocument) => events(d.chain).map((x) => x.name);
const wires = (d: PointyDocument) =>
  chainToFlow(d).edges.map((x) => `${x.source}-${x.operator}->${x.target}`);

describe('staging — a node on the canvas is not yet in the program', () => {
  it('adds the event and its position without touching the chain', () => {
    const before = emit(line());
    const d = stageEvent(line(), ref('s1', 'Staged'), { x: 10, y: 20 });

    expect(d.staged.map((s) => s.name)).toEqual(['Staged']);
    expect(d.layout.s1).toEqual({ x: 10, y: 20 });
    expect(emit(d)).toBe(before); // not in the file until it is connected
  });

  it('shows it on the canvas, flagged as staged and carrying no wires', () => {
    const d = stageEvent(line(), ref('s1', 'Staged'), { x: 10, y: 20 });
    const flow = chainToFlow(d);

    expect(flow.nodes.find((n) => n.id === 's1')?.staged).toBe(true);
    expect(flow.edges.every((x) => x.source !== 's1' && x.target !== 's1')).toBe(true);
  });

  it('warns that it will not run', () => {
    const d = stageEvent(line(), ref('s1', 'Staged'), { x: 0, y: 0 });
    const found = lint(d).find((x) => x.code === 'unconnected-event');
    expect(found?.severity).toBe('warning');
    expect(found?.message).toContain('will not run');
  });

  it('renames in place, which is the inline-naming gesture', () => {
    const d = updateStaged(
      stageEvent(line(), ref('s1', 'Untitled'), { x: 0, y: 0 }),
      's1',
      { name: 'ClassifyTone' },
    );
    expect(d.staged[0].name).toBe('ClassifyTone');
  });

  it('discards cleanly, taking its layout entry with it', () => {
    const d = discardStaged(stageEvent(line(), ref('s1', 'X'), { x: 1, y: 2 }), 's1');
    expect(d.staged).toHaveLength(0);
    expect(d.layout.s1).toBeUndefined();
  });
});

describe('connect — splicing a staged event in', () => {
  it('appends after an event that has no successor', () => {
    const d = stageEvent(line(), ref('s1', 'Publish'), { x: 0, y: 0 });
    const { doc, outcome } = connect(d, 'c', 's1');

    expect(outcome).toBe('spliced');
    expect(names(doc)).toEqual(['A', 'B', 'C', 'Publish']);
    expect(doc.staged).toHaveLength(0);
    expect(emit(doc)).toContain('-> Publish');
  });

  it('inserts between two events when the source is mid-chain', () => {
    // `a` already flows to `b`, so this promotes rather than inserts — the
    // insert case is only reachable at the end of a chain.
    const d = stageEvent(line(), ref('s1', 'X'), { x: 0, y: 0 });
    expect(connect(d, 'a', 's1').outcome).toBe('promoted-to-branch');
  });

  it('defaults a new connection to sequential', () => {
    const d = stageEvent(line(), ref('s1', 'X'), { x: 0, y: 0 });
    const { doc } = connect(d, 'c', 's1');
    expect(wires(doc)).toContain('c-seq->s1');
  });

  it('can be asked for a streaming connection explicitly', () => {
    const d = stageEvent(line(), ref('s1', 'X'), { x: 0, y: 0 });
    const { doc } = connect(d, 'c', 's1', 'pipe');
    expect(wires(doc)).toContain('c-pipe->s1');
  });
});

describe('connect — a second wire promotes the node to a branch', () => {
  it('keeps the old successor on 0 and puts the new target on 1', () => {
    const d = stageEvent(line(), ref('s1', 'Alert'), { x: 0, y: 0 });
    const { doc, outcome } = connect(d, 'b', 's1');

    expect(outcome).toBe('promoted-to-branch');
    const out = emit(doc);
    expect(out).toContain('B(');
    expect(out).toContain('0 -> C');
    expect(out).toContain('1 -> Alert');
  });

  it('labels them success and failure, which are conventions not free text', () => {
    const d = stageEvent(line(), ref('s1', 'Alert'), { x: 0, y: 0 });
    const { doc } = connect(d, 'b', 's1');
    const flow = chainToFlow(doc);
    const branchEdges = flow.edges.filter((x) => x.operator === 'branch');
    expect(branchEdges.map((x) => x.label)).toEqual(['success', 'failure']);
  });

  it('keeps whatever preceded the promoted node intact', () => {
    const d = stageEvent(line(), ref('s1', 'Alert'), { x: 0, y: 0 });
    const { doc } = connect(d, 'b', 's1');
    expect(emit(doc)).toContain('A\n  -> B(');
  });

  it('adds a third path to an existing branch on the next free descriptor', () => {
    const first = connect(stageEvent(line(), ref('s1', 'Alert'), { x: 0, y: 0 }), 'b', 's1');
    const second = connect(
      stageEvent(first.doc, ref('s2', 'Escalate'), { x: 0, y: 0 }),
      'b',
      's2',
    );
    expect(second.outcome).toBe('promoted-to-branch');
    expect(emit(second.doc)).toContain('2 -> Escalate');
  });
});

describe('connect — reconnecting to an event already in the chain', () => {
  it('creates a second traversal under CFG, not a duplicate node id', () => {
    const { doc, outcome } = connect(line(), 'c', 'a');

    expect(outcome).toBe('new-traversal');
    expect(names(doc)).toEqual(['A', 'B', 'C', 'A']);
    const ids = events(doc.chain).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks the repeat occurrence as reused on the canvas', () => {
    const { doc } = connect(line(), 'c', 'a');
    const reused = chainToFlow(doc).nodes.filter((n) => n.reused);
    expect(reused).toHaveLength(1);
    expect(reused[0].ref.name).toBe('A');
  });

  it('refuses under DAG and says why', () => {
    const dag = { ...line(), directives: { mode: 'DAG' as const } };
    const { doc, outcome, reason } = connect(dag, 'c', 'a');

    expect(outcome).toBe('rejected');
    expect(reason).toContain('DAG');
    expect(doc).toBe(dag); // untouched
  });
});

describe('connect — refusals', () => {
  it('refuses a self-connection', () => {
    expect(connect(line(), 'a', 'a').outcome).toBe('rejected');
  });

  it('refuses when the source is not in the pipeline yet', () => {
    const d = stageEvent(line(), ref('s1', 'X'), { x: 0, y: 0 });
    const d2 = stageEvent(d, ref('s2', 'Y'), { x: 0, y: 0 });
    expect(connect(d2, 's1', 's2').outcome).toBe('rejected');
  });
});

describe('hasSuccessor', () => {
  it('is false for the last event and true for the others', () => {
    const d = line();
    expect(hasSuccessor(d.chain, 'a')).toBe(true);
    expect(hasSuccessor(d.chain, 'b')).toBe(true);
    expect(hasSuccessor(d.chain, 'c')).toBe(false);
  });
});

describe('attributes and retry', () => {
  it('adds, updates and removes an attribute', () => {
    let d = setAttribute(line(), 'a', 'timeout', { kind: 'literal', value: 30 });
    expect(emit(d)).toContain('A[timeout=30]');

    d = setAttribute(d, 'a', 'timeout', { kind: 'literal', value: 60 });
    expect(emit(d)).toContain('A[timeout=60]');
    expect(events(d.chain).find((x) => x.id === 'a')?.attributes).toHaveLength(1);

    d = removeAttribute(d, 'a', 'timeout');
    expect(emit(d)).toContain('A\n');
  });

  it('sets and clears retry', () => {
    let d = setRetry(line(), 'a', 3);
    expect(emit(d)).toContain('A * 3');
    d = setRetry(d, 'a', undefined);
    expect(emit(d)).not.toContain('*');
  });

  it('lets a retry below 2 through to lint rather than silently clamping', () => {
    const d = setRetry(line(), 'a', 1);
    expect(lint(d).map((x) => x.code)).toContain('retry-below-minimum');
  });

  it('edits a staged event too, not only one in the chain', () => {
    const d = setAttribute(
      stageEvent(line(), ref('s1', 'X'), { x: 0, y: 0 }),
      's1',
      'node',
      { kind: 'literal', value: 'gpu' },
    );
    expect(d.staged[0].attributes).toHaveLength(1);
  });
});

describe('removeEvent', () => {
  it('closes the gap so the chain stays connected', () => {
    const d = removeEvent(line(), 'b');
    expect(names(d)).toEqual(['A', 'C']);
    expect(wires(d)).toEqual(['a-seq->c']);
  });

  it('drops the layout entry with it', () => {
    const d = removeEvent({ ...line(), layout: { b: { x: 1, y: 2 } } }, 'b');
    expect(d.layout.b).toBeUndefined();
  });

  it('removes a staged event', () => {
    const d = removeEvent(stageEvent(line(), ref('s1', 'X'), { x: 0, y: 0 }), 's1');
    expect(d.staged).toHaveLength(0);
  });

  it('refuses to remove a branch subject, which would orphan every path', () => {
    const { doc } = connect(stageEvent(line(), ref('s1', 'Alert'), { x: 0, y: 0 }), 'b', 's1');
    const after = removeEvent(doc, 'b');
    expect(emit(after)).toBe(emit(doc));
  });

  it('collapses a branch back to a plain event when its last path goes', () => {
    const { doc } = connect(stageEvent(line(), ref('s1', 'Alert'), { x: 0, y: 0 }), 'b', 's1');
    const after = removeEvent(removeEvent(doc, 'c'), 's1');
    expect(emit(after)).toContain('A\n  -> B');
    expect(emit(after)).not.toContain('B(');
  });
});

describe('newEventId', () => {
  it('does not collide', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newEventId()));
    expect(ids.size).toBe(500);
  });
});
