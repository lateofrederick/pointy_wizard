import type {
  Attr,
  Chain,
  ComparisonOp,
  Descriptor,
  EventRef,
  Expr,
  MetaMode,
  Namespace,
  PointyDocument,
  Variable,
} from '../../types/pointy';
import { META_MODES } from '../../types/pointy';
import { newEventId } from './edit';

/**
 * `.pointy` source -> document. The other half of emit().
 *
 * A hand-written recursive-descent parser rather than a generator: the grammar
 * is tiny, and the error messages matter more than the machinery — an import
 * that fails should say what it could not read and where.
 *
 * The contract that keeps the two honest is round-tripping:
 *   emit(parse(emit(doc))) === emit(doc)
 * which the tests assert for every fixture.
 */

export class PointyParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'PointyParseError';
  }
}

/* ------------------------------------------------------------------ tokeniser */

type TokenType =
  | 'arrow' // ->
  | 'pipe' // |->
  | 'parallel' // ||
  | 'star' // *
  | 'coalesce' // ??
  | 'question' // ?
  | 'colon' // :
  | 'dcolon' // ::
  | 'comma'
  | 'equals'
  | 'cmp'
  | 'lparen'
  | 'rparen'
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'lt'
  | 'gt'
  | 'at' // @name
  | 'ref' // $name
  | 'env' // $env.NAME
  | 'ident'
  | 'number'
  | 'string'
  | 'eof';

interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const PUNCT: [string, TokenType][] = [
  ['|->', 'pipe'],
  ['||', 'parallel'],
  ['->', 'arrow'],
  ['??', 'coalesce'],
  ['::', 'dcolon'],
  ['==', 'cmp'],
  ['!=', 'cmp'],
  ['>=', 'cmp'],
  ['<=', 'cmp'],
  ['*', 'star'],
  ['?', 'question'],
  [',', 'comma'],
  ['=', 'equals'],
  ['(', 'lparen'],
  [')', 'rparen'],
  ['{', 'lbrace'],
  ['}', 'rbrace'],
  ['[', 'lbracket'],
  [']', 'rbracket'],
  ['<', 'lt'],
  ['>', 'gt'],
  [':', 'colon'],
];

export function tokenise(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const push = (type: TokenType, value: string) => {
    tokens.push({ type, value, line, column: col });
    col += value.length;
    i += value.length;
  };

  while (i < source.length) {
    const ch = source[i];

    if (ch === '\n') {
      i += 1;
      line += 1;
      col = 1;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i += 1;
      col += 1;
      continue;
    }
    // Comments run to end of line and carry no meaning beyond the header.
    if (ch === '#') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let raw = '"';
      while (j < source.length && source[j] !== '"') {
        if (source[j] === '\\') {
          raw += source[j] + (source[j + 1] ?? '');
          j += 2;
          continue;
        }
        raw += source[j];
        j += 1;
      }
      if (j >= source.length) throw new PointyParseError('Unterminated string', line, col);
      raw += '"';
      push('string', raw);
      continue;
    }

    // A minus only starts a number; Pointy has no arithmetic.
    if (/\d/.test(ch) || (ch === '-' && /\d/.test(source[i + 1] ?? ''))) {
      const m = /^-?\d+(?:\.\d+)?/.exec(source.slice(i));
      if (m) {
        push('number', m[0]);
        continue;
      }
    }

    if (ch === '@') {
      const m = /^@[A-Za-z_][\w-]*/.exec(source.slice(i));
      if (!m) throw new PointyParseError('Expected a directive or variable name', line, col);
      push('at', m[0]);
      continue;
    }

    if (ch === '$') {
      const env = /^\$env\.[A-Za-z_]\w*/.exec(source.slice(i));
      if (env) {
        push('env', env[0]);
        continue;
      }
      const ref = /^\$[A-Za-z_]\w*/.exec(source.slice(i));
      if (!ref) throw new PointyParseError('Expected a variable name after $', line, col);
      push('ref', ref[0]);
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_]\w*/.exec(source.slice(i))!;
      push('ident', m[0]);
      continue;
    }

    const punct = PUNCT.find((p) => source.startsWith(p[0], i));
    if (punct) {
      push(punct[1], punct[0]);
      continue;
    }

    throw new PointyParseError(`Unexpected character ${JSON.stringify(ch)}`, line, col);
  }

  tokens.push({ type: 'eof', value: '', line, column: col });
  return tokens;
}

