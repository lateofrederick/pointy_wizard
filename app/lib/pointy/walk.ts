import type { Chain, EventRef } from '../../types/pointy';

/** Every event occurrence in the chain, in source order. */
export function events(chain: Chain | null): EventRef[] {
  if (!chain) return [];
  switch (chain.kind) {
    case 'event':
      return [chain.ref];
    case 'seq':
    case 'pipe':
      return [...events(chain.left), ...events(chain.right)];
    case 'parallel':
    case 'group':
      return chain.members.flatMap(events);
    case 'branch':
      return [chain.on, ...chain.paths.flatMap((p) => events(p.body))];
  }
}

/** Every sub-chain, parents before children. */
export function nodes(chain: Chain | null): Chain[] {
  if (!chain) return [];
  switch (chain.kind) {
    case 'event':
      return [chain];
    case 'seq':
    case 'pipe':
      return [chain, ...nodes(chain.left), ...nodes(chain.right)];
    case 'parallel':
    case 'group':
      return [chain, ...chain.members.flatMap(nodes)];
    case 'branch':
      return [chain, ...chain.paths.flatMap((p) => nodes(p.body))];
  }
}

/**
 * Occurrence ids that receive an incoming wire when something connects into
 * this chain. A group has several, because all of its members start together.
 */
export function entries(chain: Chain): string[] {
  switch (chain.kind) {
    case 'event':
      return [chain.ref.id];
    case 'seq':
    case 'pipe':
      return entries(chain.left);
    case 'parallel':
      return chain.members.length ? entries(chain.members[0]) : [];
    case 'group':
      return chain.members.flatMap(entries);
    case 'branch':
      return [chain.on.id];
  }
}

/** Occurrence ids that emit an outgoing wire out of this chain. */
export function exits(chain: Chain): string[] {
  switch (chain.kind) {
    case 'event':
      return [chain.ref.id];
    case 'seq':
    case 'pipe':
      return exits(chain.right);
    case 'parallel':
      return chain.members.length ? exits(chain.members[chain.members.length - 1]) : [];
    case 'group':
      return chain.members.flatMap(exits);
    case 'branch':
      return chain.paths.flatMap((p) => exits(p.body));
  }
}

export function findEvent(chain: Chain | null, id: string): EventRef | undefined {
  return events(chain).find((e) => e.id === id);
}

/**
 * Rebuild the chain, replacing any event occurrence the mapper returns a new
 * ref for. Structure is untouched — this is for editing an event in place.
 */
export function mapEvents(chain: Chain, fn: (ref: EventRef) => EventRef): Chain {
  switch (chain.kind) {
    case 'event':
      return { kind: 'event', ref: fn(chain.ref) };
    case 'seq':
    case 'pipe':
      return { ...chain, left: mapEvents(chain.left, fn), right: mapEvents(chain.right, fn) };
    case 'parallel':
      return { ...chain, members: chain.members.map((m) => mapEvents(m, fn)) };
    case 'group':
      return { ...chain, members: chain.members.map((m) => mapEvents(m, fn)) };
    case 'branch':
      return {
        ...chain,
        on: fn(chain.on),
        paths: chain.paths.map((p) => ({ ...p, body: mapEvents(p.body, fn) })),
      };
  }
}
