import type { PointyDocument } from '../../types/pointy';
import type { Diagnostic } from '../pointy/lint';
import { events } from '../pointy/walk';

/**
 * Lint a definition's Python against the Volnux event contract.
 *
 * This is the check that makes the Definition tab an editor rather than a
 * text area. The rules are not invented here — each one mirrors something the
 * framework itself enforces at import or decoration time, so a definition
 * that passes this linter will import cleanly on the platform:
 *
 *   - EventBase (event/base.py): abstract `process`, no `__init__` override,
 *     goto descriptors 0-9, a fixed set of class-level configuration attrs.
 *   - @event (decorators.py): first parameter must be `self`, optional
 *     name= override, retry_policy=RetryPolicy(...).
 *   - RetryPolicy (mixins/event/retry.py): four keys, no others.
 *   - docs ch3/ch4: `from volnux import EventBase` / `from volnux import event`
 *     (the package is volnux, not pointy — the wizard's old placeholder name),
 *     class-based process must be async, function-based may be either.
 *
 * A line-scanner, not a parser: definitions in the wizard are small files and
 * the diagnostics point at lines. Anything it cannot see statically is left
 * alone rather than guessed.
 */

export type PythonDiagnostic = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  /** The framework/docs rule that was broken. Always present. */
  rule: string;
  /** 1-based. */
  line: number;
  /** 1-based, inclusive. */
  column: number;
  /** 1-based, exclusive — Monaco's endColumn convention. */
  endColumn: number;
};

/** Class-level attributes EventBase and its mixins accept. */
const CLASS_ATTRS = new Set([
  'executor',
  'executor_config',
  'retry_policy',
  'result_evaluation_strategy',
  'namespace',
  'name',
  'version',
  'changelog',
  'deprecated',
  'deprecation_info',
  'versioning_class',
  'event_type',
  'categories',
  'INIT_PARAMS_SCHEMA',
]);

/** Keys RetryPolicy accepts in its dataclass / dict form. */
const RETRY_POLICY_KEYS = new Set([
  'max_attempts',
  'backoff_factor',
  'max_backoff',
  'retry_on_exceptions',
]);

/** Base-class names that make a class an event. `Event` is EventBase's alias. */
const EVENT_BASES = new Set(['EventBase', 'Event']);

type Line = { n: number; indent: number; code: string };

function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#') return line.slice(0, i);
  }
  return line;
}

function scan(source: string): Line[] {
  return source.replace(/\t/g, '    ').split('\n').map((raw, i) => ({
    n: i + 1,
    indent: raw.length - raw.trimStart().length,
    code: stripComment(raw).trim(),
  }));
}

function span(line: Line): Pick<PythonDiagnostic, 'line' | 'column' | 'endColumn'> {
  return { line: line.n, column: 1, endColumn: Math.max(line.code.length + 1, 2) };
}

function diag(
  line: Line,
  severity: PythonDiagnostic['severity'],
  code: string,
  message: string,
  rule: string,
): PythonDiagnostic {
  return { code, severity, message, rule, ...span(line) };
}