/* --------------------------------------------------------------------- parser */

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private at(type: TokenType, value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType, what: string): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new PointyParseError(
        `Expected ${what} but found ${t.value ? JSON.stringify(t.value) : 'end of file'}`,
        t.line,
        t.column,
      );
    }
    return this.next();
  }

  /* ----------------------------------------------------------- expressions */

  parseExpr(): Expr {
    const left = this.parseCoalesce();

    // Comparisons exist only as the test of a ternary.
    if (this.at('cmp') || this.at('lt') || this.at('gt')) {
      const op = this.next().value as ComparisonOp;
      const right = this.parseCoalesce();
      this.expect('question', '? in a ternary');
      const then = this.parseExpr();
      this.expect('colon', ': in a ternary');
      const otherwise = this.parseExpr();
      return { kind: 'ternary', left, op, right, then, otherwise };
    }

    return left;
  }

  private parseCoalesce(): Expr {
    const operands = [this.parseAtom()];
    while (this.at('coalesce')) {
      this.next();
      operands.push(this.parseAtom());
    }
    return operands.length === 1 ? operands[0] : { kind: 'coalesce', operands };
  }

  private parseAtom(): Expr {
    const t = this.peek();

    if (t.type === 'string') {
      this.next();
      return { kind: 'literal', value: unquote(t.value) };
    }
    if (t.type === 'number') {
      this.next();
      // Keep the spelling: 30.0 is a different literal from 30.
      return {
        kind: 'literal',
        value: Number(t.value),
        raw: t.value.includes('.') ? t.value : undefined,
      };
    }
    if (t.type === 'env') {
      this.next();
      return { kind: 'env', name: t.value.slice('$env.'.length) };
    }
    if (t.type === 'ref') {
      this.next();
      return { kind: 'ref', name: t.value.slice(1) };
    }
    if (t.type === 'ident' && ['true', 'false', 'null'].includes(t.value)) {
      this.next();
      return {
        kind: 'literal',
        value: t.value === 'null' ? null : t.value === 'true',
      };
    }
    if (t.type === 'lbracket') {
      this.next();
      const items: Expr[] = [];
      while (!this.at('rbracket')) {
        items.push(this.parseExpr());
        if (this.at('comma')) this.next();
        else break;
      }
      this.expect('rbracket', '] to close a list');
      return { kind: 'list', items };
    }
    if (t.type === 'lbrace') {
      this.next();
      const entries: Record<string, Expr> = {};
      while (!this.at('rbrace')) {
        const key = this.expect('ident', 'a key');
        this.expect('colon', ': after a key');
        entries[key.value] = this.parseExpr();
        if (this.at('comma')) this.next();
        else break;
      }
      this.expect('rbrace', '} to close a map');
      return { kind: 'map', entries };
    }

    throw new PointyParseError(
      `Expected a value but found ${t.value ? JSON.stringify(t.value) : 'end of file'}`,
      t.line,
      t.column,
    );
  }

  private parseAttrs(): Attr[] {
    if (!this.at('lbracket')) return [];
    this.next();
    const attrs: Attr[] = [];
    while (!this.at('rbracket')) {
      const name = this.expect('ident', 'an attribute name');
      this.expect('equals', '= after an attribute name');
      attrs.push({ name: name.value, value: this.parseExpr() });
      if (this.at('comma')) this.next();
      else break;
    }
    this.expect('rbracket', '] to close the attributes');
    return attrs;
  }

  /* ----------------------------------------------------------------- chain */

  /** Left-associative, so `A -> B -> C` is `seq(seq(A,B),C)`. */
  parseSequence(): Chain {
    let left = this.parseParallel();
    while (this.at('arrow') || this.at('pipe')) {
      const kind = this.next().type === 'arrow' ? 'seq' : 'pipe';
      left = { kind, left, right: this.parseParallel() };
    }
    return left;
  }

  /** `||` binds tighter than `->`, so a pair stays one unit under a sequence. */
  private parseParallel(): Chain {
    const members = [this.parsePostfix()];
    while (this.at('parallel')) {
      this.next();
      members.push(this.parsePostfix());
    }
    return members.length === 1 ? members[0] : { kind: 'parallel', members };
  }

  /** Retry binds tightest: `Name[attrs] * 3`. */
  private parsePostfix(): Chain {
    const node = this.parsePrimary();
    if (this.at('star')) {
      this.next();
      const retry: number | 'default' = this.at('number')
        ? Number(this.next().value)
        : 'default';
      if (node.kind !== 'event') {
        // A retry belongs to an event, not to a group or a branch.
        throw new PointyParseError('Retry can only follow an event', this.peek().line, this.peek().column);
      }
      return { kind: 'event', ref: { ...node.ref, retry } };
    }
    return node;
  }

  private parsePrimary(): Chain {
    if (this.at('lparen')) {
      this.next();
      const inner = this.parseSequence();
      this.expect('rparen', ') to close the group');
      return inner;
    }

    if (this.at('lbrace')) {
      this.next();
      const members: Chain[] = [];
      while (!this.at('rbrace')) {
        members.push(this.parseSequence());
        if (this.at('comma')) this.next();
        else break;
      }
      this.expect('rbrace', '} to close the concurrency group');
      return { kind: 'group', members, attributes: this.parseAttrs() };
    }

    const ref = this.parseEvent();

    // `Name(0 -> …, 1 -> …)` is a branch.
    if (this.at('lparen')) {
      this.next();
      const paths: { descriptor: Descriptor; body: Chain }[] = [];
      while (!this.at('rparen')) {
        const d = this.expect('number', 'a descriptor');
        const descriptor = Number(d.value);
        if (!Number.isInteger(descriptor) || descriptor < 0 || descriptor > 9) {
          throw new PointyParseError(
            `Descriptor must be an integer 0–9, found ${d.value}`,
            d.line,
            d.column,
          );
        }
        this.expect('arrow', '-> after a descriptor');
        paths.push({ descriptor: descriptor as Descriptor, body: this.parseSequence() });
        if (this.at('comma')) this.next();
        else break;
      }
      this.expect('rparen', ') to close the branch');
      return { kind: 'branch', on: ref, paths };
    }

    return { kind: 'event', ref };
  }

  private parseEvent(): EventRef {
    const first = this.expect('ident', 'an event name');

    let namespace: Namespace = 'local';
    let name = first.value;

    if (this.at('dcolon')) {
      if (!['hub', 'pypi', 'github', 'local'].includes(first.value)) {
        throw new PointyParseError(
          `Unknown namespace ${JSON.stringify(first.value)}`,
          first.line,
          first.column,
        );
      }
      namespace = first.value as Namespace;
      this.next();
      name = this.expect('ident', 'an event name after ::').value;
    }

    // `MODE<Template>` is a meta event.
    if (META_MODES.includes(name as MetaMode) && this.at('lt')) {
      this.next();
      const template = this.expect('ident', 'a template name').value;
      this.expect('gt', '> to close the template');
      const attrs = this.parseAttrs();
      return {
        id: newEventId(),
        name: template,
        namespace,
        attributes: [],
        // Everything in the single bracket is meta-level on the way in. The
        // split into meta vs template level is not recoverable from source.
        meta: { mode: name as MetaMode, template, metaAttributes: attrs },
      };
    }

    return { id: newEventId(), name, namespace, attributes: this.parseAttrs() };
  }

  /* -------------------------------------------------------------- document */

  parseDocument(name: string): PointyDocument {
    const directives: PointyDocument['directives'] = {};
    const variables: Variable[] = [];

    while (this.at('at')) {
      const token = this.next();
      const key = token.value.slice(1);

      if (this.at('colon')) {
        this.next();
        const value = this.parseAtom();
        const literal = value.kind === 'literal' ? value.value : undefined;

        if (key === 'version') directives.version = String(literal);
        else if (key === 'mode') {
          if (literal !== 'DAG' && literal !== 'CFG') {
            throw new PointyParseError(
              `@mode must be "DAG" or "CFG", found ${JSON.stringify(String(literal))}`,
              token.line,
              token.column,
            );
          }
          directives.mode = literal;
        } else if (key === 'recursive-depth') directives.recursiveDepth = Number(literal);
        // Unknown directives are ignored rather than fatal: a newer file should
        // still open, and lint is the place to say something about it.
        continue;
      }

      this.expect('equals', '= or : after a directive name');
      variables.push({ name: key, value: this.parseExpr() });
    }

    const chain = this.at('eof') ? null : this.parseSequence();

    if (!this.at('eof')) {
      const t = this.peek();
      throw new PointyParseError(
        `Unexpected ${JSON.stringify(t.value)} after the pipeline`,
        t.line,
        t.column,
      );
    }

    return {
      name,
      directives,
      variables,
      sources: [],
      chain,
      staged: [],
      definitions: {},
      layout: {},
    };
  }
}

function unquote(raw: string): string {
  return raw.slice(1, -1).replace(/\\(.)/g, '$1');
}

/** Recover the pipeline name from the header comment emit() writes. */
function nameFromHeader(source: string, fallback: string): string {
  const m = /^#\s*([\w.-]+)\.pointy/m.exec(source);
  return m ? m[1] : fallback;
}

export function parse(source: string, fallbackName = 'imported'): PointyDocument {
  const doc = new Parser(tokenise(source)).parseDocument(
    nameFromHeader(source, fallbackName),
  );
  return doc;
}

/** Parse without throwing — for the import flow, which shows the error inline. */
export function tryParse(
  source: string,
  fallbackName?: string,
): { ok: true; doc: PointyDocument } | { ok: false; error: string; line?: number } {
  try {
    return { ok: true, doc: parse(source, fallbackName) };
  } catch (e) {
    if (e instanceof PointyParseError) {
      return { ok: false, error: e.message, line: e.line };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
