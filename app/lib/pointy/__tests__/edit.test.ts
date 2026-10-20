import { describe, expect, it } from 'vitest';
import {
  connect,
  disconnect,
  discardStaged,
  hasSuccessor,
  isParallelJoin,
  newEventId,
  removeAttribute,
  removeEvent,
  setAttribute,
  setParallel,
  setRetry,
  stageEvent,
  updateStaged,
} from '../edit';
import { emit } from '../emit';
import { chainToFlow } from '../flow';
import { lint } from '../lint';
import { parse } from '../parse';
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

/** `Route(0 -> B, 1 -> C)` */
function branchDoc(): PointyDocument {
  return {
    ...emptyDocument('t'),
    chain: {
      kind: 'branch',
      on: ref('rd', 'Route'),
      paths: [
        { descriptor: 0, label: 'success', body: e(ref('b', 'B')) },
        { descriptor: 1, label: 'failure', body: e(ref('c', 'C')) },
      ],
    },
  };
}

describe('disconnect — the wire popover deletes a connection', () => {
  it('cuts the join and returns the tail to staging, not to the void', () => {
    const before = { ...line(), layout: { c: { x: 5, y: 7 } } };
    const { doc, refused } = disconnect(before, 'b', 'c');

    expect(refused).toBeUndefined();
    expect(names(doc)).toEqual(['A', 'B']);
    expect(wires(doc)).toEqual(['a-seq->b']);
    expect(doc.staged.map((s) => s.id)).toEqual(['c']);
    expect(doc.layout.c).toEqual({ x: 5, y: 7 }); // stays where it was drawn
    expect(emit(doc)).not.toContain('C');
  });

  it('warns the returned event will not run — the staged rule', () => {
    const { doc } = disconnect(line(), 'b', 'c');
    expect(lint(doc).some((d) => d.code === 'unconnected-event')).toBe(true);
  });

  it('cuts a mid-chain join and the events either side meet around it', () => {
    const { doc } = disconnect(line(), 'a', 'b');
    expect(names(doc)).toEqual(['A', 'C']);
    expect(wires(doc)).toEqual(['a-seq->c']);
    expect(doc.staged.map((s) => s.id)).toEqual(['b']);
  });

  it('keeps the parent join’s operator when the cut child was a pipe', () => {
    const before: PointyDocument = {
      ...line(),
      chain: {
        kind: 'seq',
        left: { kind: 'pipe', left: e(ref('a', 'A')), right: e(ref('b', 'B')) },
        right: e(ref('c', 'C')),
      },
    };
    const { doc, refused } = disconnect(before, 'a', 'b');
    expect(refused).toBeUndefined();
    expect(wires(doc)).toEqual(['a-seq->c']);
    expect(doc.staged.map((s) => s.id)).toEqual(['b']);
  });

  it('deletes a branch path and leaves the other descriptor intact', () => {
    const { doc, refused } = disconnect(branchDoc(), 'rd', 'c');
    expect(refused).toBeUndefined();
    expect(doc.staged.map((s) => s.id)).toEqual(['c']);
    expect(wires(doc)).toEqual(['rd-branch->b']);
    expect(chainToFlow(doc).edges[0].descriptor).toBe(0);
  });

  it('a branch left on one path warns rather than pretending it still branches', () => {
    const { doc } = disconnect(branchDoc(), 'rd', 'c');
    expect(lint(doc).some((d) => d.code === 'single-path-branch')).toBe(true);
  });

  it('takes the branch with it when its last path goes', () => {
    const once = disconnect(branchDoc(), 'rd', 'c').doc;
    const { doc } = disconnect(once, 'rd', 'b');
    expect(doc.chain).toEqual({ kind: 'event', ref: ref('rd', 'Route') });
    expect(doc.staged.map((s) => s.id).sort()).toEqual(['b', 'c']);
    expect(wires(doc)).toEqual([]);
  });

  it('refuses one strand of a fan-out, with the rule', () => {
    const before: PointyDocument = {
      ...emptyDocument('t'),
      chain: {
        kind: 'seq',
        left: e(ref('a', 'A')),
        right: { kind: 'group', members: [e(ref('c', 'C')), e(ref('d', 'D'))], attributes: [] },
      },
    };
    expect(chainToFlow(before).edges).toHaveLength(2); // A→C and A→D, one join

    const result = disconnect(before, 'a', 'c');
    expect(result.refused).toMatch(/cannot be deleted on its own/);
    expect(result.doc).toBe(before);
  });

  it('refuses a || wire — the wire is the pair', () => {
    const before: PointyDocument = {
      ...emptyDocument('t'),
      chain: { kind: 'parallel', members: [e(ref('a', 'A')), e(ref('b', 'B'))] },
    };
    const result = disconnect(before, 'a', 'b');
    expect(result.refused).toContain('structural');
    expect(result.doc).toBe(before);
  });

  it('refuses a pair that is live but was never joined', () => {
    const before = line(); // A→B→C: A and C both run, no wire between them
    const result = disconnect(before, 'a', 'c');
    expect(result.refused).toMatch(/not in the pipeline/);
    expect(result.doc).toBe(before);
  });

  it('refuses on an empty document', () => {
    expect(disconnect(emptyDocument('t'), 'a', 'b').refused).toBe('Nothing to disconnect.');
  });
});

