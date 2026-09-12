import type {
  Chain,
  EventRef,
  Expr,
  PointyDocument,
  RegistrySource,
} from '../../types/pointy';
import { mapEvents } from './walk';

/**
 * Document operations.
 *
 * All of these are pure: they return a new document and never mutate the one
 * passed in, so the caller can hold history for undo without extra work.
 *
 * Phase 2 ships what phase 3 needs — render, drag, select, inspect, and change
 * an operator. The richer authoring operations (splice a node into a chain,
 * promote to branch, wrap in a group) belong to phase 4, where the gestures
 * that drive them are designed.
 */

/**
 * Node drag. Writes `layout` and nothing else.
 *
 * This is the one function most likely to be "improved" into something that
 * also reorders the chain. It must not. Position is presentation; the chain is
 * the program. See docs/ui-migration.md §4.
 */
export function setNodePosition(
  doc: PointyDocument,
  eventId: string,
  position: { x: number; y: number },
): PointyDocument {
  return { ...doc, layout: { ...doc.layout, [eventId]: position } };
}

/** Edit one event occurrence in place. Structure is untouched. */
export function updateEvent(
  doc: PointyDocument,
  eventId: string,
  patch: Partial<Omit<EventRef, 'id'>>,
): PointyDocument {
  if (!doc.chain) return doc;
  return {
    ...doc,
    chain: mapEvents(doc.chain, (ref) => (ref.id === eventId ? { ...ref, ...patch } : ref)),
  };
}

/**
 * Change a wire's operator between sequential and streaming.
 *
 * Identified by the pair it joins, because that is what the user clicked. `||`
 * and branch wires are not reachable this way — turning a pair parallel or
 * promoting to a branch restructures the chain and is phase 4.
 */
export function setWireOperator(
  doc: PointyDocument,
  sourceId: string,
  targetId: string,
  operator: 'seq' | 'pipe',
): PointyDocument {
  if (!doc.chain) return doc;

  const rewrite = (chain: Chain): Chain => {
    if (chain.kind === 'seq' || chain.kind === 'pipe') {
      const joinsThisPair =
        lastEventId(chain.left) === sourceId && firstEventId(chain.right) === targetId;
      const next: Chain = {
        kind: joinsThisPair ? operator : chain.kind,
        left: rewrite(chain.left),
        right: rewrite(chain.right),
      };
      return next;
    }
    if (chain.kind === 'parallel') return { ...chain, members: chain.members.map(rewrite) };
    if (chain.kind === 'group') return { ...chain, members: chain.members.map(rewrite) };
    if (chain.kind === 'branch') {
      return { ...chain, paths: chain.paths.map((p) => ({ ...p, body: rewrite(p.body) })) };
    }
    return chain;
  };

  return { ...doc, chain: rewrite(doc.chain) };
}

function firstEventId(chain: Chain): string | undefined {
  switch (chain.kind) {
    case 'event':
      return chain.ref.id;
    case 'seq':
    case 'pipe':
      return firstEventId(chain.left);
    case 'parallel':
    case 'group':
      return chain.members[0] ? firstEventId(chain.members[0]) : undefined;
    case 'branch':
      return chain.on.id;
  }
}

function lastEventId(chain: Chain): string | undefined {
  switch (chain.kind) {
    case 'event':
      return chain.ref.id;
    case 'seq':
    case 'pipe':
      return lastEventId(chain.right);
    case 'parallel':
    case 'group': {
      const last = chain.members[chain.members.length - 1];
      return last ? lastEventId(last) : undefined;
    }
    case 'branch': {
      const last = chain.paths[chain.paths.length - 1];
      return last ? lastEventId(last.body) : undefined;
    }
  }
}

/** Append an event to the end of the chain with the given operator. */
export function appendEvent(
  doc: PointyDocument,
  ref: EventRef,
  operator: 'seq' | 'pipe' = 'seq',
): PointyDocument {
  const leaf: Chain = { kind: 'event', ref };
  return {
    ...doc,
    chain: doc.chain ? { kind: operator, left: doc.chain, right: leaf } : leaf,
  };
}

export function setDirective<K extends keyof PointyDocument['directives']>(
  doc: PointyDocument,
  key: K,
  value: PointyDocument['directives'][K],
): PointyDocument {
  return { ...doc, directives: { ...doc.directives, [key]: value } };
}

/* --- variables --------------------------------------------------------------
 *
 * `@name = expr`, emitted above the chain. A variable is referenced from an
 * attribute as `$name`, so renaming one does NOT rewrite the references: the
 * lint's `undefined-variable` is what tells the user the reference is now
 * dangling, and it names the variable that went missing. Silently rewriting
 * the program from a rename in a side panel would be a worse surprise.
 */

/** Add or replace by name. Order is preserved; a new variable goes last. */
export function setVariable(
  doc: PointyDocument,
  name: string,
  value: Expr,
  previousName?: string,
): PointyDocument {
  const key = previousName ?? name;
  const index = doc.variables.findIndex((v) => v.name === key);

  if (index === -1) return { ...doc, variables: [...doc.variables, { name, value }] };

  const variables = [...doc.variables];
  variables[index] = { name, value };
  return { ...doc, variables };
}

export function removeVariable(doc: PointyDocument, name: string): PointyDocument {
  return { ...doc, variables: doc.variables.filter((v) => v.name !== name) };
}

/* --- registry sources -------------------------------------------------------
 *
 * A source registers a namespace, which is what makes `hub::Foo` resolvable.
 * Identity is the package, not the namespace: the same namespace can be
 * registered more than once with different packages.
 */

export function setSource(
  doc: PointyDocument,
  source: RegistrySource,
  previousPackage?: string,
): PointyDocument {
  const key = previousPackage ?? source.package;
  const index = doc.sources.findIndex((s) => s.package === key);

  if (index === -1) return { ...doc, sources: [...doc.sources, source] };

  const sources = [...doc.sources];
  sources[index] = source;
  return { ...doc, sources };
}

export function removeSource(doc: PointyDocument, packageName: string): PointyDocument {
  return { ...doc, sources: doc.sources.filter((s) => s.package !== packageName) };
}

/** Drop layout entries for occurrences that no longer exist. */
export function pruneLayout(doc: PointyDocument, liveIds: Set<string>): PointyDocument {
  const layout: PointyDocument['layout'] = {};
  for (const [id, pos] of Object.entries(doc.layout)) {
    if (liveIds.has(id)) layout[id] = pos;
  }
  return { ...doc, layout };
}
