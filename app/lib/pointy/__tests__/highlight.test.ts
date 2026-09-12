import { describe, expect, it } from 'vitest';
import { highlight, type TokenKind } from '../highlight';
import { emit } from '../emit';
import { screen03, screen13 } from './fixtures';

/** Kinds assigned to a given substring, across the whole source. */
function kindsOf(source: string, value: string): TokenKind[] {
  return highlight(source)
    .flatMap((l) => l.tokens)
    .filter((t) => t.value === value)
    .map((t) => t.kind);
}

function lineTokens(source: string, n: number) {
  return highlight(source).find((l) => l.number === n)?.tokens ?? [];
}

describe('highlight — round-trips the source', () => {
  const source = emit(screen13);

  it('loses no characters', () => {
    const rebuilt = highlight(source)
      .map((l) => l.tokens.map((t) => t.value).join(''))
      .join('\n');
    expect(rebuilt).toBe(source.replace(/\n$/, ''));
  });

  it('numbers lines from 1', () => {
    expect(highlight(source)[0].number).toBe(1);
  });
});

describe('highlight — operators keep their canvas colour', () => {
  const source = emit(screen13);

  it('marks -> as sequential', () => {
    expect(kindsOf(source, '->')).toContain('op-seq');
  });

  it('marks |-> as flow, and does not mistake it for ->', () => {
    expect(kindsOf(source, '|->')).toContain('op-flow');
    expect(kindsOf(source, '|')).toHaveLength(0);
  });

  it('marks * as retry', () => {
    expect(kindsOf(source, '*')).toContain('op-retry');
  });

  it('marks ?? as coalesce', () => {
    expect(kindsOf(source, '??')).toContain('op-coalesce');
  });
});

describe('highlight — language constructs', () => {
  const source = emit(screen13);

  it('colours each namespace by its own identity', () => {
    expect(kindsOf(source, 'hub::')).toContain('namespace-hub');
  });

  it('treats the first line as a comment', () => {
    expect(lineTokens(source, 1)[0].kind).toBe('comment');
  });

  it('separates a directive from a variable by the colon', () => {
    expect(kindsOf(source, '@version')).toContain('directive');
    expect(kindsOf(source, '@mode')).toContain('directive');
    expect(kindsOf(source, '@batch_size')).toContain('variable');
  });

  it('marks $refs and $env lookups', () => {
    expect(kindsOf(source, '$timeout')).toContain('ref');
    expect(kindsOf(source, '$env.TIMEOUT')).toContain('ref');
  });

  it('marks the meta mode and its template differently', () => {
    expect(kindsOf(source, 'MAP')).toContain('meta-mode');
    expect(kindsOf(source, 'ValidateProfile')).toContain('template');
  });

  it('marks a descriptor, and not every bare digit', () => {
    expect(kindsOf(source, '0')).toContain('descriptor');
    expect(kindsOf(source, '60')).toContain('number');
  });

  it('marks attribute names apart from their values', () => {
    expect(kindsOf(source, 'executor')).toContain('attr-name');
    expect(kindsOf(source, '"celery"')).toContain('string');
  });
});

describe('highlight — degenerate input', () => {
  it('handles an empty document', () => {
    expect(highlight('')).toEqual([{ number: 1, tokens: [] }]);
  });

  it('handles a document with no variables block', () => {
    expect(() => highlight(emit(screen03))).not.toThrow();
  });

  it('terminates on characters no rule claims', () => {
    expect(highlight('€ ¬ ±')[0].tokens.map((t) => t.value).join('')).toBe('€ ¬ ±');
  });
});