/** Split on commas that are not nested in brackets or strings. */
function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quote) {
      current += c;
      if (c === '\\') {
        current += input[i + 1] ?? '';
        i += 1;
      } else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      current += c;
      continue;
    }
    if ('([{'.includes(c)) depth += 1;
    if (')]}'.includes(c)) depth -= 1;
    if (c === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

function nearestAttr(name: string): string | undefined {
  let best: string | undefined;
  let bestD = 3; // suggestions only within a tight miss
  for (const known of CLASS_ATTRS) {
    const d = editDistance(name.toLowerCase(), known.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = known;
    }
  }
  return best;
}

/** `class X(volnux.EventBase, mixin):` → base names, last dotted segment. */
function baseNames(raw: string): string[] {
  return splitTopLevel(raw)
    .map((b) => b.split('.').pop()!.trim())
    .filter(Boolean);
}

function importNames(lines: Line[]): Set<string> {
  // Everything bound by `from volnux import a, b as c` or `import volnux`.
  const bound = new Set<string>();
  for (const line of lines) {
    const from = /^from\s+([\w.]+)\s+import\s+(.+)$/.exec(line.code);
    if (from) {
      if (from[1] === 'volnux' || from[1].startsWith('volnux.')) {
        for (const part of splitTopLevel(from[2])) {
          const name = part.split(/\s+as\s+/).pop()!.trim();
          if (name && name !== '*') bound.add(name);
        }
      }
      continue;
    }
    const plain = /^import\s+(.+)$/.exec(line.code);
    if (plain) {
      for (const part of splitTopLevel(plain[1])) {
        const [path, alias] = part.split(/\s+as\s+/);
        if (path === 'volnux') bound.add((alias ?? 'volnux').trim());
      }
    }
  }
  return bound;
}

type ClassDef = {
  line: Line;
  name: string;
  bases: string[];
  body: Line[];
  /** `name = "Override"` class attribute, if any. */
  nameOverride?: string;
};

type FunctionDef = {
  line: Line;
  name: string;
  args: string;
  isAsync: boolean;
  decoratorLine: Line;
  nameOverride?: string;
};

function parseClasses(lines: Line[]): ClassDef[] {
  const out: ClassDef[] = [];
  const re = /^class\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/;
  for (let i = 0; i < lines.length; i += 1) {
    const m = re.exec(lines[i].code);
    if (!m) continue;
    const indent = lines[i].indent;
    const body: Line[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].code === '') {
        body.push(lines[j]);
        continue;
      }
      if (lines[j].indent <= indent) break;
      body.push(lines[j]);
    }
    const solid = body.filter((l) => l.code !== '');
    const nameOverride = solid
      .filter((l) => l.indent === indent + 4)
      .map((l) => /^name\s*=\s*["']([^"']+)["']$/.exec(l.code))
      .find(Boolean)?.[1];
    out.push({ line: lines[i], name: m[1], bases: baseNames(m[2]), body, nameOverride });
  }
  return out;
}

