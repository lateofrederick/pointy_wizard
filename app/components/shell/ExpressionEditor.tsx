'use client';

import { useMemo, useState } from 'react';
import type { Expr } from '../../types/pointy';
import { emitExpr } from '../../lib/pointy/emit';
import { cn } from '../../lib/cn';
import { Button } from '../ui';

/**
 * Expression editor — Figma screen 18.
 *
 * The only place in the wizard where you type Pointy rather than draw it, and
 * the grammar is deliberately tiny: literals, $references, $env lookups, ??
 * fallback chains and a single ternary. That is why the chip row can be the
 * whole vocabulary, and why the red card can enumerate everything the language
 * does *not* have.
 */

const CHIPS: { insert: string; label: string; tone: string }[] = [
  { insert: '$variable', label: '$variable', tone: 'text-seq' },
  { insert: '$env.VAR', label: '$env.VAR', tone: 'text-seq' },
  { insert: ' ?? fallback', label: '?? fallback', tone: 'text-flow' },
  { insert: '$a == b ? x : y', label: '$a == b ? x : y', tone: 'text-flow' },
  { insert: '"string"', label: '"string"', tone: 'text-template' },
  { insert: '42', label: '42', tone: 'text-keyword' },
  { insert: 'true', label: 'true', tone: 'text-keyword' },
];

const NOT_IN_GRAMMAR = [
  ['$base + 1', 'arithmetic'],
  ['len($items)', 'function calls'],
  ['$a and $b', 'boolean operators'],
  ['"api/" + $path', 'string concatenation'],
];

/**
 * Parse the small grammar. Returns null when the text is not something the
 * language can express, which is the signal the editor shows as invalid.
 */
export function parseExpression(input: string): Expr | null {
  const text = input.trim();
  if (!text) return null;

  // Reject the four things the red card names, before anything else, so the
  // message is about the grammar rather than a parse position.
  // Strings are removed first so a hyphen in "eu-west-1" is not arithmetic.
  const bare = text.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  // `+ * / %` are arithmetic wherever they appear. `-` only counts when it
  // follows an operand — a leading minus is part of a negative literal.
  if (/[+*/%]/.test(bare) || /[\w")\]]\s*-/.test(bare)) return null;
  if (/\b(and|or|not)\b/.test(bare)) return null;
  if (/\w\s*\(/.test(bare)) return null;

  const ternary = text.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternary) {
    const [, l, op, r, then, otherwise] = ternary;
    const parts = [l, r, then, otherwise].map((p) => parseAtomOrCoalesce(p));
    if (parts.some((p) => p === null)) return null;
    return {
      kind: 'ternary',
      left: parts[0]!,
      op: op as '==' | '!=' | '>' | '<' | '>=' | '<=',
      right: parts[1]!,
      then: parts[2]!,
      otherwise: parts[3]!,
    };
  }

  return parseAtomOrCoalesce(text);
}

function parseAtomOrCoalesce(text: string): Expr | null {
  const parts = text.split('??').map((p) => p.trim());
  if (parts.length > 1) {
    const operands = parts.map(parseAtom);
    if (operands.some((o) => o === null)) return null;
    return { kind: 'coalesce', operands: operands as Expr[] };
  }
  return parseAtom(text.trim());
}

function parseAtom(text: string): Expr | null {
  const t = text.trim();
  if (!t) return null;
  if (/^"(?:[^"\\]|\\.)*"$/.test(t)) return { kind: 'literal', value: t.slice(1, -1) };
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    // Keep the spelling: 30.0 is not 30 to the runtime.
    return { kind: 'literal', value: Number(t), raw: t.includes('.') ? t : undefined };
  }
  if (t === 'true') return { kind: 'literal', value: true };
  if (t === 'false') return { kind: 'literal', value: false };
  if (t === 'null') return { kind: 'literal', value: null };
  if (/^\$env\.[A-Za-z_]\w*$/.test(t)) return { kind: 'env', name: t.slice(5) };
  if (/^\$[A-Za-z_]\w*$/.test(t)) return { kind: 'ref', name: t.slice(1) };
  return null;
}

export function ExpressionEditor({
  name,
  value,
  onCommit,
  onCancel,
}: {
  name: string;
  value: Expr;
  onCommit: (next: Expr) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(() => emitExpr(value));
  const parsed = useMemo(() => parseExpression(text), [text]);
  const valid = parsed !== null;

  return (
    <div className="rounded-[8px] border border-edge-strong bg-bg-raised p-3 shadow-raised">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-medium text-accent">{name}</span>
        <span className="font-mono text-[11px] text-tertiary">=</span>
      </div>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && parsed) onCommit(parsed);
          if (e.key === 'Escape') onCancel();
          e.stopPropagation();
        }}
        aria-label={`Value for ${name}`}
        aria-invalid={!valid}
        className={cn(
          'mt-2 w-full rounded-[6px] border bg-bg-sunken px-3 py-2 font-mono text-[11.5px] text-code outline-none',
          valid ? 'border-seq/70' : 'border-danger',
        )}
      />

      <p className="ds-section-label mt-3">INSERT</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setText((t) => t + c.insert)}
            className={cn(
              'cursor-pointer rounded-[5px] border border-edge bg-bg-sunken px-2 py-1',
              'font-mono text-[10px]',
              c.tone,
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {valid ? (
        <div className="mt-3 rounded-[6px] border border-keyword/30 bg-keyword-tint px-3 py-2">
          <p className="ds-section-label !text-keyword">RESOLVES TO</p>
          <p className="mt-1 font-mono text-[12px] font-medium text-keyword">
            {emitExpr(parsed)}
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-[6px] border border-danger/30 bg-danger-tint px-3 py-2">
          <p className="ds-section-label !text-danger">NOT PART OF THE EXPRESSION GRAMMAR</p>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {NOT_IN_GRAMMAR.map(([code, why]) => (
              <p key={code} className="font-mono text-[10px]">
                <span className="text-danger">{code}</span>
                <span className="ml-3 text-tertiary">{why}</span>
              </p>
            ))}
          </div>
          <p className="mt-2 font-sans text-[9px] leading-[14px] text-tertiary">
            Comparisons (== != &gt; &lt; &gt;= &lt;=) are allowed, but only as the test of a
            ternary. Everything else is a literal, a $reference, or a ?? chain.
          </p>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button kind="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button kind="primary" disabled={!valid} onClick={() => parsed && onCommit(parsed)}>
          Save value
        </Button>
      </div>
    </div>
  );
}
