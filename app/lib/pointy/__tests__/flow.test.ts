import { describe, expect, it } from 'vitest';
import { chainToFlow } from '../flow';
import { setNodePosition, setWireOperator, updateEvent } from '../document';
import { emit } from '../emit';
import type { Chain, EventRef, PointyDocument } from '../../../types/pointy';
import { emptyDocument } from '../../../types/pointy';
import { screen03, screen16 } from './fixtures';

const ref = (id: string, name: string, extra: Partial<EventRef> = {}): EventRef => ({
  id,
  name,
  namespace: 'local',
  attributes: [],
  ...extra,
});
const e = (r: EventRef): Chain => ({ kind: 'event', ref: r });
const doc = (chain: Chain, patch: Partial<PointyDocument> = {}): PointyDocument => ({
  ...emptyDocument('t'),
  chain,
  ...patch,
});

const wires = (d: PointyDocument) =>
  chainToFlow(d).edges.map((x) => `${x.source}-${x.operator}->${x.target}`);

describe('chainToFlow — one node per occurrence', () => {
  it('gives every event in the chain a node', () => {
    const { nodes } = chainToFlow(screen03);
    expect(nodes.map((n) => n.ref.name)).toEqual([
      'RestApiExtract',
      'ValidateProfile',
      'ClassifyIntent',
      'RouteDecision',
      'GPT4Transform',
      'SlackNotify',
      'SlackNotify',
    ]);
  });

  it('marks the second appearance of an event as reused, not the first', () => {
    const { nodes } = chainToFlow(screen16);
    const analysts = nodes.filter((n) => n.ref.name === 'AnalystAgent');
    expect(analysts).toHaveLength(2);
    expect(analysts.map((n) => n.reused)).toEqual([false, true]);
  });

  it('uses the stored layout when there is one, and falls back otherwise', () => {
    const positioned = setNodePosition(screen03, 'n1', { x: 34, y: 80 });
    const { nodes } = chainToFlow(positioned);
    expect(nodes.find((n) => n.id === 'n1')?.position).toEqual({ x: 34, y: 80 });
    expect(nodes.find((n) => n.id === 'n2')?.position).toBeDefined();
  });
});

describe('chainToFlow — the operator lands on the wire', () => {
  it('carries seq and pipe through', () => {
    const d = doc({
      kind: 'pipe',
      left: { kind: 'seq', left: e(ref('a', 'A')), right: e(ref('b', 'B')) },
      right: e(ref('c', 'C')),
    });
    expect(wires(d)).toEqual(['a-seq->b', 'b-pipe->c']);
  });

  it('draws a parallel pair as a wire between its members', () => {
    const d = doc({ kind: 'parallel', members: [e(ref('a', 'A')), e(ref('b', 'B'))] });
    expect(wires(d)).toEqual(['a-parallel->b']);
  });

  it('fans into every member of a group and back out of all of them', () => {
    const d = doc({
      kind: 'seq',
      left: e(ref('a', 'A')),
      right: {
        kind: 'seq',
        left: { kind: 'group', members: [e(ref('b', 'B')), e(ref('c', 'C'))], attributes: [] },
        right: e(ref('d', 'D')),
      },
    });
    expect(wires(d).sort()).toEqual(
      ['a-seq->b', 'a-seq->c', 'b-seq->d', 'c-seq->d'].sort(),
    );
  });

  it('puts the descriptor on each branch wire', () => {
    const branchEdges = chainToFlow(screen03).edges.filter((x) => x.operator === 'branch');
    expect(branchEdges.map((x) => x.descriptor)).toEqual([0, 1]);
    expect(branchEdges[0].label).toBe('success');
  });

  it('gives every wire a stable, unique id', () => {
    const ids = chainToFlow(screen03).edges.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('document operations are pure and scoped', () => {
  it('setNodePosition touches layout and nothing else', () => {
    const before = emit(screen03);
    const after = setNodePosition(screen03, 'n1', { x: 999, y: 999 });

    expect(after.layout.n1).toEqual({ x: 999, y: 999 });
    expect(emit(after)).toBe(before); // dragging must never change the program
    expect(after.chain).toBe(screen03.chain);
    expect(screen03.layout.n1).toBeUndefined(); // input untouched
  });

  it('updateEvent edits one occurrence, leaving its twin alone', () => {
    const after = updateEvent(screen16, 'a3', { attributes: [] });
    const out = emit(after);
    expect(out).toContain('AnalystAgent[model="gpt-4o"]'); // the first
    expect(out).toContain('{ ReviewerAgent[model="claude"], AnalystAgent }'); // the second
  });

  it('setWireOperator flips only the wire joining the named pair', () => {
    const d = doc({
      kind: 'seq',
      left: { kind: 'seq', left: e(ref('a', 'A')), right: e(ref('b', 'B')) },
      right: e(ref('c', 'C')),
    });
    const after = setWireOperator(d, 'b', 'c', 'pipe');
    expect(wires(after)).toEqual(['a-seq->b', 'b-pipe->c']);
  });
});
