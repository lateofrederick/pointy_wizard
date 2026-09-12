import type {
  Attr,
  Chain,
  Descriptor,
  EventRef,
  Expr,
  PointyDocument,
} from '../../types/pointy';
import { events, mapEvents } from './walk';

/**
 * Chain surgery — the authoring operations.
 *
 * Phase 2 shipped the read side and the edits that leave structure alone. These
 * are the ones that restructure the program, and they are the reason the model
 * is a tree rather than an edge list: promoting a node to a branch is a local
 * rewrite here, and would be an ambiguous mess on a flat list of adjacencies.
 *
 * All pure. Every function returns a new document.
 */

let counter = 0;
export function newEventId(): string {
  counter += 1;
  return `e${Date.now().toString(36)}${counter.toString(36)}`;
}

/* ------------------------------------------------------------------ helpers */

/** Replace the event leaf with the given id by whatever `make` returns. */
function replaceEventLeaf(
  chain: Chain,
  id: string,
  make: (ref: EventRef) => Chain,
): Chain {
  switch (chain.kind) {
    case 'event':
      return chain.ref.id === id ? make(chain.ref) : chain;
    case 'seq':
    case 'pipe':
      return {
        ...chain,
        left: replaceEventLeaf(chain.left, id, make),
        right: replaceEventLeaf(chain.right, id, make),
      };
    case 'parallel':
    case 'group':
      return { ...chain, members: chain.members.map((m) => replaceEventLeaf(m, id, make)) };
    case 'branch':
      return {
        ...chain,
        paths: chain.paths.map((p) => ({ ...p, body: replaceEventLeaf(p.body, id, make) })),
      };
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
    case 'group':
      return chain.members.length ? lastEventId(chain.members[chain.members.length - 1]) : undefined;
    case 'branch':
      return chain.on.id;
  }
}

/**
 * Does anything already flow out of this event?
 *
 * A node has one flow-out port. Dragging a second wire from it is what promotes
 * it to a branch, so this is the test that decides between splice and promote.
 */
export function hasSuccessor(chain: Chain | null, id: string): boolean {
  if (!chain) return false;
  switch (chain.kind) {
    case 'event':
      return false;
    case 'seq':
    case 'pipe':
      return (
        lastEventId(chain.left) === id ||
        hasSuccessor(chain.left, id) ||
        hasSuccessor(chain.right, id)
      );
    case 'parallel':
    case 'group':
      return chain.members.some((m) => hasSuccessor(m, id));
    case 'branch':
      return chain.on.id === id || chain.paths.some((p) => hasSuccessor(p.body, id));
  }
}

/* -------------------------------------------------------------------- staging */

/** Drop an event on the canvas without connecting it (screen 06). */
export function stageEvent(
  doc: PointyDocument,
  ref: EventRef,
  position: { x: number; y: number },
): PointyDocument {
  return {
    ...doc,
    staged: [...doc.staged, ref],
    layout: { ...doc.layout, [ref.id]: position },
  };
}

