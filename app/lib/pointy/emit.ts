import type {
  Attr,
  Chain,
  EventRef,
  Expr,
  PointyDocument,
} from '../../types/pointy';

/**
 * Graph -> .pointy source.
 *
 * The reference for this is the output panel of screen 03 (`3:2`) and screen 13
 * (`36:2267`) in Figma, which are reproduced byte-for-byte by the tests.
 *
 * FORMATTING RULE: break before every top-level sequencing operator and indent
 * it 2. Everything nested — group members, parallel members, the body of a
 * branch path — stays on one line. Screen 17's panel keeps a trailing
 * `-> Publish` inline, which this rule breaks onto its own line; that panel was
 * hand-set and the deterministic rule wins. See the note in emit.test.ts.
 */

const INDENT = '  ';
/** Extra indent for the lines inside `Name( … )`. */
const BRANCH_BODY_INDENT = '    ';

// ---------------------------------------------------------------- expressions

function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function emitExpr(expr: Expr): string {
  switch (expr.kind) {
    case 'literal':
      // A preserved source spelling wins: 30.0 must not come back as 30.
      if (expr.raw !== undefined) return expr.raw;
      if (expr.value === null) return 'null';
      if (typeof expr.value === 'string') return quote(expr.value);
      return String(expr.value);
    case 'list':
      return `[${expr.items.map(emitExpr).join(', ')}]`;
    case 'map': {
      const body = Object.entries(expr.entries)
        .map(([k, v]) => `${k}: ${emitExpr(v)}`)
        .join(', ');
      return `{${body}}`;
    }
    case 'ref':
      return `$${expr.name}`;
    case 'env':
      return `$env.${expr.name}`;
    case 'coalesce':
      return expr.operands.map(emitExpr).join(' ?? ');
    case 'ternary':
      return (
        `${emitExpr(expr.left)} ${expr.op} ${emitExpr(expr.right)}` +
        ` ? ${emitExpr(expr.then)} : ${emitExpr(expr.otherwise)}`
      );
  }
}

function emitAttrs(attrs: Attr[]): string {
  if (attrs.length === 0) return '';
  return `[${attrs.map((a) => `${a.name}=${emitExpr(a.value)}`).join(', ')}]`;
}

// --------------------------------------------------------------------- events

export function emitEvent(ref: EventRef): string {
  // `local::` is implicit and must never be written out.
  const ns = ref.namespace === 'local' ? '' : `${ref.namespace}::`;

  const head = ref.meta
    ? `${ref.meta.mode}<${ref.meta.template}>`
    : `${ns}${ref.name}`;

  // Meta-level attributes precede template-level ones in the single bracket.
  const attrs = ref.meta
    ? emitAttrs([...ref.meta.metaAttributes, ...ref.attributes])
    : emitAttrs(ref.attributes);

  let out = `${head}${attrs}`;

  if (ref.retry === 'default') out += ' *';
  else if (typeof ref.retry === 'number') out += ` * ${ref.retry}`;

  return out;
}

// --------------------------------------------------------------------- chains

/** An atom needs no parentheses when it becomes a member of `||`. */
function isAtomic(chain: Chain): boolean {
  return chain.kind === 'event' || chain.kind === 'group' || chain.kind === 'branch';
}

/** One-line rendering, used for everything nested inside another construct. */
function inline(chain: Chain): string {
  switch (chain.kind) {
    case 'event':
      return emitEvent(chain.ref);
    case 'seq':
      return `${inline(chain.left)} -> ${inline(chain.right)}`;
    case 'pipe':
      return `${inline(chain.left)} |-> ${inline(chain.right)}`;
    case 'parallel':
      return chain.members
        .map((m) => (isAtomic(m) ? inline(m) : `(${inline(m)})`))
        .join(' || ');
    case 'group':
      return `{ ${chain.members.map(inline).join(', ')} }${emitAttrs(chain.attributes)}`;
    case 'branch':
      return `${emitEvent(chain.on)}(${chain.paths
        .map((p) => `${p.descriptor} -> ${inline(p.body)}`)
        .join(', ')})`;
  }
}

/** Flatten a left-nested spine of -> / |-> into segments, preserving operators. */
interface Segment {
  op: '->' | '|->' | null;
  chain: Chain;
}

function spine(chain: Chain): Segment[] {
  if (chain.kind === 'seq' || chain.kind === 'pipe') {
    const op = chain.kind === 'seq' ? '->' : '|->';
    return [...spine(chain.left), { op, chain: chain.right }];
  }
  return [{ op: null, chain }];
}

function block(chain: Chain, indent: string): string[] {
  // A branch is the only construct that opens onto its own lines.
  if (chain.kind === 'branch') {
    const lines = [`${emitEvent(chain.on)}(`];
    chain.paths.forEach((p, i) => {
      const comma = i < chain.paths.length - 1 ? ',' : '';
      lines.push(`${BRANCH_BODY_INDENT}${p.descriptor} -> ${inline(p.body)}${comma}`);
    });
    lines.push(`${INDENT})`);
    return lines.map((l, i) => (i === 0 ? l : `${indent}${l}`));
  }
  return [inline(chain)];
}

export function emitChain(chain: Chain): string {
  const segments = spine(chain);
  const out: string[] = [];

  segments.forEach((seg, i) => {
    const indent = i === 0 ? '' : INDENT;
    const prefix = seg.op ? `${seg.op} ` : '';
    const [first, ...rest] = block(seg.chain, indent);
    out.push(`${indent}${prefix}${first}`);
    out.push(...rest);
  });

  return out.join('\n');
}

// ------------------------------------------------------------------- document

export function emit(doc: PointyDocument): string {
  const lines: string[] = [`# ${doc.name}.pointy — generated by Pointy Wizard`];

  if (doc.directives.version) lines.push(`@version: ${quote(doc.directives.version)}`);
  // Only emitted when explicitly set — an unset mode is CFG and says nothing,
  // which is why screen 03 has no @mode line and screen 13 does.
  if (doc.directives.mode) lines.push(`@mode: ${quote(doc.directives.mode)}`);
  if (doc.directives.recursiveDepth !== undefined) {
    lines.push(`@recursive-depth: ${doc.directives.recursiveDepth}`);
  }

  if (doc.variables.length > 0) {
    lines.push('');
    for (const v of doc.variables) lines.push(`@${v.name} = ${emitExpr(v.value)}`);
  }

  lines.push('');
  lines.push(doc.chain ? emitChain(doc.chain) : '# no events yet');

  return `${lines.join('\n')}\n`;
}
