import { describe, expect, it } from 'vitest';
import { parse, tryParse, PointyParseError, tokenise } from '../parse';
import { emit } from '../emit';
import { events } from '../walk';
import { screen03, screen13, screen16, screen17 } from './fixtures';

/**
 * The contract between parse() and emit() is the round trip. If a document
 * survives being written out and read back, the two agree about the language.
 */
describe('round trip — emit(parse(emit(doc))) === emit(doc)', () => {
  const cases = [
    ['screen 03', screen03],
    ['screen 13', screen13],
    ['screen 16', screen16],
    ['screen 17', screen17],
  ] as const;

  for (const [label, doc] of cases) {
    it(label, () => {
      const source = emit(doc);
      expect(emit(parse(source))).toBe(source);
    });
  }
});

describe('parse — directives and variables', () => {
  it('reads @version and @mode', () => {
    const d = parse('# x.pointy\n@version: "2.0.0"\n@mode: "DAG"\n\nA\n');
    expect(d.directives.version).toBe('2.0.0');
    expect(d.directives.mode).toBe('DAG');
  });

  it('leaves mode unset when the file does not say, because unset is CFG', () => {
    expect(parse('# x.pointy\n@version: "1"\n\nA\n').directives.mode).toBeUndefined();
  });

  it('reads the deprecated @recursive-depth so it can be warned about', () => {
    expect(parse('@recursive-depth: 3\n\nA\n').directives.recursiveDepth).toBe(3);
  });

  it('ignores a directive it does not know, rather than refusing the file', () => {
    expect(() => parse('@future-thing: "x"\n\nA\n')).not.toThrow();
  });

  it('reads variables, including a ?? chain', () => {
    const d = parse('@n = 50\n@t = $env.TIMEOUT ?? 30.0\n\nA\n');
    expect(d.variables.map((v) => v.name)).toEqual(['n', 't']);
    expect(emit(d)).toContain('@t = $env.TIMEOUT ?? 30.0');
  });

  it('preserves a float spelling — 30.0 is not 30', () => {
    expect(emit(parse('@t = 30.0\n\nA\n'))).toContain('30.0');
  });

  it('rejects a mode that is neither DAG nor CFG', () => {
    expect(() => parse('@mode: "FAST"\n\nA\n')).toThrow(PointyParseError);
  });
});

describe('parse — the chain', () => {
  it('reads a namespace', () => {
    const d = parse('hub::RestApiExtract\n');
    expect(events(d.chain)[0].namespace).toBe('hub');
    expect(events(d.chain)[0].name).toBe('RestApiExtract');
  });

  it('treats a bare name as local', () => {
    expect(events(parse('Thing\n').chain)[0].namespace).toBe('local');
  });

  it('is left-associative, so the shape matches what emit() expects', () => {
    const d = parse('A -> B -> C\n');
    expect(d.chain).toMatchObject({ kind: 'seq', right: { kind: 'event' } });
    expect((d.chain as { left: { kind: string } }).left.kind).toBe('seq');
  });

  it('binds || tighter than ->', () => {
    const d = parse('A -> B || C -> D\n');
    // The pair is one unit in the middle, not a top-level parallel.
    expect(emit(d)).toContain('-> B || C');
  });

  it('reads a retry, bare and numeric', () => {
    expect(emit(parse('A * 3\n'))).toContain('A * 3');
    expect(emit(parse('A *\n'))).toContain('A *');
  });

  it('reads a concurrency group with attributes', () => {
    const d = parse('A -> { B, C }[timeout=60] -> D\n');
    expect(emit(d)).toContain('{ B, C }[timeout=60]');
  });

  it('reads a branch and its descriptors', () => {
    const d = parse('A -> R(\n  0 -> B,\n  1 -> C\n)\n');
    const branch = emit(d);
    expect(branch).toContain('0 -> B');
    expect(branch).toContain('1 -> C');
  });

  it('reads a meta event', () => {
    const d = parse('MAP<Parse>[batch_size=50]\n');
    const ref = events(d.chain)[0];
    expect(ref.meta?.mode).toBe('MAP');
    expect(ref.meta?.template).toBe('Parse');
    expect(emit(d)).toContain('MAP<Parse>[batch_size=50]');
  });

  it('gives every occurrence its own id, so CFG reuse stays distinct', () => {
    const d = parse('A -> B -> A\n');
    const ids = events(d.chain).map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('parse — attribute values', () => {
  const value = (src: string) => emit(parse(`A[v=${src}]\n`));

  it('reads every kind the grammar has', () => {
    expect(value('42')).toContain('v=42');
    expect(value('-7')).toContain('v=-7');
    expect(value('true')).toContain('v=true');
    expect(value('null')).toContain('v=null');
    expect(value('"hi"')).toContain('v="hi"');
    expect(value('$n')).toContain('v=$n');
    expect(value('$env.HOST')).toContain('v=$env.HOST');
    expect(value('[1, 2]')).toContain('v=[1, 2]');
    expect(value('{host: "a", port: 1}')).toContain('v={host: "a", port: 1}');
  });

  it('reads a ternary', () => {
    expect(value('$z == "eu" ? "a" : "b"')).toContain('v=$z == "eu" ? "a" : "b"');
  });

  it('reads a hyphen inside a string without treating it as anything else', () => {
    expect(value('"eu-west-1"')).toContain('"eu-west-1"');
  });
});

describe('parse — errors point at the problem', () => {
  it('reports an unterminated string with a position', () => {
    const r = tryParse('A[v="oops\n');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Unterminated string');
      expect(r.line).toBe(1);
    }
  });

  it('rejects a descriptor outside 0–9', () => {
    const r = tryParse('A -> R(\n  12 -> B\n)\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('0–9');
  });

  it('rejects an unknown namespace', () => {
    const r = tryParse('npm::Thing\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Unknown namespace');
  });

  it('rejects trailing rubbish after the pipeline', () => {
    expect(tryParse('A -> B )\n').ok).toBe(false);
  });

  it('names the missing bracket', () => {
    const r = tryParse('A[timeout=30\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(']');
  });

  it('tryParse never throws', () => {
    expect(() => tryParse('@@@ !!!')).not.toThrow();
  });
});

describe('parse — file identity and whitespace', () => {
  it('recovers the pipeline name from the header comment', () => {
    expect(parse('# my-etl-pipeline.pointy — generated by Pointy Wizard\n\nA\n').name).toBe(
      'my-etl-pipeline',
    );
  });

  it('falls back when there is no header', () => {
    expect(parse('A\n', 'dropped-file').name).toBe('dropped-file');
  });

  it('does not care how the chain is wrapped across lines', () => {
    const oneLine = parse('A -> B |-> C\n');
    const wrapped = parse('A\n  -> B\n  |-> C\n');
    expect(emit(wrapped)).toBe(emit(oneLine));
  });

  it('handles an empty file', () => {
    const d = parse('# empty.pointy\n');
    expect(d.chain).toBeNull();
  });
});

describe('tokenise', () => {
  it('does not mistake |-> for || or ->', () => {
    expect(tokenise('|->').map((t) => t.type)).toEqual(['pipe', 'eof']);
    expect(tokenise('||').map((t) => t.type)).toEqual(['parallel', 'eof']);
  });

  it('reads a negative number rather than an arrow', () => {
    expect(tokenise('-7').map((t) => t.type)).toEqual(['number', 'eof']);
  });

  it('drops comments', () => {
    expect(tokenise('# a comment\nA').map((t) => t.value)).toEqual(['A', '']);
  });
});
