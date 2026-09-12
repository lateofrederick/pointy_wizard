/**
 * The Pointy document model.
 *
 * THE CHAIN IS THE TRUTH; CANVAS POSITION IS PRESENTATION.
 *
 * This was settled during design: a node can sit anywhere on the canvas, and a
 * connection exists only because a typed wire was drawn. Dragging a node never
 * reorders the emitted Pointy. That is why `layout` is a separate map and why
 * the program is an expression tree rather than a flat edge list — `{ }` groups,
 * `( )` branches and `||` pairs are structural, and a list of adjacencies cannot
 * represent them.
 *
 * See docs/ui-migration.md §4.
 */

/** 0 = success, 1 = failure, 2–9 = user-defined via self.goto(n, ok, result). */
export type Descriptor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const DESCRIPTORS: readonly Descriptor[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** `local` is the implicit default and is never written into the output. */
export type Namespace = 'local' | 'pypi' | 'github' | 'hub';

export type MetaMode = 'MAP' | 'FILTER' | 'REDUCE' | 'FOREACH' | 'FLATMAP' | 'FANOUT';

export const META_MODES: readonly MetaMode[] = [
  'MAP',
  'FILTER',
  'REDUCE',
  'FOREACH',
  'FLATMAP',
  'FANOUT',
];

export type ComparisonOp = '==' | '!=' | '>' | '<' | '>=' | '<=';

/**
 * Values in `[attributes]` and `@variables`.
 *
 * Deliberately tiny, and that is the language, not an MVP cut: Pointy has no
 * arithmetic, no function calls, no string concatenation and no boolean
 * operators. Comparisons exist only as the test of a ternary.
 */
export type Expr =
  /**
   * `raw` preserves the source spelling of a literal. JavaScript cannot tell
   * `30.0` from `30`, but Pointy can — a float attribute written `30.0` must
   * round-trip as `30.0`. Set it on import; leave it unset when the user types
   * a value and let the emitter format.
   */
  | { kind: 'literal'; value: string | number | boolean | null; raw?: string }
  | { kind: 'list'; items: Expr[] }
  | { kind: 'map'; entries: Record<string, Expr> }
  | { kind: 'ref'; name: string }
  | { kind: 'env'; name: string }
  | { kind: 'coalesce'; operands: Expr[] }
  | {
      kind: 'ternary';
      left: Expr;
      op: ComparisonOp;
      right: Expr;
      then: Expr;
      otherwise: Expr;
    };

export interface Attr {
  name: string;
  value: Expr;
}

export interface MetaSpec {
  mode: MetaMode;
  /** The wrapped event's name. A template containing `<` means someone nested
   *  a meta event, which the parser rejects — lint catches it. */
  template: string;
  /** batch_size, concurrent, max_workers, count, initial_value, … */
  metaAttributes: Attr[];
}

/**
 * One *occurrence* of an event in the chain.
 *
 * `id` is per-occurrence, not per-event. Under `@mode: "CFG"` the same event may
 * appear many times — screen 16 draws AnalystAgent twice — and each appearance
 * is a discrete traversal with its own node on the canvas. Identity for
 * "is this the same event?" is `name` + `namespace`.
 */
export interface EventRef {
  id: string;
  name: string;
  namespace: Namespace;
  /** Only meaningful for non-local namespaces. */
  version?: string;
  /** Template-level attributes: executor, retry_attempts, stop_condition, … */
  attributes: Attr[];
  /** `* 3`, or `'default'` for a bare `*`. Numeric retry must be >= 2. */
  retry?: number | 'default';
  meta?: MetaSpec;
  /** Key into PointyDocument.definitions. */
  definitionId?: string;
}

export interface BranchPath {
  descriptor: Descriptor;
  /** UI metadata only — never emitted. 0 and 1 are conventionally
   *  success/failure and should not be relabelled. */
  label?: string;
  body: Chain;
}

export type Chain =
  | { kind: 'event'; ref: EventRef }
  | { kind: 'seq'; left: Chain; right: Chain }
  | { kind: 'pipe'; left: Chain; right: Chain }
  | { kind: 'parallel'; members: Chain[] }
  | { kind: 'group'; members: Chain[]; attributes: Attr[] }
  | { kind: 'branch'; on: EventRef; paths: BranchPath[] };

export interface Variable {
  name: string;
  value: Expr;
}

export interface RegistrySource {
  namespace: Exclude<Namespace, 'local'>;
  package: string;
  version: string;
}

export interface Directives {
  version?: string;
  /**
   * Undefined means "not set", which is CFG — and emits no @mode line, matching
   * screen 03. Set it explicitly to emit it, matching screen 13.
   */
  mode?: 'DAG' | 'CFG';
  /** Deprecated, kept so an imported file round-trips and lint can warn. */
  recursiveDepth?: number;
}

export interface EventDefinition {
  filename: string;
  source: string;
}

export interface PointyDocument {
  /** Bare name, no extension. The emitted header comment is `{name}.pointy`. */
  name: string;
  directives: Directives;
  variables: Variable[];
  sources: RegistrySource[];
  chain: Chain | null;
  definitions: Record<string, EventDefinition>;
  /** Presentation only. The emitter never reads this. Keyed by EventRef.id. */
  layout: Record<string, { x: number; y: number }>;
}

export const DEFAULT_MODE = 'CFG' as const;

export function effectiveMode(doc: PointyDocument): 'DAG' | 'CFG' {
  return doc.directives.mode ?? DEFAULT_MODE;
}

export function emptyDocument(name = 'untitled'): PointyDocument {
  return {
    name,
    directives: {},
    variables: [],
    sources: [],
    chain: null,
    definitions: {},
    layout: {},
  };
}