function parseEventFunctions(lines: Line[]): FunctionDef[] {
  const out: FunctionDef[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const dec = /^@event\b(.*)$/.exec(lines[i].code);
    if (!dec) continue;
    // The decorated def — skip blank lines, require it to follow immediately.
    let j = i + 1;
    while (j < lines.length && lines[j].code === '') j += 1;
    if (j >= lines.length) continue;
    const fn = /^(async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/.exec(lines[j].code);
    if (!fn) continue;
    const nameOverride = /name\s*=\s*["']([^"']+)["']/.exec(dec[1])?.[1];
    out.push({
      line: lines[j],
      name: fn[2],
      args: fn[3],
      isAsync: !!fn[1],
      decoratorLine: lines[i],
      nameOverride,
    });
    i = j;
  }
  return out;
}

/** First parameter name of a def-arg list, or null when it cannot be seen. */
function firstParam(args: string): string | null {
  const parts = splitTopLevel(args);
  if (parts.length === 0) return null;
  const first = parts[0].trim();
  if (!first) return null;
  // `self`, `self: T`, `*args` — the name is the first identifier.
  return /^[A-Za-z_]\w*/.exec(first)?.[0] ?? null;
}

export function lintDefinitionSource(
  source: string,
  opts: { eventName?: string } = {},
): PythonDiagnostic[] {
  const out: PythonDiagnostic[] = [];
  const lines = scan(source);
  const solid = lines.filter((l) => l.code !== '');

  for (const line of solid) {
    if (/^(from\s+pointy\b|import\s+pointy\b)/.test(line.code)) {
      out.push(
        diag(
          line,
          'error',
          'py-legacy-pointy-import',
          'This imports `pointy`, but the framework package is `volnux`.',
          'Events live in the volnux package: `from volnux import EventBase` (class-based) or `from volnux import event` (function-based).',
        ),
      );
    }
  }

  const bound = importNames(lines);
  const classes = parseClasses(lines);
  const functions = parseEventFunctions(lines);
  const eventClasses = classes.filter((c) => c.bases.some((b) => EVENT_BASES.has(b)));

  // An event base or @event with no volnux binding — the file cannot import.
  const needsVolnux = eventClasses.length > 0 || functions.length > 0;
  if (needsVolnux && bound.size === 0) {
    const anchor = (eventClasses[0]?.line ?? functions[0]?.decoratorLine) as Line;
    out.push(
      diag(
        anchor,
        'error',
        'py-missing-volnux-import',
        'No `volnux` import found, but this file defines an event.',
        'Import the contract you implement: `from volnux import EventBase` or `from volnux import event`.',
      ),
    );
  }

  if (eventClasses.length === 0 && functions.length === 0) {
    const anchor = solid[0];
    out.push(
      diag(
        anchor,
        'error',
        'py-no-event',
        'No event defined in this file.',
        'An event is either a class deriving from EventBase with a process() method, or a function decorated with @event().',
      ),
    );
    return out;
  }

  if (eventClasses.length + functions.length > 1) {
    const extra = (eventClasses[1]?.line ?? functions[1]?.decoratorLine) as Line;
    out.push(
      diag(
        extra,
        'warning',
        'py-multiple-events',
        `This file declares ${eventClasses.length + functions.length} events; the pipeline links it to one.`,
        'One definition file declares one event. Split the others into their own files.',
      ),
    );
  }

  for (const cls of eventClasses) {
    const methods = cls.body
      .filter((l) => l.code !== '')
      .map((line) => ({
        line,
        m: /^(async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/.exec(line.code),
      }))
      .filter((x): x is { line: Line; m: RegExpExecArray } => !!x.m);

    // --- process ------------------------------------------------------------
    const process = methods.find((x) => x.m[2] === 'process');
    if (!process) {
      out.push(
        diag(
          cls.line,
          'error',
          'py-missing-process',
          `${cls.name} derives from EventBase but does not define process().`,
          'EventBase declares process() abstract. Every event must answer "did I succeed, and what did I produce?" from its own process().',
        ),
      );
    } else {
      const anchor = process.line;
      if (firstParam(process.m[3]) !== 'self') {
        out.push(
          diag(
            anchor,
            'error',
            'py-process-needs-self',
            'process() must take `self` as its first parameter.',
            'The framework calls process on an EventBase instance; `self` is how previous_result, goto and the lifecycle hooks are reached.',
          ),
        );
      }
      if (!process.m[1]) {
        out.push(
          diag(
            anchor,
            'warning',
            'py-process-not-async',
            `${cls.name}.process is a plain def; class-based events define it as async def.`,
            'Class-based process() must be async def — it may await previous_result and the lifecycle hooks around it.',
          ),
        );
      }
      // The match stops at the args' closing paren; the annotation is after it.
      const ret = /->\s*(.+)$/.exec(process.line.code);
      if (ret && !/Tuple\s*\[\s*bool\b|tuple\s*\[\s*bool\b/i.test(ret[1])) {
        out.push(
          diag(
            anchor,
            'warning',
            'py-return-annotation',
            `process() is annotated \`-> ${ret[1].trim()}\`, not \`Tuple[bool, Any]\`.`,
            'process() must return (ok, result): a bool and serializable result data. The annotation Tuple[bool, Any] states that contract.',
          ),
        );
      }
    }

    // --- __init__ -----------------------------------------------------------
    const init = methods.find((x) => x.m[2] === '__init__');
    if (init) {
      out.push(
        diag(
          init.line,
          'error',
          'py-forbidden-init',
          `${cls.name} overrides __init__, which EventBase forbids.`,
          'EventBase raises ImproperlyConfigured on an __init__ override. Custom init arguments go in INIT_PARAMS_SCHEMA, or are handled inside process().',
        ),
      );
    }

    // --- class attributes ---------------------------------------------------
    const methodIndent = methods.length ? methods[0].line.indent : cls.line.indent + 4;
    for (const line of cls.body) {
      if (line.code === '' || line.indent !== methodIndent) continue;
      if (/^(async\s+)?def\s+/.test(line.code) || line.code.startsWith('@')) continue;
      const attr = /^([A-Za-z_]\w*)\s*(?::[^=]+)?=/.exec(line.code);
      if (!attr) continue;
      const key = attr[1];
      if (key.startsWith('_')) continue;

      if (key === 'retry_policy') {
        // The dict form RetryMixin converts: keys must match RetryPolicy.
        const block: string[] = [line.code];
        for (let i = cls.body.indexOf(line) + 1; i < cls.body.length; i += 1) {
          const next = cls.body[i];
          if (next.code === '') continue;
          if (next.indent <= line.indent) break;
          block.push(next.code);
        }
        const dict = block.join('\n');
        if (dict.includes('{')) {
          for (const keyLine of block) {
            for (const m of keyLine.matchAll(/["']?([A-Za-z_]\w*)["']?\s*:/g)) {
              const k = m[1];
              if (!RETRY_POLICY_KEYS.has(k)) {
                out.push(
                  diag(
                    line,
                    'error',
                    'py-retry-policy-key',
                    `retry_policy has no key \`${k}\`.`,
                    `RetryPolicy accepts exactly: ${[...RETRY_POLICY_KEYS].join(', ')}.`,
                  ),
                );
              }
            }
          }
        }
        continue;
      }

      if (CLASS_ATTRS.has(key)) continue;
      const hint = nearestAttr(key);
      out.push(
        diag(
          line,
          'warning',
          'py-unknown-attribute',
          hint
            ? `\`${key}\` is not an EventBase attribute — did you mean \`${hint}\`?`
            : `\`${key}\` is not an attribute EventBase recognises.`,
          `EventBase configuration is a fixed set: ${[...CLASS_ATTRS].join(', ')}. Anything else belongs in INIT_PARAMS_SCHEMA or inside process().`,
        ),
      );
    }
  }

  // --- function-based events -----------------------------------------------
  for (const fn of functions) {
    if (firstParam(fn.args) !== 'self') {
      out.push(
        diag(
          fn.line,
          'error',
          'py-process-needs-self',
          `@event function ${fn.name}() must take \`self\` as its first parameter.`,
          'The framework validates the decorated function at import: self is the first parameter, giving access to previous_result and the event context.',
        ),
      );
    }
    const ret = /->\s*(.+)$/.exec(fn.line.code);
    if (ret && !/Tuple\s*\[\s*bool\b|tuple\s*\[\s*bool\b/i.test(ret[1])) {
      out.push(
        diag(
          fn.line,
          'warning',
          'py-return-annotation',
          `${fn.name}() is annotated \`-> ${ret[1].trim()}\`, not \`Tuple[bool, Any]\`.`,
          'An event returns (ok, result). The annotation Tuple[bool, Any] states that contract.',
        ),
      );
    }
  }

  // --- goto descriptors ------------------------------------------------------
  for (const line of solid) {
    const call = /self\.goto\s*\((.*)\)\s*$/.exec(line.code);
    if (!call) continue;
    const args = splitTopLevel(call[1]);
    if (args.length < 3) {
      out.push(
        diag(
          line,
          'error',
          'py-goto-arity',
          `self.goto() needs (descriptor, ok, result) — ${args.length} argument${args.length === 1 ? '' : 's'} given.`,
          'goto switches the branch by descriptor: the int selects the path, ok and result are what the next event sees.',
        ),
      );
      continue;
    }
    const descriptor = args[0].trim();
    if (/^-?\d+$/.test(descriptor)) {
      const n = Number(descriptor);
      if (n < 0 || n > 9) {
        out.push(
          diag(
            line,
            'error',
            'py-goto-descriptor-range',
            `goto descriptor ${n} is out of range.`,
            'A descriptor selects one of the branch paths; goto accepts an integer 0-9 and raises outside it.',
          ),
        );
      }
    }
  }

  // --- identity vs the pipeline ----------------------------------------------
  if (opts.eventName) {
    for (const cls of eventClasses) {
      const identity = cls.nameOverride ?? cls.name;
      if (identity !== opts.eventName) {
        out.push(
          diag(
            cls.line,
            'error',
            'py-name-mismatch',
            `${cls.name} registers as \`${identity}\`, but the pipeline expects \`${opts.eventName}\`.`,
            `An event resolves by name and namespace. Rename the class to ${opts.eventName}, set name = "${opts.eventName}", or rename the event on the canvas.`,
          ),
        );
      }
    }
    for (const fn of functions) {
      const identity = fn.nameOverride ?? fn.name;
      if (identity !== opts.eventName) {
        out.push(
          diag(
            fn.decoratorLine,
            'error',
            'py-name-mismatch',
            `@event ${fn.name}() registers as \`${identity}\`, but the pipeline expects \`${opts.eventName}\`.`,
            `An event resolves by name and namespace. Rename the function to ${opts.eventName}, pass @event(name="${opts.eventName}"), or rename the event on the canvas.`,
          ),
        );
      }
    }
  }

  return out;
}

/**
 * Definition diagnostics for every event in the document that links one.
 *
 * Merged into the document's diagnostics so the problems list, the top-bar
 * gate and the inspector callouts all see Python problems as first-class
 * errors — a pipeline with a broken definition cannot publish, same as one
 * with a broken chain.
 */
export function lintDefinitions(doc: PointyDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const e of [...events(doc.chain), ...doc.staged]) {
    if (!e.definitionId) continue;
    const def = doc.definitions[e.definitionId];
    if (!def) continue; // a dangling link is the structural linter's finding
    for (const d of lintDefinitionSource(def.source, { eventName: e.name })) {
      out.push({
        code: d.code,
        severity: d.severity,
        message: d.message,
        rule: d.rule,
        target: { kind: 'event', eventId: e.id },
      });
    }
  }
  return out;
}
