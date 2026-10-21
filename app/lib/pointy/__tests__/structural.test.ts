import { describe, expect, it } from 'vitest';
import {
  addBranchPath,
  attachDefinition,
  blankEvent,
  connect,
  convertToBranch,
  duplicateEvent,
  stageEvent,
  wrapInGroup,
} from '../edit';
import { emit } from '../emit';
import { events } from '../walk';
import { emptyDocument } from '../../../types/pointy';
import { screen03 } from './fixtures';

/**
 * Authoring from nothing, and the context-menu operations.
 *
 * The first group exists because of a real dead end: `connect` could only
 * extend from an event already in the chain, and an empty document has none —
 * so a new pipeline could never acquire its first event, and every gesture
 * after that appeared broken. These assert the way out.
 */

const at = (x = 0, y = 0) => ({ x, y });

describe('starting from an empty document', () => {
  it('puts the first event straight into the chain, not into staging', () => {
    const doc = stageEvent(emptyDocument(), blankEvent('Extract'), at());
    expect(doc.chain).toEqual({ kind: 'event', ref: expect.objectContaining({ name: 'Extract' }) });
    expect(doc.staged).toEqual([]);
    expect(emit(doc)).toContain('Extract');
  });

  it('stages the second, then a wire splices it in', () => {
    const first = blankEvent('Extract');
    const second = blankEvent('Transform');

    let doc = stageEvent(emptyDocument(), first, at());
    doc = stageEvent(doc, second, at(300));
    expect(doc.staged.map((s) => s.name)).toEqual(['Transform']);

    const result = connect(doc, first.id, second.id, 'seq');
    expect(result.outcome).toBe('spliced');
    expect(result.doc.staged).toEqual([]);
    expect(emit(result.doc)).toContain('Extract\n  -> Transform');
  });

  it('seeds the chain from a wire between two staged events', () => {
    // Reachable from a draft saved before the first-event rule existed.
    const a = blankEvent('A');
    const b = blankEvent('B');
    const doc = { ...emptyDocument(), staged: [a, b] };

    const result = connect(doc, a.id, b.id, 'pipe');
    expect(result.outcome).toBe('spliced');
    expect(result.doc.staged).toEqual([]);
    expect(emit(result.doc)).toContain('A\n  |-> B');
  });

  it('explains a backwards wire instead of refusing silently', () => {
    const inChain = blankEvent('InChain');
    const loose = blankEvent('Loose');
    let doc = stageEvent(emptyDocument(), inChain, at());
    doc = stageEvent(doc, loose, at(300));

    const result = connect(doc, loose.id, inChain.id);
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toMatch(/Drag from the connected event/);
  });
});

describe('wrapInGroup', () => {
  it('wraps one event', () => {
    const target = events(screen03.chain).find((e) => e.name === 'ClassifyIntent')!;
    const { doc, refused } = wrapInGroup(screen03, target.id);
    expect(refused).toBeUndefined();
    expect(emit(doc)).toContain('{ hub::ClassifyIntent');
  });

  it('refuses an event already in a group', () => {
    // screen03 already wraps GPT4Transform in { }.
    const target = events(screen03.chain).find((e) => e.name === 'GPT4Transform')!;
    expect(wrapInGroup(screen03, target.id).refused).toBe('Already in a group.');
  });

  it('refuses a || member, with the rule', () => {
    const a = blankEvent('A');
    const b = blankEvent('B');
    const doc = {
      ...emptyDocument(),
      chain: {
        kind: 'parallel' as const,
        members: [
          { kind: 'event' as const, ref: a },
          { kind: 'event' as const, ref: b },
        ],
      },
    };
    const { refused } = wrapInGroup(doc, a.id);
    expect(refused).toMatch(/cannot be a process/);
  });
});

describe('convertToBranch', () => {
  it('puts the existing successor on 0 and a new event on 1', () => {
    const first = blankEvent('Extract');
    const second = blankEvent('Transform');
    let doc = stageEvent(emptyDocument(), first, at());
    doc = stageEvent(doc, second, at(300));
    doc = connect(doc, first.id, second.id).doc;

    const { doc: next, refused, focusId } = convertToBranch(doc, first.id);
    expect(refused).toBeUndefined();
    expect(focusId).toBeDefined();

    const source = emit(next);
    expect(source).toContain('0 -> Transform');
    expect(source).toContain('1 -> OnFailure');
  });

  it('refuses an event with nothing after it — a one-path branch is not valid', () => {
    const only = blankEvent('Alone');
    const doc = stageEvent(emptyDocument(), only, at());
    const { refused } = convertToBranch(doc, only.id);
    expect(refused).toMatch(/single-path branch/);
  });
});

describe('addBranchPath', () => {
  it('takes the next free descriptor', () => {
    const first = blankEvent('Extract');
    const second = blankEvent('Transform');
    let doc = stageEvent(emptyDocument(), first, at());
    doc = stageEvent(doc, second, at(300));
    doc = connect(doc, first.id, second.id).doc;
    doc = convertToBranch(doc, first.id).doc;

    const { doc: next, refused } = addBranchPath(doc, first.id);
    expect(refused).toBeUndefined();
    expect(emit(next)).toContain('2 -> OnDescriptor2');
  });

  it('stops at ten, because a descriptor is one digit', () => {
    const first = blankEvent('Extract');
    const second = blankEvent('Transform');
    let doc = stageEvent(emptyDocument(), first, at());
    doc = stageEvent(doc, second, at(300));
    doc = connect(doc, first.id, second.id).doc;
    doc = convertToBranch(doc, first.id).doc;

    for (let i = 2; i < 10; i += 1) doc = addBranchPath(doc, first.id).doc;

    const { refused } = addBranchPath(doc, first.id);
    expect(refused).toMatch(/integers 0 to 9/);
  });
});

describe('duplicateEvent', () => {
  it('stages a copy with its own id and no shared definition', () => {
    const target = events(screen03.chain).find((e) => e.name === 'SlackNotify')!;
    const { doc } = duplicateEvent(screen03, target.id);

    const copy = doc.staged.at(-1)!;
    expect(copy.name).toBe('SlackNotify');
    expect(copy.id).not.toBe(target.id);
    // Sharing a definition file would make editing one edit both.
    expect(copy.definitionId).toBeUndefined();
    // Staged, so the program is unchanged until it is wired.
    expect(emit(doc)).toBe(emit(screen03));
  });
});

describe('attachDefinition', () => {
  it('creates a stub and links it', () => {
    const ref = blankEvent('ValidateRows');
    const doc = stageEvent(emptyDocument(), ref, at());

    const { doc: next, refused } = attachDefinition(doc, ref.id);
    expect(refused).toBeUndefined();

    const definition = next.definitions['validate_rows.py'];
    expect(definition).toBeDefined();
    expect(definition.source).toContain('class ValidateRows(EventBase)');
    // The stub states the contract the model gets wrong most often.
    expect(definition.source).toContain('not a descriptor');
    expect(events(next.chain)[0].definitionId).toBe('validate_rows.py');
  });

  it('refuses a registry event — its Python lives with the package', () => {
    const target = events(screen03.chain).find((e) => e.namespace === 'hub')!;
    const { refused } = attachDefinition(screen03, target.id);
    expect(refused).toMatch(/lives with the package/);
  });
});