/** A || B || C */
function triple(): PointyDocument {
  return {
    ...emptyDocument('t'),
    chain: {
      kind: 'parallel',
      members: [e(ref('a', 'A')), e(ref('b', 'B')), e(ref('c', 'C'))],
    },
  };
}

describe('setParallel — the wire popover Parallel row, both directions', () => {
  it('rewrites an A -> B join into an A || B pair', () => {
    const result = setParallel(line(), 'a', 'b', 'parallel');
    expect(result.refused).toBeUndefined();
    // The rest of the spine stays sequential; only the clicked join flips.
    expect(wires(result.doc)).toEqual(['a-parallel->b', 'b-seq->c']);
    expect(emit(result.doc)).toContain('A || B');
  });

  it('takes a pair back out to sequential', () => {
    const pair: PointyDocument = {
      ...emptyDocument('t'),
      chain: { kind: 'parallel', members: [e(ref('a', 'A')), e(ref('b', 'B'))] },
    };
    const result = setParallel(pair, 'a', 'b', 'seq');
    expect(result.refused).toBeUndefined();
    // Top-level sequencing breaks before `->`, so the pair is two lines.
    expect(emit(result.doc)).toMatch(/A\n {2}-> B/);
    expect(wires(result.doc)).toEqual(['a-seq->b']);
  });

  it('splices one pair out of a three-way, leaving the rest parallel', () => {
    const result = setParallel(triple(), 'b', 'c', 'pipe');
    expect(result.refused).toBeUndefined();
    // A stays parallel with the combined (B |-> C) unit — non-atomic members
    // are wrapped in parens, the way the parser needs them back.
    expect(wires(result.doc)).toEqual(['b-pipe->c', 'a-parallel->b']);
    expect(emit(result.doc)).toContain('A || (B |-> C)');
  });

  it('round-trips through the parser when a parallel member is a sequence', () => {
    // A || B || C, A–B taken out: members [seq(A,B), C] emits `(A -> B) || C`
    // — the parens the emitter adds are the parens the parser reads back.
    const result = setParallel(triple(), 'a', 'b', 'seq');
    const src = emit(result.doc);
    expect(src).toContain('(A -> B) || C');
    expect(emit(parse(src))).toBe(src);
  });

  it('round-trips when a sequence join becomes the head of a pair', () => {
    const result = setParallel(line(), 'a', 'b', 'parallel');
    const src = emit(result.doc); // seq(parallel[A,B], C)
    expect(emit(parse(src))).toBe(src);
  });

  it('refuses to parallelise a pair with no join, with the rule', () => {
    const before = line(); // A→B→C: A and C run, no wire between them
    const result = setParallel(before, 'a', 'c', 'parallel');
    expect(result.refused).toMatch(/sequential or streaming/);
    expect(result.doc).toBe(before);
  });

  it('refuses to take a seq join out of a pair that is not parallel', () => {
    const before = line();
    const result = setParallel(before, 'a', 'b', 'seq');
    expect(result.refused).toMatch(/\|\| pair/);
    expect(result.doc).toBe(before);
  });

  it('refuses on an empty document', () => {
    expect(setParallel(emptyDocument('t'), 'a', 'b', 'parallel').refused).toBe(
      'Nothing is connected yet.',
    );
  });

  it('isParallelJoin routes the hook: true for a pair, false for a wire', () => {
    expect(isParallelJoin(triple(), 'a', 'b')).toBe(true);
    expect(isParallelJoin(line(), 'a', 'b')).toBe(false);
    expect(isParallelJoin(emptyDocument('t'), 'a', 'b')).toBe(false);
  });
});
