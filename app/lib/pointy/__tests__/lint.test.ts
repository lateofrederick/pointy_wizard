import { describe, expect, it } from 'vitest';
import { lint, hasErrors, summarise } from '../lint';
import type { Chain, EventRef, PointyDocument } from '../../../types/pointy';
import { emptyDocument } from '../../../types/pointy';
import { screen03, screen16 } from './fixtures';

const ref = (id: string, name: string, extra: Partial<EventRef> = {}): EventRef => ({
  id,
  name,
  namespace: 'local',
  attributes: [],
  definitionId: `${id}.py`,
  ...extra,
});

const e = (r: EventRef): Chain => ({ kind: 'event', ref: r });

function doc(chain: Chain, patch: Partial<PointyDocument> = {}): PointyDocument {
  return { ...emptyDocument('t'), chain, ...patch };
}

const codes = (d: PointyDocument) => lint(d).map((x) => x.code);

describe('lint — the fixtures are clean', () => {
  it('screen 03 has only the expected advisories', () => {
    // RouteDecision is local with a definition; nothing should be an error.
    expect(hasErrors(lint(screen03))).toBe(false);
  });

  it('screen 16 reuses AnalystAgent, which CFG permits', () => {
    expect(codes(screen16)).not.toContain('dag-reuse');
  });
});

describe('lint — namespaces', () => {
  it('flags a non-local namespace with no registered source', () => {
    const d = doc(e(ref('a', 'NormalizeSchema', { namespace: 'pypi' })));
    const found = lint(d).find((x) => x.code === 'unresolved-namespace');
    expect(found?.severity).toBe('error');
    expect(found?.message).toContain('pypi::NormalizeSchema');
    expect(found?.rule).toBeTruthy();
    expect(found?.fix?.action).toBe('open-sources');
  });

  it('accepts it once the source is registered', () => {
    const d = doc(e(ref('a', 'NormalizeSchema', { namespace: 'pypi' })), {
      sources: [{ namespace: 'pypi', package: 'volnux-standard-events', version: '1.5.0' }],
    });
    expect(codes(d)).not.toContain('unresolved-namespace');
  });
});

describe('lint — @mode', () => {
  const reused: Chain = {
    kind: 'seq',
    left: e(ref('a', 'SlackNotify')),
    right: e(ref('b', 'SlackNotify')),
  };

  it('CFG allows the same event twice — that is how loops are expressed', () => {
    expect(codes(doc(reused, { directives: { mode: 'CFG' } }))).not.toContain('dag-reuse');
  });

  it('an unset mode behaves as CFG', () => {
    expect(codes(doc(reused))).not.toContain('dag-reuse');
  });

  it('DAG forbids reuse', () => {
    const found = lint(doc(reused, { directives: { mode: 'DAG' } })).filter(
      (x) => x.code === 'dag-reuse',
    );
    expect(found).toHaveLength(1); // once per event name, not per occurrence
    expect(found[0].fix?.action).toBe('set-mode-cfg');
  });

  it('warns about the deprecated @recursive-depth', () => {
    const d = doc(e(ref('a', 'A')), { directives: { recursiveDepth: 3 } });
    const found = lint(d).find((x) => x.code === 'deprecated-directive');
    expect(found?.severity).toBe('warning');
  });
});

describe('lint — structural rules the canvas enforces', () => {
  it('rejects a { } group inside a || pair', () => {
    const d = doc({
      kind: 'parallel',
      members: [
        e(ref('a', 'A')),
        { kind: 'group', members: [e(ref('b', 'B')), e(ref('c', 'C'))], attributes: [] },
      ],
    });
    const found = lint(d).find((x) => x.code === 'group-in-parallel');
    expect(found?.severity).toBe('error');
    expect(found?.rule).toContain('orchestrat');
  });

  it('allows a || pair inside a { } group — the legal direction', () => {
    const d = doc({
      kind: 'group',
      members: [{ kind: 'parallel', members: [e(ref('a', 'A')), e(ref('b', 'B'))] }],
      attributes: [],
    });
    expect(codes(d)).not.toContain('group-in-parallel');
  });

  it('rejects a meta event nested inside another', () => {
    const d = doc(
      e(
        ref('a', 'Check', {
          meta: { mode: 'MAP', template: 'FILTER<Check>', metaAttributes: [] },
        }),
      ),
    );
    expect(codes(d)).toContain('nested-meta-event');
  });

  it('accepts chained meta events', () => {
    const d = doc({
      kind: 'pipe',
      left: e(ref('a', 'Transform', { meta: { mode: 'MAP', template: 'Transform', metaAttributes: [] } })),
      right: e(ref('b', 'Check', { meta: { mode: 'FILTER', template: 'Check', metaAttributes: [] } })),
    });
    expect(codes(d)).not.toContain('nested-meta-event');
  });
});

