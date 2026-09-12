/**
 * Pointy syntax highlighting for the output panel.
 *
 * A tokeniser, not a parser — it only needs to be right enough to colour. The
 * palette is semantic and matches the canvas: an operator is the same colour on
 * the wire and in the source, which is the whole point of colouring it.
 */

export type TokenKind =
  | 'comment'
  | 'directive'
  | 'variable'
  | 'op-seq' // ->
  | 'op-flow' // |->  ||
  | 'op-retry' // *
  | 'op-coalesce' // ??
  | 'namespace-hub'
  | 'namespace-pypi'
  | 'namespace-github'
  | 'namespace-local'
  | 'meta-mode'
  | 'template'
  | 'descriptor'
  | 'string'
  | 'number'
  | 'ref'
  | 'punctuation'
  | 'attr-name'
  | 'identifier'
  | 'text';

export interface Token {
  kind: TokenKind;
  value: string;
}

export interface HighlightedLine {
  number: number;
  tokens: Token[];
}

/** Tailwind classes, so the colours follow the theme. */
export const TOKEN_CLASS: Record<TokenKind, string> = {
  comment: 'text-comment',
  directive: 'text-accent',
  variable: 'text-accent',
  'op-seq': 'text-seq',
  'op-flow': 'text-flow',
  'op-retry': 'text-retry',
  'op-coalesce': 'text-flow',
  'namespace-hub': 'text-seq',
  'namespace-pypi': 'text-template',
  'namespace-github': 'text-flow',
  'namespace-local': 'text-accent',
  'meta-mode': 'text-keyword',
  template: 'text-template',
  descriptor: 'text-keyword',
  string: 'text-template',
  number: 'text-keyword',
  ref: 'text-seq',
  punctuation: 'text-keyword',
  'attr-name': 'text-code',
  identifier: 'text-primary',
  text: 'text-code',
};

const NAMESPACE_KIND: Record<string, TokenKind> = {
  hub: 'namespace-hub',
  pypi: 'namespace-pypi',
  github: 'namespace-github',
  local: 'namespace-local',
};

const META_MODES = ['MAP', 'FILTER', 'REDUCE', 'FOREACH', 'FLATMAP', 'FANOUT'];

/** Ordered: the first match wins, so longer operators precede their prefixes. */
const RULES: { re: RegExp; kind: TokenKind | ((m: RegExpExecArray) => TokenKind) }[] = [
  { re: /^#.*/, kind: 'comment' },
  { re: /^"(?:[^"\\]|\\.)*"/, kind: 'string' },
  // @mode:  — a directive, distinguished from @var = by the colon
  { re: /^@[A-Za-z_][\w-]*(?=\s*:)/, kind: 'directive' },
  { re: /^@[A-Za-z_][\w-]*/, kind: 'variable' },
  { re: /^\$env\.[A-Za-z_]\w*/, kind: 'ref' },
  { re: /^\$[A-Za-z_]\w*/, kind: 'ref' },
  { re: /^\|->/, kind: 'op-flow' },
  { re: /^\|\|/, kind: 'op-flow' },
  { re: /^->/, kind: 'op-seq' },
  { re: /^\?\?/, kind: 'op-coalesce' },
  { re: /^\*/, kind: 'op-retry' },
  // namespace::
  {
    re: /^(hub|pypi|github|local)::/,
    kind: (m) => NAMESPACE_KIND[m[1]] ?? 'identifier',
  },
  // MAP<  — the mode, with the template picked up separately
  { re: /^(MAP|FILTER|REDUCE|FOREACH|FLATMAP|FANOUT)(?=<)/, kind: 'meta-mode' },
  // a descriptor is a bare digit that begins a branch path
  { re: /^\d(?=\s*->)/, kind: 'descriptor' },
  { re: /^\d+(?:\.\d+)?/, kind: 'number' },
  { re: /^(true|false|null)\b/, kind: 'number' },
  // attribute name, immediately before =
  { re: /^[A-Za-z_]\w*(?=\s*=)/, kind: 'attr-name' },
  { re: /^[A-Za-z_]\w*/, kind: 'identifier' },
  { re: /^[(){}[\],<>:=]/, kind: 'punctuation' },
  { re: /^\s+/, kind: 'text' },
  { re: /^./, kind: 'text' },
];

function tokeniseLine(line: string): Token[] {
  const tokens: Token[] = [];
  let rest = line;
  /** Inside `<…>` every identifier is the template name. */
  let inTemplate = false;

  while (rest.length > 0) {
    let matched = false;

    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (!m) continue;

      const value = m[0];
      let kind = typeof rule.kind === 'function' ? rule.kind(m) : rule.kind;

      if (value === '<') inTemplate = true;
      else if (value === '>') inTemplate = false;
      else if (inTemplate && kind === 'identifier') kind = 'template';
      else if (!inTemplate && kind === 'identifier' && META_MODES.includes(value)) {
        kind = 'meta-mode';
      }

      tokens.push({ kind, value });
      rest = rest.slice(value.length);
      matched = true;
      break;
    }

    // Defensive: a zero-width match would spin forever.
    if (!matched) {
      tokens.push({ kind: 'text', value: rest[0] });
      rest = rest.slice(1);
    }
  }

  return tokens;
}

export function highlight(source: string): HighlightedLine[] {
  return source.replace(/\n$/, '').split('\n').map((line, i) => ({
    number: i + 1,
    tokens: tokeniseLine(line),
  }));
}