export function updateStaged(
  doc: PointyDocument,
  id: string,
  patch: Partial<Omit<EventRef, 'id'>>,
): PointyDocument {
  return {
    ...doc,
    staged: doc.staged.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
}

export function discardStaged(doc: PointyDocument, id: string): PointyDocument {
  const layout = { ...doc.layout };
  delete layout[id];
  return { ...doc, staged: doc.staged.filter((s) => s.id !== id), layout };
}

/* ----------------------------------------------------------------- connecting */

export interface ConnectResult {
  doc: PointyDocument;
  /** What the gesture actually did, so the UI can explain itself. */
  outcome: 'spliced' | 'promoted-to-branch' | 'new-traversal' | 'rejected';
  reason?: string;
}

/**
 * Draw a wire from `sourceId` to `targetId`.
 *
 * A new connection is always sequential — that is settled; the operator is
 * changed afterwards, never chosen at draw time.
 *
 * Three things can happen:
 *   - the source has no successor yet          -> splice the target in after it
 *   - the source already flows somewhere       -> promote it to a branch
 *   - the target is already in the chain       -> a second traversal (CFG only)
 */
export function connect(
  doc: PointyDocument,
  sourceId: string,
  targetId: string,
  operator: 'seq' | 'pipe' = 'seq',
): ConnectResult {
  if (!doc.chain) return { doc, outcome: 'rejected', reason: 'The chain is empty.' };
  if (sourceId === targetId) {
    return { doc, outcome: 'rejected', reason: 'An event cannot connect to itself.' };
  }

  const inChain = new Map(events(doc.chain).map((e) => [e.id, e]));
  if (!inChain.has(sourceId)) {
    return {
      doc,
      outcome: 'rejected',
      reason: 'Connect the source into the pipeline first.',
    };
  }

  const stagedRef = doc.staged.find((s) => s.id === targetId);
  const existing = inChain.get(targetId);

  // Connecting to an event already in the chain means running it again. Under
  // CFG that is legitimate — it is how loops and agent handoffs are expressed —
  // and it needs a *new occurrence*, because each traversal is discrete.
  let targetRef: EventRef;
  let outcome: ConnectResult['outcome'];

  if (stagedRef) {
    targetRef = stagedRef;
    outcome = 'spliced';
  } else if (existing) {
    if ((doc.directives.mode ?? 'CFG') === 'DAG') {
      return {
        doc,
        outcome: 'rejected',
        reason: `@mode: "DAG" forbids running ${existing.name} twice. Switch to CFG to allow reuse.`,
      };
    }
    targetRef = { ...existing, id: newEventId() };
    outcome = 'new-traversal';
  } else {
    return { doc, outcome: 'rejected', reason: 'Unknown target.' };
  }

  const promoting = hasSuccessor(doc.chain, sourceId);
  const chain = promoting
    ? promoteToBranchChain(doc.chain, sourceId, targetRef)
    : replaceEventLeaf(doc.chain, sourceId, (ref) => ({
        kind: operator,
        left: { kind: 'event', ref },
        right: { kind: 'event', ref: targetRef },
      }));

  const next: PointyDocument = {
    ...doc,
    chain,
    staged: doc.staged.filter((s) => s.id !== targetId),
    // A new traversal is a new node and needs somewhere to sit.
    layout:
      outcome === 'new-traversal'
        ? { ...doc.layout, [targetRef.id]: offsetFrom(doc.layout[targetId]) }
        : doc.layout,
  };

  return { doc: next, outcome: promoting ? 'promoted-to-branch' : outcome };
}

function offsetFrom(p?: { x: number; y: number }) {
  return p ? { x: p.x + 40, y: p.y + 40 } : { x: 120, y: 120 };
}

/**
 * Turn the event into a branch carrying its existing successor on descriptor 0
 * and the new target on 1.
 *
 * 0 is success and 1 is failure by convention, assigned by position. They are
 * never free text — a descriptor is an integer the runtime returns.
 */
function promoteToBranchChain(chain: Chain, eventId: string, newTarget: EventRef): Chain {
  const rewrite = (node: Chain): Chain => {
    if (node.kind === 'seq' || node.kind === 'pipe') {
      if (lastEventId(node.left) === eventId) {
        // Swapping the leaf for the branch keeps whatever preceded it intact,
        // whatever shape the left side happens to be.
        return replaceEventLeaf(node.left, eventId, (ref) => ({
          kind: 'branch',
          on: ref,
          paths: [
            { descriptor: 0, label: 'success', body: node.right },
            { descriptor: 1, label: 'failure', body: { kind: 'event', ref: newTarget } },
          ],
        }));
      }
      return { ...node, left: rewrite(node.left), right: rewrite(node.right) };
    }
    if (node.kind === 'parallel' || node.kind === 'group') {
      return { ...node, members: node.members.map(rewrite) };
    }
    if (node.kind === 'branch') {
      // Already a branch: the new wire becomes the next free descriptor.
      if (node.on.id === eventId) {
        const used = new Set(node.paths.map((p) => p.descriptor));
        const free = ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as Descriptor[]).find((d) => !used.has(d));
        if (free === undefined) return node; // capped at ten; lint explains why
        return {
          ...node,
          paths: [
            ...node.paths,
            { descriptor: free, body: { kind: 'event', ref: newTarget } },
          ],
        };
      }
      return { ...node, paths: node.paths.map((p) => ({ ...p, body: rewrite(p.body) })) };
    }
    return node;
  };

  return rewrite(chain);
}

/* ------------------------------------------------------------------ branches */

