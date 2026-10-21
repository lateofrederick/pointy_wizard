import type { Chain, Expr, PointyDocument } from '../../types/pointy';
import { effectiveMode } from '../../types/pointy';
import { events, nodes } from './walk';

/**
 * Structural and semantic checks on a document.
 *
 * Replaces `utils/pointy.ts:validatePointyCode`, which linted Python — it
 * checked for semicolons and indentation — rather than Pointy.
 *
 * Every diagnostic names the rule it broke. Screen 10's callout has a title, a
 * cause and a single fix, and the design note is explicit that "invalid
 * pipeline" on its own is not an acceptable string.
 */

export type Severity = 'error' | 'warning';

export type DiagnosticTarget =
  | { kind: 'event'; eventId: string }
  | { kind: 'directive'; name: string }
  | { kind: 'variable'; name: string }
  | { kind: 'document' };

export interface Diagnostic {
  /** Stable code, safe to switch on. */
  code: string;
  severity: Severity;
  /** What happened, in the user's terms. */
  message: string;
  /** The Pointy rule that was broken. Always present. */
  rule: string;
  target: DiagnosticTarget;
  /** The single action that resolves it, if there is one. */
  fix?: { label: string; action: string };
}

function refsIn(expr: Expr, out: Set<string> = new Set()): Set<string> {
  switch (expr.kind) {
    case 'ref':
      out.add(expr.name);
      break;
    case 'list':
      expr.items.forEach((i) => refsIn(i, out));
      break;
    case 'map':
      Object.values(expr.entries).forEach((v) => refsIn(v, out));
      break;
    case 'coalesce':
      expr.operands.forEach((o) => refsIn(o, out));
      break;
    case 'ternary':
      [expr.left, expr.right, expr.then, expr.otherwise].forEach((e) => refsIn(e, out));
      break;
    case 'literal':
    case 'env':
      break;
  }
  return out;
}

/** `||` may not contain `{ }`: a group is an orchestrator, not a process. */
function groupInsideParallel(chain: Chain): boolean {
  switch (chain.kind) {
    case 'group':
      return true;
    case 'seq':
    case 'pipe':
      return groupInsideParallel(chain.left) || groupInsideParallel(chain.right);
    case 'parallel':
      return chain.members.some(groupInsideParallel);
    case 'event':
    case 'branch':
      return false;
  }
}

