import { describe, expect, it } from 'vitest';
import {
  removeSource,
  removeVariable,
  setSource,
  setVariable,
} from '../document';
import { emit } from '../emit';
import { lint } from '../lint';
import { parse } from '../parse';
import { screen03, screen13 } from './fixtures';

/**
 * Screen 13's operations.
 *
 * These change the *file* rather than a node, so the thing worth asserting is
 * that the change reaches the emitted source — and, for a source, that it
 * silences the diagnostic that asked for it.
 */

const num = (value: number) => ({ kind: 'literal' as const, value });

/** screen03 ships with its hub source already registered; these tests start
 *  from the state the user is actually in before they add one. */
const unregistered = { ...screen03, sources: [] };

describe('setVariable', () => {
  it('appends a new variable and emits it above the chain', () => {
    const next = setVariable(screen03, 'batch_size', num(50));
    expect(next.variables).toEqual([{ name: 'batch_size', value: num(50) }]);
    expect(emit(next)).toContain('@batch_size = 50');
  });

  it('replaces in place, keeping position', () => {
    const next = setVariable(screen13, 'batch_size', num(200));
    expect(next.variables.map((v) => v.name)).toEqual(['batch_size', 'timeout']);
    expect(emit(next)).toContain('@batch_size = 200');
  });

  it('renames without rewriting the references', () => {
    // Deliberate: the program still says $batch_size, and lint is what reports
    // it. Rewriting the chain from a rename in a side panel would be worse.
    const next = setVariable(screen13, 'rows', num(50), 'batch_size');
    expect(next.variables.map((v) => v.name)).toEqual(['rows', 'timeout']);
    expect(emit(next)).toContain('[batch_size=$batch_size]');
    expect(lint(next).map((d) => d.code)).toContain('undefined-variable');
  });

  it('leaves the original document untouched', () => {
    const before = screen13.variables.length;
    setVariable(screen13, 'extra', num(1));
    expect(screen13.variables.length).toBe(before);
  });
});

describe('removeVariable', () => {
  it('drops it from the emitted source', () => {
    const next = removeVariable(screen13, 'batch_size');
    expect(emit(next)).not.toContain('@batch_size =');
    expect(emit(next)).toContain('@timeout =');
  });
});

describe('setSource', () => {
  it('resolves the namespace a hub:: event needs', () => {
    // hub:: events with no registered source are an error the panel can fix.
    const before = lint(unregistered).filter((d) => d.code === 'unresolved-namespace');
    expect(before.length).toBeGreaterThan(0);

    const next = setSource(unregistered, {
      namespace: 'hub',
      package: 'corp/approved-events',
      version: '3.0.0',
    });

    expect(lint(next).filter((d) => d.code === 'unresolved-namespace')).toEqual([]);
  });

  it('replaces by package, so editing a version is not an add', () => {
    const one = setSource(screen03, {
      namespace: 'hub',
      package: 'corp/approved-events',
      version: '3.0.0',
    });
    const two = setSource(one, {
      namespace: 'hub',
      package: 'corp/approved-events',
      version: '3.1.0',
    });
    expect(two.sources).toHaveLength(1);
    expect(two.sources[0].version).toBe('3.1.0');
  });

  it('keeps several packages under one namespace', () => {
    const one = setSource(unregistered, {
      namespace: 'hub',
      package: 'a/one',
      version: '1.0.0',
    });
    const two = setSource(one, { namespace: 'hub', package: 'a/two', version: '1.0.0' });
    expect(two.sources.map((s) => s.package)).toEqual(['a/one', 'a/two']);
  });
});

describe('removeSource', () => {
  it('brings the unresolved-namespace error back', () => {
    const withSource = setSource(screen03, {
      namespace: 'hub',
      package: 'corp/approved-events',
      version: '3.0.0',
    });
    const without = removeSource(withSource, 'corp/approved-events');
    expect(lint(without).some((d) => d.code === 'unresolved-namespace')).toBe(true);
  });
});

describe('mode', () => {
  it('emits @mode only once it is set explicitly', () => {
    expect(emit(screen03)).not.toContain('@mode');
    expect(emit({ ...screen03, directives: { ...screen03.directives, mode: 'CFG' } })).toContain(
      '@mode: "CFG"',
    );
  });

  it('survives the round trip', () => {
    const dag = { ...screen13, directives: { ...screen13.directives, mode: 'DAG' as const } };
    expect(parse(emit(dag), dag.name).directives.mode).toBe('DAG');
  });
});
