/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDefinitionSnapshot,
  readDefinitionCache,
  snapshotDefinitions,
  writeDefinitionCache,
} from '../definitionCache';
import type { PointyDocument } from '../../types/pointy';

function doc(overrides: Partial<PointyDocument> = {}): PointyDocument {
  return {
    name: 't',
    directives: {},
    variables: [],
    sources: [],
    chain: null,
    staged: [],
    definitions: {},
    layout: {},
    ...overrides,
  };
}

const py = (filename: string) => ({ filename, source: 'print(1)' });

afterEach(() => {
  localStorage.clear();
});

describe('snapshotDefinitions', () => {
  it('collects links from the chain and from staged events alike', () => {
    const d = doc({
      chain: {
        kind: 'seq',
        left: {
          kind: 'event',
          ref: { id: 'a', name: 'A', namespace: 'local', attributes: [], definitionId: 'a.py' },
        },
        right: { kind: 'event', ref: { id: 'b', name: 'B', namespace: 'hub', attributes: [] } },
      },
      staged: [
        { id: 's', name: 'S', namespace: 'local', attributes: [], definitionId: 's.py' },
      ],
      definitions: { 'a.py': py('a.py'), 's.py': py('s.py') },
    });

    expect(snapshotDefinitions(d)).toEqual({
      definitions: { 'a.py': py('a.py'), 's.py': py('s.py') },
      links: { a: 'a.py', s: 's.py' },
    });
  });
});

describe('applyDefinitionSnapshot', () => {
  it('restores links through the chain and merges the definitions map', () => {
    const snap = {
      definitions: { 'a.py': py('a.py') },
      links: { a: 'a.py' },
    };
    const loaded = doc({
      // What a reload looks like: parse gave the event back with no link and
      // no definitions.
      chain: { kind: 'event', ref: { id: 'a', name: 'A', namespace: 'local', attributes: [] } },
    });

    const merged = applyDefinitionSnapshot(loaded, snap);
    const ref = merged.chain?.kind === 'event' ? merged.chain.ref : undefined;
    expect(ref?.definitionId).toBe('a.py');
    expect(merged.definitions['a.py']).toEqual(py('a.py'));
  });

  it('refuses a dangling link rather than pointing at a missing file', () => {
    const loaded = doc({
      chain: { kind: 'event', ref: { id: 'a', name: 'A', namespace: 'local', attributes: [] } },
    });
    const merged = applyDefinitionSnapshot(loaded, { definitions: {}, links: { a: 'a.py' } });
    const ref = merged.chain?.kind === 'event' ? merged.chain.ref : undefined;
    expect(ref?.definitionId).toBeUndefined();
  });
});

describe('read/writeDefinitionCache', () => {
  it('round-trips per scope', () => {
    const snap = { definitions: { 'a.py': py('a.py') }, links: { a: 'a.py' } };
    writeDefinitionCache('pipe-1', snap);
    writeDefinitionCache('draft', { definitions: {}, links: {} });
    expect(readDefinitionCache('pipe-1')).toEqual(snap);
  });

  it('returns null for absent or corrupt cache', () => {
    expect(readDefinitionCache('nope')).toBeNull();
    localStorage.setItem('pw-defs-bad', '{not json');
    expect(readDefinitionCache('bad')).toBeNull();
    localStorage.setItem('pw-defs-wrong', JSON.stringify({ links: {} }));
    expect(readDefinitionCache('wrong')).toBeNull();
  });
});
