import type {
  Attr,
  Chain,
  Descriptor,
  EventRef,
  Expr,
  PointyDocument,
} from '../../types/pointy';
import { entries, events, exits, mapEvents } from './walk';

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
/**
 * Put an event on the canvas.
 *
 * THE FIRST EVENT BECOMES THE CHAIN. A single event is a valid Pointy program,
 * and staging it instead would be a dead end: `connect` can only extend from
 * something already in the chain, so an empty document with only staged events
 * could never become a program at all. Everything after the first is staged
 * until a wire reaches it.
 */
export function stageEvent(
  doc: PointyDocument,
  ref: EventRef,
  position: { x: number; y: number },
): PointyDocument {
  const layout = { ...doc.layout, [ref.id]: position };

  if (!doc.chain) return { ...doc, chain: { kind: 'event', ref }, layout };

  return { ...doc, staged: [...doc.staged, ref], layout };
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
  if (sourceId === targetId) {
    return { doc, outcome: 'rejected', reason: 'An event cannot connect to itself.' };
  }

  // An empty document with two staged events is seeded by the first wire drawn
  // between them. Without this the document can never acquire a chain.
  if (!doc.chain) {
    const from = doc.staged.find((s) => s.id === sourceId);
    const to = doc.staged.find((s) => s.id === targetId);
    if (!from || !to) {
      return { doc, outcome: 'rejected', reason: 'Put both events on the canvas first.' };
    }
    return {
      doc: {
        ...doc,
        chain: {
          kind: operator,
          left: { kind: 'event', ref: from },
          right: { kind: 'event', ref: to },
        },
        staged: doc.staged.filter((s) => s.id !== sourceId && s.id !== targetId),
      },
      outcome: 'spliced',
    };
  }

  const inChain = new Map(events(doc.chain).map((e) => [e.id, e]));
  if (!inChain.has(sourceId)) {
    return {
      doc,
      outcome: 'rejected',
      // Naming the direction matters: the gesture is reversible and people
      // routinely draw it the other way round.
      reason: inChain.has(targetId)
        ? 'Wires run from an event in the pipeline outwards. Drag from the connected event to this one.'
        : 'Connect one of these to the pipeline first — a wire has to start from something that already runs.',
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

/**
 * Delete a connection — the wire popover's "Delete connection".
 *
 * Wires are not stored anywhere: they are the shape of the chain tree
 * (`edgesOf` derives them), so removing one is a structural edit. The join the
 * wire came from goes away, and whatever left the program as a result comes
 * back as *staged* events on the canvas — the inverse of `connect`'s splice,
 * which pulls staged events in. Layout is kept, so the events do not jump, and
 * lint's `unconnected-event` warns they will not run, exactly as for any
 * staged node.
 *
 * Two kinds of wire cannot be cut alone, and are refused with the rule the way
 * other operations refuse rather than handed back a document that lies:
 *
 *   - a strand of a fan-out/fan-in join — a `{ }` group or `||` head on one
 *     side draws ONE wire per exit × entry from a single join node, so no
 *     individual strand exists to remove;
 *   - a `||` pair wire — it *is* the pair. Structural, not a relabelled
 *     connection (the same rule the Connection inspector states).
 *
 * A branch wire deletes its path and returns the path's events to staging. A
 * branch left on one path stays a branch: `single-path-branch` is the lint
 * warning `removeEvent` already produces for the same shape, so both ways of
 * removing a path land on one consistent model.
 */
export function disconnect(
  doc: PointyDocument,
  sourceId: string,
  targetId: string,
): StructuralResult {
  if (!doc.chain) return { doc, refused: 'Nothing to disconnect.' };

  const names = new Map(events(doc.chain).map((e) => [e.id, e.name]));
  if (!names.has(sourceId) || !names.has(targetId)) {
    return { doc, refused: 'That connection is not in the pipeline.' };
  }

  let cut = false;
  let freed: EventRef[] = [];
  let refused: string | undefined;

  const fanReason = (outs: number, ins: number) =>
    `This join draws ${outs * ins} wires at once (a fan of ${outs} × ${ins}), ` +
    `so one cannot be deleted on its own. Delete one of the events instead.`;

  /** Replace the node the wire lives in; leave everything else structurally alone. */
  const rewrite = (node: Chain): Chain => {
    switch (node.kind) {
      case 'seq':
      case 'pipe': {
        // `flow.ts` derives this join's wires as exits(left) × entries(right),
        // so the pair is a wire of THIS node iff it appears in that product.
        const outs = exits(node.left);
        const ins = entries(node.right);
        if (outs.includes(sourceId) && ins.includes(targetId)) {
          if (outs.length > 1 || ins.length > 1) {
            refused = fanReason(outs.length, ins.length);
            return node;
          }
          cut = true;
          freed = events(node.right);
          return node.left;
        }
        return { ...node, left: rewrite(node.left), right: rewrite(node.right) };
      }

      case 'branch': {
        const hit = node.paths.findIndex(
          (p) => node.on.id === sourceId && entries(p.body).includes(targetId),
        );
        if (hit !== -1) {
          const ins = entries(node.paths[hit].body);
          if (ins.length > 1) {
            refused = fanReason(1, ins.length);
            return node;
          }
          cut = true;
          freed = events(node.paths[hit].body);
          const paths = node.paths.filter((_, i) => i !== hit);
          // The last path going takes the branch with it — the same rule
          // `removeEvent` applies when every path has been pruned.
          if (paths.length === 0) return { kind: 'event', ref: node.on };
          return { ...node, paths };
        }
        return { ...node, paths: node.paths.map((p) => ({ ...p, body: rewrite(p.body) })) };
      }

      case 'parallel': {
        const between = node.members.some(
          (m, i) =>
            i > 0 &&
            exits(node.members[i - 1]).includes(sourceId) &&
            entries(m).includes(targetId),
        );
        if (between) {
          refused =
            'A || pair is structural — its wire is the pair, not a connection ' +
            'between two events. Delete one of the events instead.';
          return node;
        }
        return { ...node, members: node.members.map(rewrite) };
      }

      case 'group':
        return { ...node, members: node.members.map(rewrite) };

      case 'event':
        return node;
    }
  };

  const chain = rewrite(doc.chain);
  if (refused) return { doc, refused };
  // Both events are live but no join drew this wire — a stale selection.
  // Refusing beats reporting a delete that changed nothing.
  if (!cut) return { doc, refused: 'That connection is not in the pipeline.' };

  const remaining = new Set(events(chain).map((e) => e.id));
  return {
    doc: {
      ...doc,
      chain,
      staged: [...doc.staged, ...freed.filter((r) => !remaining.has(r.id))],
    },
  };
}

/**
 * Flip a connection between a || pair and a sequence — the wire popover's
 * Parallel row, in both directions.
 *
 * `||` is structure, not a relabel: making a pair parallel rewrites the seq or
 * pipe node that joins them into a parallel node, and taking a pair out of `||`
 * rewrites the two adjacent members back into a seq or pipe node (any further
 * members of the pair stay parallel with the combined unit). The join is found
 * the same way `flow.ts` draws it — exits × entries — so the wire the user
 * clicked identifies the join it came from, fans included.
 *
 * A complex member is safe: `emit` wraps a non-atomic parallel member in
 * parens and the parser reads `(...)` back, so emit → parse → emit holds.
 * A `{ }` group inside a `||` pair trips lint's `group-in-parallel` — the rule
 * is reported, not silently applied, same as a retry below the minimum.
 */
export function setParallel(
  doc: PointyDocument,
  sourceId: string,
  targetId: string,
  operator: 'parallel' | 'seq' | 'pipe',
): StructuralResult {
  if (!doc.chain) return { doc, refused: 'Nothing is connected yet.' };

  const joinsPair = (outs: string[], ins: string[]) =>
    outs.includes(sourceId) && ins.includes(targetId);

  let changed = false;

  const rewrite = (node: Chain): Chain => {
    if (changed) return node;

    switch (node.kind) {
      case 'seq':
      case 'pipe': {
        if (operator === 'parallel' && joinsPair(exits(node.left), entries(node.right))) {
          changed = true;
          return { kind: 'parallel', members: [node.left, node.right] };
        }
        return { ...node, left: rewrite(node.left), right: rewrite(node.right) };
      }

      case 'parallel': {
        if (operator !== 'parallel') {
          for (let i = 0; i < node.members.length - 1; i += 1) {
            if (joinsPair(exits(node.members[i]), entries(node.members[i + 1]))) {
              changed = true;
              const combined: Chain = {
                kind: operator,
                left: node.members[i],
                right: node.members[i + 1],
              };
              const members = [
                ...node.members.slice(0, i),
                combined,
                ...node.members.slice(i + 2),
              ];
              return members.length === 1 ? members[0] : { kind: 'parallel', members };
            }
          }
        }
        return { ...node, members: node.members.map(rewrite) };
      }

      case 'group':
        return { ...node, members: node.members.map(rewrite) };

      case 'branch':
        return { ...node, paths: node.paths.map((p) => ({ ...p, body: rewrite(p.body) })) };

      case 'event':
        return node;
    }
  };

  const chain = rewrite(doc.chain);
  if (!changed) {
    return {
      doc,
      refused:
        operator === 'parallel'
          ? 'Only a sequential or streaming connection can become a || pair.'
          : 'Only a || pair can become a sequence.',
    };
  }
  return { doc: { ...doc, chain } };
}

/** Is this pair joined by a || adjacency rather than a seq/pipe wire? */
export function isParallelJoin(
  doc: PointyDocument,
  sourceId: string,
  targetId: string,
): boolean {
  if (!doc.chain) return false;
  let found = false;

  const walkChain = (node: Chain): void => {
    if (found) return;
    switch (node.kind) {
      case 'parallel':
        for (let i = 0; i < node.members.length - 1; i += 1) {
          if (
            exits(node.members[i]).includes(sourceId) &&
            entries(node.members[i + 1]).includes(targetId)
          ) {
            found = true;
            return;
          }
        }
        node.members.forEach(walkChain);
        return;
      case 'seq':
      case 'pipe':
        walkChain(node.left);
        walkChain(node.right);
        return;
      case 'group':
        node.members.forEach(walkChain);
        return;
      case 'branch':
        node.paths.forEach((p) => walkChain(p.body));
        return;
      case 'event':
        return;
    }
  };

  walkChain(doc.chain);
  return found;
}

/* ------------------------------------------------- structural context menu */

/** A fresh local event, ready to be named in place. */
export function blankEvent(name = 'NewEvent'): EventRef {
  return { id: newEventId(), name, namespace: 'local', attributes: [] };
}

/**
 * A blank event whose name is not already taken in this document.
 *
 * Identity is name + namespace, so two events both called `NewEvent` are the
 * SAME event appearing twice — which under CFG is a legitimate thing to write
 * and emphatically not what someone pressing "New custom event" twice meant.
 */
export function uniqueBlankEvent(doc: PointyDocument, base = 'NewEvent'): EventRef {
  const taken = new Set([
    ...(doc.chain ? events(doc.chain) : []).map((e) => e.name),
    ...doc.staged.map((s) => s.name),
  ]);

  if (!taken.has(base)) return blankEvent(base);
  for (let n = 2; ; n += 1) {
    if (!taken.has(`${base}${n}`)) return blankEvent(`${base}${n}`);
  }
}

export interface StructuralResult {
  doc: PointyDocument;
  /** The event the caller should select and, for a new one, focus for renaming. */
  focusId?: string;
  /** Set when nothing was changed, and why. */
  refused?: string;
}

/**
 * `{ Event }` — wrap one event in a concurrency group.
 *
 * A group is an orchestrator, so it may not appear inside a `||` pair; that is
 * the one structural rule the canvas refuses outright rather than reporting,
 * and the caller checks it before offering the action. Checked again here,
 * because a model operation should not rely on its caller's manners.
 */
export function wrapInGroup(doc: PointyDocument, eventId: string): StructuralResult {
  if (!doc.chain) return { doc, refused: 'Nothing to wrap.' };

  if (isInsideParallel(doc.chain, eventId)) {
    return {
      doc,
      refused:
        'This event runs in a || parallel pair. A { } group is an orchestrator and cannot be a process — the parser rejects it.',
    };
  }

  if (isDirectGroupMember(doc.chain, eventId)) {
    return { doc, refused: 'Already in a group.' };
  }

  const chain = replaceEventLeaf(doc.chain, eventId, (ref) => ({
    kind: 'group',
    members: [{ kind: 'event', ref }],
    attributes: [],
  }));

  return { doc: { ...doc, chain }, focusId: eventId };
}

/**
 * Turn an event into a branch.
 *
 * Descriptors are integers assigned by position: whatever already followed the
 * event becomes 0 (success) and a new event becomes 1 (failure). An event with
 * no successor has nothing to put on 0, and a branch with one path is a lint
 * error, so that case is refused with the reason rather than producing an
 * invalid program.
 */
export function convertToBranch(doc: PointyDocument, eventId: string): StructuralResult {
  if (!doc.chain) return { doc, refused: 'Nothing to convert.' };

  if (isBranchOn(doc.chain, eventId)) {
    return { doc, refused: 'Already a branch. Use ＋ add branch for another path.' };
  }

  if (!hasSuccessor(doc.chain, eventId)) {
    return {
      doc,
      refused:
        'Connect this event to the next one first. A branch needs something on descriptor 0 — a single-path branch is not valid Pointy.',
    };
  }

  const failure = blankEvent('OnFailure');
  const chain = promoteToBranchChain(doc.chain, eventId, failure);

  return {
    doc: { ...doc, chain, layout: withOffsetFrom(doc.layout, eventId, failure.id, 0, 120) },
    focusId: failure.id,
  };
}

/**
 * Another path on an existing branch — the `＋ add branch` row.
 *
 * The next free descriptor, which is why a branch caps at ten paths: a
 * descriptor is a single digit, 0–9, by design.
 */
export function addBranchPath(doc: PointyDocument, branchEventId: string): StructuralResult {
  if (!doc.chain) return { doc, refused: 'Nothing to add to.' };

  let refused: string | undefined;
  let focusId: string | undefined;

  const rewrite = (node: Chain): Chain => {
    switch (node.kind) {
      case 'branch': {
        if (node.on.id !== branchEventId) {
          return { ...node, paths: node.paths.map((p) => ({ ...p, body: rewrite(p.body) })) };
        }

        const used = new Set(node.paths.map((p) => p.descriptor));
        const free = ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as Descriptor[]).find((d) => !used.has(d));
        if (free === undefined) {
          refused = 'A branch can carry ten paths — descriptors are the integers 0 to 9.';
          return node;
        }

        const ref = blankEvent(free === 1 ? 'OnFailure' : `OnDescriptor${free}`);
        focusId = ref.id;
        return {
          ...node,
          paths: [
            ...node.paths,
            {
              descriptor: free,
              label: free === 0 ? 'success' : free === 1 ? 'failure' : undefined,
              body: { kind: 'event', ref },
            },
          ],
        };
      }
      case 'seq':
      case 'pipe':
        return { ...node, left: rewrite(node.left), right: rewrite(node.right) };
      case 'parallel':
      case 'group':
        return { ...node, members: node.members.map(rewrite) };
      case 'event':
        return node;
    }
  };

  const chain = rewrite(doc.chain);
  if (refused || !focusId) return { doc, refused: refused ?? 'That is not a branch.' };

  return {
    doc: {
      ...doc,
      chain,
      layout: withOffsetFrom(doc.layout, branchEventId, focusId, 260, 120),
    },
    focusId,
  };
}

/**
 * A copy of an event, staged beside the original.
 *
 * Staged rather than spliced: where the copy belongs in the program is a
 * decision only the user can make, and they make it by drawing a wire.
 */
export function duplicateEvent(doc: PointyDocument, eventId: string): StructuralResult {
  const source =
    findEventRef(doc.chain, eventId) ?? doc.staged.find((s) => s.id === eventId);
  if (!source) return { doc, refused: 'No such event.' };

  // A fresh id and no definition link: two events sharing one definition file
  // would make editing either of them edit both.
  const copy: EventRef = { ...source, id: newEventId(), definitionId: undefined };

  return {
    doc: {
      ...doc,
      staged: [...doc.staged, copy],
      layout: withOffsetFrom(doc.layout, eventId, copy.id, 40, 40),
    },
    focusId: copy.id,
  };
}

/**
 * Attach a Python definition to a local event, creating the stub if needed.
 *
 * Only `local::` events have their Python here — anything from a registry is
 * resolved from the package, so its source lives with the package.
 */
export function attachDefinition(doc: PointyDocument, eventId: string): StructuralResult {
  const ref = findEventRef(doc.chain, eventId) ?? doc.staged.find((s) => s.id === eventId);
  if (!ref) return { doc, refused: 'No such event.' };

  if (ref.namespace !== 'local') {
    return {
      doc,
      refused: `${ref.namespace}::${ref.name} is resolved from the registry, so its Python lives with the package.`,
    };
  }

  if (ref.definitionId && doc.definitions[ref.definitionId]) {
    return { doc, focusId: eventId };
  }

  const filename = `${snake(ref.name)}.py`;
  return {
    doc: {
      ...patchRef(doc, eventId, (r) => ({ ...r, definitionId: filename })),
      definitions: {
        ...doc.definitions,
        [filename]: { filename, source: definitionStub(ref.name) },
      },
    },
    focusId: eventId,
  };
}

function definitionStub(name: string): string {
  return `from volnux import EventBase


class ${name}(EventBase):
    """Return (ok, result). The second value is the RESULT, not a descriptor.

    For anything beyond success and failure, call
    self.goto(descriptor, ok, result) with an integer 2-9.
    """

    def process(self, payload):
        return True, payload
`;
}

function snake(name: string): string {
  return (
    name
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .toLowerCase()
      .replace(/^_+|_+$/g, '') || 'event'
  );
}

function withOffsetFrom(
  layout: PointyDocument['layout'],
  fromId: string,
  toId: string,
  dx: number,
  dy: number,
): PointyDocument['layout'] {
  const anchor = layout[fromId];
  return {
    ...layout,
    [toId]: anchor ? { x: anchor.x + dx, y: anchor.y + dy } : { x: 160, y: 160 },
  };
}

function findEventRef(chain: Chain | null, id: string): EventRef | undefined {
  return chain ? events(chain).find((e) => e.id === id) : undefined;
}

function isBranchOn(chain: Chain, id: string): boolean {
  const walk = (node: Chain): boolean => {
    switch (node.kind) {
      case 'branch':
        return node.on.id === id || node.paths.some((p) => walk(p.body));
      case 'seq':
      case 'pipe':
        return walk(node.left) || walk(node.right);
      case 'parallel':
      case 'group':
        return node.members.some(walk);
      case 'event':
        return false;
    }
  };
  return walk(chain);
}

function isInsideParallel(chain: Chain, id: string): boolean {
  const walk = (node: Chain, within: boolean): boolean => {
    switch (node.kind) {
      case 'event':
        return within && node.ref.id === id;
      case 'seq':
      case 'pipe':
        return walk(node.left, within) || walk(node.right, within);
      case 'parallel':
        return node.members.some((m) => walk(m, true));
      case 'group':
        return node.members.some((m) => walk(m, within));
      case 'branch':
        return (within && node.on.id === id) || node.paths.some((p) => walk(p.body, within));
    }
  };
  return walk(chain, false);
}

function isDirectGroupMember(chain: Chain, id: string): boolean {
  const walk = (node: Chain): boolean => {
    switch (node.kind) {
      case 'group':
        return (
          node.members.some((m) => m.kind === 'event' && m.ref.id === id) ||
          node.members.some(walk)
        );
      case 'seq':
      case 'pipe':
        return walk(node.left) || walk(node.right);
      case 'parallel':
        return node.members.some(walk);
      case 'branch':
        return node.paths.some((p) => walk(p.body));
      case 'event':
        return false;
    }
  };
  return walk(chain);
}

/* --------------------------------------------------------------------- attrs */

export function makeAttr(name: string, value: Expr): Attr {
  return { name, value };
}