describe('lint — branches', () => {
  const branch = (paths: { descriptor: 0 | 1 | 2; body: Chain }[]): Chain => ({
    kind: 'branch',
    on: ref('r', 'RouteDecision'),
    paths,
  });

  it('rejects two paths sharing a descriptor', () => {
    const d = doc(
      branch([
        { descriptor: 0, body: e(ref('a', 'A')) },
        { descriptor: 0, body: e(ref('b', 'B')) },
      ]),
    );
    expect(codes(d)).toContain('duplicate-descriptor');
  });

  it('warns on a single-path branch', () => {
    const d = doc(branch([{ descriptor: 0, body: e(ref('a', 'A')) }]));
    expect(codes(d)).toContain('single-path-branch');
  });

  it('accepts the normal 0/1 pair', () => {
    const d = doc(
      branch([
        { descriptor: 0, body: e(ref('a', 'A')) },
        { descriptor: 1, body: e(ref('b', 'B')) },
      ]),
    );
    expect(hasErrors(lint(d))).toBe(false);
  });
});

describe('lint — per-event rules', () => {
  it('rejects a retry below 2', () => {
    expect(codes(doc(e(ref('a', 'A', { retry: 1 }))))).toContain('retry-below-minimum');
  });

  it('accepts retry 2 and a bare default', () => {
    expect(codes(doc(e(ref('a', 'A', { retry: 2 }))))).not.toContain('retry-below-minimum');
    expect(codes(doc(e(ref('a', 'A', { retry: 'default' }))))).not.toContain('retry-below-minimum');
  });

  it('warns when a local event has no Python definition', () => {
    expect(codes(doc(e(ref('a', 'A', { definitionId: undefined }))))).toContain(
      'missing-definition',
    );
  });
});

describe('lint — variables', () => {
  it('flags a $ref with no declaration', () => {
    const d = doc(
      e(ref('a', 'A', { attributes: [{ name: 'timeout', value: { kind: 'ref', name: 'nope' } }] })),
    );
    expect(codes(d)).toContain('undefined-variable');
  });

  it('accepts a declared one', () => {
    const d = doc(
      e(ref('a', 'A', { attributes: [{ name: 'timeout', value: { kind: 'ref', name: 't' } }] })),
      { variables: [{ name: 't', value: { kind: 'literal', value: 30 } }] },
    );
    expect(codes(d)).not.toContain('undefined-variable');
  });

  it('sees refs nested inside a ?? chain', () => {
    const d = doc(
      e(
        ref('a', 'A', {
          attributes: [
            {
              name: 'timeout',
              value: {
                kind: 'coalesce',
                operands: [{ kind: 'env', name: 'T' }, { kind: 'ref', name: 'fallback' }],
              },
            },
          ],
        }),
      ),
    );
    expect(codes(d)).toContain('undefined-variable');
  });
});

describe('summarise', () => {
  it('reads VALID POINTY when there is nothing to say', () => {
    expect(summarise([])).toBe('VALID POINTY');
  });

  it('counts errors and warnings the way the top bar does', () => {
    const d = doc(e(ref('a', 'A', { namespace: 'pypi', definitionId: undefined })), {
      directives: { recursiveDepth: 2 },
    });
    expect(summarise(lint(d))).toBe('1 error, 1 warning');
  });
});
