import { describe, expect, it } from 'vitest';
import { connect, stageEvent } from '../../lib/pointy/edit';
import { setWireOperator } from '../../lib/pointy/document';
import { chainToFlow } from '../../lib/pointy/flow';
import { emit } from '../../lib/pointy/emit';
import { lint } from '../../lib/pointy/lint';
import { newEventId } from '../../lib/pointy/edit';
import { sampleDocument } from '../../lib/sampleDocument';

/**
 * The authoring gestures, exercised end to end against the real seed document
 * rather than a toy chain — drop, name, wire, change operator.
 *
 * These run on the model, not the DOM: the components are thin over these
 * operations, and this is where a mistake would actually corrupt a pipeline.
 */
describe('drop → name → connect, on the screen 03 pipeline', () => {
  it('a dropped tile is on the canvas but not in the file', () => {
    const id = newEventId();
    const doc = stageEvent(
      sampleDocument,
      { id, name: 'ClassifyTone', namespace: 'local', attributes: [] },
      { x: 300, y: 560 },
    );

    expect(emit(doc)).toBe(emit(sampleDocument));
    expect(chainToFlow(doc).nodes.some((n) => n.id === id && n.staged)).toBe(true);
    expect(lint(doc).some((d) => d.code === 'unconnected-event')).toBe(true);
  });

  it('connecting it puts it in the file and clears the warning', () => {
    const id = newEventId();
    const staged = stageEvent(
      sampleDocument,
      { id, name: 'ClassifyTone', namespace: 'local', attributes: [], definitionId: 'x.py' },
      { x: 300, y: 560 },
    );
    // n7 is the second SlackNotify — the end of the failure path.
    const { doc, outcome } = connect(staged, 'n7', id);

    expect(outcome).toBe('spliced');
    expect(emit(doc)).toContain('ClassifyTone');
    expect(lint(doc).some((d) => d.code === 'unconnected-event')).toBe(false);
  });

  it('a second wire off one node promotes it to a branch with 0 and 1', () => {
    const id = newEventId();
    const staged = stageEvent(
      sampleDocument,
      { id, name: 'Alert', namespace: 'local', attributes: [], definitionId: 'x.py' },
      { x: 0, y: 0 },
    );
    // n1 already flows into n2, so this is the promotion case.
    const { doc, outcome } = connect(staged, 'n1', id);

    expect(outcome).toBe('promoted-to-branch');
    const out = emit(doc);
    // The branch opens after the attributes: `Name[attrs](`.
    expect(out).toContain('hub::RestApiExtract[timeout=30](');
    // The old successor keeps flowing on 0; the new wire lands on 1.
    expect(out).toContain('0 -> MAP<ValidateProfile>[batch_size=100]');
    expect(out).toContain('1 -> Alert');
  });
});

describe('changing a wire operator', () => {
  it('flips sequential to streaming and shows in the emitted source', () => {
    // n1 -> n2 in the seed document.
    const before = emit(sampleDocument);
    expect(before).toContain('-> MAP<ValidateProfile>');

    const doc = setWireOperator(sampleDocument, 'n1', 'n2', 'pipe');
    expect(emit(doc)).toContain('|-> MAP<ValidateProfile>');
  });

  it('leaves every other wire alone', () => {
    const doc = setWireOperator(sampleDocument, 'n1', 'n2', 'pipe');
    const ops = chainToFlow(doc).edges.map((e) => `${e.source}:${e.operator}`);
    expect(ops).toContain('n1:pipe');
    // n2 -> n3 was already a pipe; the branch wires stay branch wires.
    expect(ops.filter((o) => o.endsWith(':branch'))).toHaveLength(2);
  });

  it('is reversible', () => {
    const flipped = setWireOperator(sampleDocument, 'n1', 'n2', 'pipe');
    const back = setWireOperator(flipped, 'n1', 'n2', 'seq');
    expect(emit(back)).toBe(emit(sampleDocument));
  });
});

describe('the seed document is a valid starting point', () => {
  it('compiles clean', () => {
    expect(lint(sampleDocument).filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('renders every event and wire', () => {
    const flow = chainToFlow(sampleDocument);
    expect(flow.nodes).toHaveLength(7);
    expect(flow.edges.length).toBeGreaterThan(0);
  });
});