export function lint(doc: PointyDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  const all = events(doc.chain);

  // --- namespaces -----------------------------------------------------------
  const registered = new Set(doc.sources.map((s) => s.namespace));
  for (const e of all) {
    if (e.namespace !== 'local' && !registered.has(e.namespace)) {
      out.push({
        code: 'unresolved-namespace',
        severity: 'error',
        message: `${e.namespace}::${e.name} has no registered source, so the compiler cannot find the event.`,
        rule: 'Every non-local namespace must have a registered source.',
        target: { kind: 'event', eventId: e.id },
        fix: { label: 'Register source →', action: 'open-sources' },
      });
    }
  }

  // --- event reuse under DAG ------------------------------------------------
  if (effectiveMode(doc) === 'DAG') {
    const seen = new Map<string, number>();
    for (const e of all) {
      const key = `${e.namespace}::${e.name}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const e of all) {
      const key = `${e.namespace}::${e.name}`;
      if ((seen.get(key) ?? 0) > 1) {
        out.push({
          code: 'dag-reuse',
          severity: 'error',
          message: `${e.name} appears more than once, which @mode: "DAG" forbids.`,
          rule: 'DAG mode forbids event reuse. CFG allows it — each traversal is a discrete execution.',
          target: { kind: 'event', eventId: e.id },
          fix: { label: 'Switch to CFG →', action: 'set-mode-cfg' },
        });
        seen.set(key, 0); // report once per event name, not per occurrence
      }
    }
  }

  // --- deprecated directive -------------------------------------------------
  if (doc.directives.recursiveDepth !== undefined) {
    out.push({
      code: 'deprecated-directive',
      severity: 'warning',
      message: '@recursive-depth is kept for backward compatibility only and will be removed.',
      rule: '@recursive-depth is deprecated; CFG mode replaces it.',
      target: { kind: 'directive', name: 'recursive-depth' },
      fix: { label: 'Remove it →', action: 'remove-recursive-depth' },
    });
  }

  // --- structural rules -----------------------------------------------------
  for (const node of nodes(doc.chain)) {
    if (node.kind === 'parallel' && node.members.some(groupInsideParallel)) {
      out.push({
        code: 'group-in-parallel',
        severity: 'error',
        message: 'A { } concurrency group cannot sit inside a || parallel pair.',
        rule: '{ } may contain || at leaf level; || may not contain { }. A group orchestrates, so it can never be a process.',
        target: { kind: 'document' },
      });
    }

    if (node.kind === 'branch') {
      const seen = new Set<number>();
      for (const p of node.paths) {
        if (seen.has(p.descriptor)) {
          out.push({
            code: 'duplicate-descriptor',
            severity: 'error',
            message: `${node.on.name} has two paths for descriptor ${p.descriptor}.`,
            rule: 'Each descriptor may appear at most once per branch.',
            target: { kind: 'event', eventId: node.on.id },
          });
        }
        seen.add(p.descriptor);
      }
      if (node.paths.length > 10) {
        out.push({
          code: 'too-many-paths',
          severity: 'error',
          message: `${node.on.name} has ${node.paths.length} paths; a branch tops out at 10.`,
          rule: 'Descriptors are integers 0–9, so a branch caps at 10 paths.',
          target: { kind: 'event', eventId: node.on.id },
        });
      }
      if (node.paths.length < 2) {
        out.push({
          code: 'single-path-branch',
          severity: 'warning',
          message: `${node.on.name} branches to a single path, so the branch does nothing.`,
          rule: 'A branch with one path is equivalent to a plain -> connection.',
          target: { kind: 'event', eventId: node.on.id },
        });
      }
    }
  }

  // --- per-event rules ------------------------------------------------------
  for (const e of all) {
    if (typeof e.retry === 'number' && e.retry < 2) {
      out.push({
        code: 'retry-below-minimum',
        severity: 'error',
        message: `${e.name} sets retry to ${e.retry}. Retry is off, or at least 2.`,
        rule: 'A numeric retry must be >= 2; leave it unset to disable retry.',
        target: { kind: 'event', eventId: e.id },
      });
    }

    if (e.meta && e.meta.template.includes('<')) {
      out.push({
        code: 'nested-meta-event',
        severity: 'error',
        message: `${e.meta.mode}<${e.meta.template}> nests one meta event inside another.`,
        rule: 'A Meta Event takes a collection and returns one, so it can never wrap another Meta Event — chain them with |-> instead.',
        target: { kind: 'event', eventId: e.id },
      });
    }

    if (e.namespace === 'local' && !e.definitionId) {
      out.push({
        code: 'missing-definition',
        severity: 'warning',
        message: `${e.name} is local but has no Python definition yet.`,
        rule: 'A local event needs a class deriving from EventBase.',
        target: { kind: 'event', eventId: e.id },
        fix: { label: 'Add event definition →', action: 'open-definition' },
      });
    }
  }

  // --- staged events --------------------------------------------------------
  for (const s of doc.staged) {
    out.push({
      code: 'unconnected-event',
      severity: 'warning',
      message: `${s.name} is on the canvas but not connected, so it will not run.`,
      rule: 'A .pointy file holds one chain; an event outside it is not part of the program.',
      target: { kind: 'event', eventId: s.id },
    });
  }

  // --- variables ------------------------------------------------------------
  const declared = new Set(doc.variables.map((v) => v.name));
  const used = new Set<string>();
  for (const v of doc.variables) refsIn(v.value, used);
  for (const e of all) {
    for (const a of e.attributes) refsIn(a.value, used);
    for (const a of e.meta?.metaAttributes ?? []) refsIn(a.value, used);
  }
  for (const node of nodes(doc.chain)) {
    if (node.kind === 'group') for (const a of node.attributes) refsIn(a.value, used);
  }
  for (const name of used) {
    if (!declared.has(name)) {
      out.push({
        code: 'undefined-variable',
        severity: 'error',
        message: `$${name} is used but never declared.`,
        rule: 'Variables are declared after the directives and before the events.',
        target: { kind: 'variable', name },
      });
    }
  }

  return out;
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

/** Screen 10's top-bar chip: "✕ 2 errors, 1 warning". */
export function summarise(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  if (!errors && !warnings) return 'VALID POINTY';
  const parts: string[] = [];
  if (errors) parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  if (warnings) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  return parts.join(', ');
}
