/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDefinitionSnapshot,
  clearDefinitionStore,
  deleteDefinitionCache,
  draftScope,
  pipelineScope,
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
const snapA = { definitions: { 'a.py': py('a.py') }, links: { a: 'a.py' } };

/**
 * Put a record the module's own writer would never produce — the corruption
 * paths (missing definitions, missing links table) only arise from an older
 * schema or a hand-edited database, so the tests write them directly.
 */
async function putRaw(record: object): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pointy-editor', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('definitions', { keyPath: 'scope' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const put = db.transaction('definitions', 'readwrite').objectStore('definitions').put(record);
    put.onsuccess = () => resolve();
    put.onerror = () => reject(put.error);
  });
  db.close();
}

afterEach(async () => {
  await clearDefinitionStore();
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
    const loaded = doc({
      // What a reload looks like: parse gave the event back with no link and
      // no definitions.
      chain: { kind: 'event', ref: { id: 'a', name: 'A', namespace: 'local', attributes: [] } },
    });

    const merged = applyDefinitionSnapshot(loaded, snapA);
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
  it('round-trips a snapshot per workspace', async () => {
    await writeDefinitionCache(pipelineScope('p1'), snapA);
    expect(await readDefinitionCache(pipelineScope('p1'))).toEqual(snapA);
  });

  it('keeps workspaces apart: two pipelines and the draft never share', async () => {
    await writeDefinitionCache(pipelineScope('p1'), snapA);
    // p2 and the draft have their own records — p1's definitions and links
    // are invisible to both.
    expect(await readDefinitionCache(pipelineScope('p2'))).toBeNull();
    expect(await readDefinitionCache(draftScope)).toBeNull();
  });

  it('returns null when there is no record', async () => {
    expect(await readDefinitionCache(pipelineScope('nope'))).toBeNull();
    expect(await readDefinitionCache(draftScope)).toBeNull();
  });

  it('treats a record with no links table as no links, not as corruption', async () => {
    await putRaw({ scope: pipelineScope('p1'), definitions: { 'a.py': py('a.py') } });
    expect(await readDefinitionCache(pipelineScope('p1'))).toEqual({
      definitions: { 'a.py': py('a.py') },
      links: {},
    });
  });

  it('returns null for a record with no definitions map', async () => {
    await putRaw({ scope: pipelineScope('bad'), links: { a: 'a.py' } });
    expect(await readDefinitionCache(pipelineScope('bad'))).toBeNull();
  });
});

describe('delete and clear', () => {
  it('deleteDefinitionCache drops one workspace, not its neighbours', async () => {
    await writeDefinitionCache(pipelineScope('p1'), snapA);
    await writeDefinitionCache(draftScope, { definitions: {}, links: {} });
    await deleteDefinitionCache(draftScope);
    expect(await readDefinitionCache(draftScope)).toBeNull();
    expect(await readDefinitionCache(pipelineScope('p1'))).toEqual(snapA);
  });

  it('clearDefinitionStore empties every scope', async () => {
    await writeDefinitionCache(pipelineScope('p1'), snapA);
    await writeDefinitionCache(draftScope, snapA);
    await clearDefinitionStore();
    expect(await readDefinitionCache(pipelineScope('p1'))).toBeNull();
    expect(await readDefinitionCache(draftScope)).toBeNull();
  });
});
