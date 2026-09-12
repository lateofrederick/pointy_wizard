import { describe, expect, it } from 'vitest';
import { parseExpression } from '../shell/ExpressionEditor';
import { emitExpr } from '../../lib/pointy/emit';

/** Parse then emit — anything the grammar accepts must survive the round trip. */
const round = (s: string) => {
  const parsed = parseExpression(s);
  return parsed === null ? null : emitExpr(parsed);
};

describe('parseExpression — what the grammar has', () => {
  const accepted = [
    ['42', '42'],
    ['-7', '-7'],
    ['30.0', '30.0'], // the float spelling must survive
    ['true', 'true'],
    ['false', 'false'],
    ['null', 'null'],
    ['"gpu-cluster"', '"gpu-cluster"'],
    ['$batch_size', '$batch_size'],
    ['$env.TIMEOUT', '$env.TIMEOUT'],
    ['$env.TIMEOUT ?? 30.0', '$env.TIMEOUT ?? 30.0'],
    ['$env.A ?? $env.B ?? "localhost"', '$env.A ?? $env.B ?? "localhost"'],
    [
      '$zone == "eu" ? "eu-west-1" : "us-east-1"',
      '$zone == "eu" ? "eu-west-1" : "us-east-1"',
    ],
    ['$n >= 3 ? true : false', '$n >= 3 ? true : false'],
  ];

  for (const [input, expected] of accepted) {
    it(`accepts ${input}`, () => expect(round(input)).toBe(expected));
  }
});

describe('parseExpression — the four things the language does not have', () => {
  // These are exactly the rows on screen 18's red card.
  const rejected = [
    ['$base + 1', 'arithmetic'],
    ['$a - $b', 'arithmetic'],
    ['len($items)', 'function calls'],
    ['$a and $b', 'boolean operators'],
    ['$a or $b', 'boolean operators'],
    ['not $a', 'boolean operators'],
    ['"api/" + $path', 'string concatenation'],
  ];

  for (const [input, why] of rejected) {
    it(`rejects ${input} — ${why}`, () => expect(parseExpression(input)).toBeNull());
  }

  it('does not mistake a hyphen inside a string for arithmetic', () => {
    expect(round('"eu-west-1"')).toBe('"eu-west-1"');
  });

  it('rejects a bare comparison outside a ternary', () => {
    // Comparisons are legal only as the test of a ternary.
    expect(parseExpression('$a == "x"')).toBeNull();
  });
});

describe('parseExpression — degenerate input', () => {
  it('rejects empty and whitespace', () => {
    expect(parseExpression('')).toBeNull();
    expect(parseExpression('   ')).toBeNull();
  });

  it('rejects a bare identifier, which is not a reference', () => {
    expect(parseExpression('batch_size')).toBeNull();
  });

  it('rejects an unterminated string', () => {
    expect(parseExpression('"oops')).toBeNull();
  });

  it('rejects a half-finished coalesce', () => {
    expect(parseExpression('$a ??')).toBeNull();
  });
});