export function setBranchLabel(
  doc: PointyDocument,
  branchId: string,
  descriptor: Descriptor,
  label: string,
): PointyDocument {
  if (!doc.chain) return doc;
  const rewrite = (node: Chain): Chain => {
    if (node.kind === 'branch') {
      const paths =
        node.on.id === branchId
          ? node.paths.map((p) => (p.descriptor === descriptor ? { ...p, label } : p))
          : node.paths;
      return { ...node, paths: paths.map((p) => ({ ...p, body: rewrite(p.body) })) };
    }
    if (node.kind === 'seq' || node.kind === 'pipe') {
      return { ...node, left: rewrite(node.left), right: rewrite(node.right) };
    }
    if (node.kind === 'parallel' || node.kind === 'group') {
      return { ...node, members: node.members.map(rewrite) };
    }
    return node;
  };
  return { ...doc, chain: rewrite(doc.chain) };
}

/* ---------------------------------------------------------------- attributes */

export function setAttribute(
  doc: PointyDocument,
  eventId: string,
  name: string,
  value: Expr,
): PointyDocument {
  return patchRef(doc, eventId, (ref) => {
    const attributes = ref.attributes.some((a) => a.name === name)
      ? ref.attributes.map((a) => (a.name === name ? { name, value } : a))
      : [...ref.attributes, { name, value }];
    return { ...ref, attributes };
  });
}

export function removeAttribute(
  doc: PointyDocument,
  eventId: string,
  name: string,
): PointyDocument {
  return patchRef(doc, eventId, (ref) => ({
    ...ref,
    attributes: ref.attributes.filter((a) => a.name !== name),
  }));
}

export function renameAttribute(
  doc: PointyDocument,
  eventId: string,
  from: string,
  to: string,
): PointyDocument {
  return patchRef(doc, eventId, (ref) => ({
    ...ref,
    attributes: ref.attributes.map((a) => (a.name === from ? { ...a, name: to } : a)),
  }));
}

/** Retry is off, or at least 2 — there is no such thing as retrying once. */
export function setRetry(
  doc: PointyDocument,
  eventId: string,
  retry: number | 'default' | undefined,
): PointyDocument {
  return patchRef(doc, eventId, (ref) => ({ ...ref, retry }));
}

/** Edit an event wherever it lives — in the chain or still staged. */
function patchRef(
  doc: PointyDocument,
  eventId: string,
  fn: (ref: EventRef) => EventRef,
): PointyDocument {
  const staged = doc.staged.map((s) => (s.id === eventId ? fn(s) : s));
  const chain = doc.chain
    ? mapEvents(doc.chain, (ref) => (ref.id === eventId ? fn(ref) : ref))
    : null;
  return { ...doc, chain, staged };
}

/* -------------------------------------------------------------------- delete */

/**
 * Remove an event. Its successor takes its place, so the chain stays connected.
 * A branch subject cannot be removed this way — that would orphan every path.
 */
export function removeEvent(doc: PointyDocument, eventId: string): PointyDocument {
  if (doc.staged.some((s) => s.id === eventId)) return discardStaged(doc, eventId);
  if (!doc.chain) return doc;

  const prune = (node: Chain): Chain | null => {
    switch (node.kind) {
      case 'event':
        return node.ref.id === eventId ? null : node;
      case 'seq':
      case 'pipe': {
        const left = prune(node.left);
        const right = prune(node.right);
        if (left && right) return { ...node, left, right };
        return left ?? right;
      }
      case 'parallel':
      case 'group': {
        const members = node.members.map(prune).filter((m): m is Chain => m !== null);
        if (members.length === 0) return null;
        if (members.length === 1 && node.kind === 'parallel') return members[0];
        return { ...node, members };
      }
      case 'branch': {
        if (node.on.id === eventId) return node; // refuse: paths would be orphaned
        const paths = node.paths
          .map((p) => ({ ...p, body: prune(p.body) }))
          .filter((p): p is typeof p & { body: Chain } => p.body !== null);
        if (paths.length === 0) return { kind: 'event', ref: node.on };
        return { ...node, paths };
      }
    }
  };

  const chain = prune(doc.chain);
  const layout = { ...doc.layout };
  delete layout[eventId];
  return { ...doc, chain, layout };
}

/* --------------------------------------------------------------------- attrs */

export function makeAttr(name: string, value: Expr): Attr {
  return { name, value };
}
