import type { Chain, Descriptor, EventRef, PointyDocument } from '../../types/pointy';
import { entries, events, exits } from './walk';

/**
 * Derive the render model from the document.
 *
 * This is one-way: chain -> nodes+edges. Gestures mutate the document and the
 * view is re-derived. Nothing here is a store, and nothing downstream should
 * write back into these objects.
 *
 * Deliberately free of any reactflow import so the model layer stays testable
 * and the canvas library stays swappable. `flow.ts` shapes map onto reactflow's
 * `Node`/`Edge` at the component boundary in phase 3.
 */

/** The operator carried by a wire. This is the thing the old model had nowhere to put. */
export type WireOperator = 'seq' | 'pipe' | 'parallel' | 'branch' | 'group';

export interface FlowNode {
  id: string;
  ref: EventRef;
  position: { x: number; y: number };
  /** True when this occurrence is not the first of its event name (CFG reuse). */
  reused: boolean;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  operator: WireOperator;
  /** Set on branch wires only. */
  descriptor?: Descriptor;
  label?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const COLUMN = 310;
const ROW = 170;

/**
 * Fallback placement for occurrences the user has never positioned. Keeps new
 * nodes from stacking on the origin; the moment the user drags one, `layout`
 * takes over and this is never consulted for it again.
 */
function autoPosition(index: number): { x: number; y: number } {
  return { x: 70 + (index % 3) * COLUMN, y: 130 + Math.floor(index / 3) * ROW };
}

function wire(
  from: string[],
  to: string[],
  operator: WireOperator,
  extra?: { descriptor?: Descriptor; label?: string },
): FlowEdge[] {
  const out: FlowEdge[] = [];
  for (const source of from) {
    for (const target of to) {
      out.push({
        id: `${source}->${target}:${operator}${extra?.descriptor ?? ''}`,
        source,
        target,
        operator,
        ...extra,
      });
    }
  }
  return out;
}

function edgesOf(chain: Chain): FlowEdge[] {
  switch (chain.kind) {
    case 'event':
      return [];

    case 'seq':
    case 'pipe':
      return [
        ...edgesOf(chain.left),
        ...edgesOf(chain.right),
        ...wire(exits(chain.left), entries(chain.right), chain.kind === 'seq' ? 'seq' : 'pipe'),
      ];

    case 'parallel': {
      // `A || B` is drawn as a wire between the members: one strand in, two
      // lanes, one head. See docs/ui-migration.md §6.
      const out = chain.members.flatMap(edgesOf);
      for (let i = 0; i < chain.members.length - 1; i++) {
        out.push(...wire(exits(chain.members[i]), entries(chain.members[i + 1]), 'parallel'));
      }
      return out;
    }

    case 'group':
      // Members run concurrently, so the group itself contributes no internal
      // wires — whatever precedes it fans into every member's entries.
      return chain.members.flatMap(edgesOf);

    case 'branch':
      return chain.paths.flatMap((p) => [
        ...edgesOf(p.body),
        ...wire([chain.on.id], entries(p.body), 'branch', {
          descriptor: p.descriptor,
          label: p.label,
        }),
      ]);
  }
}

export function chainToFlow(doc: PointyDocument): FlowGraph {
  const refs = events(doc.chain);

  const seen = new Set<string>();
  const nodes: FlowNode[] = refs.map((ref, i) => {
    const key = `${ref.namespace}::${ref.name}`;
    const reused = seen.has(key);
    seen.add(key);
    return {
      id: ref.id,
      ref,
      position: doc.layout[ref.id] ?? autoPosition(i),
      reused,
    };
  });

  return { nodes, edges: doc.chain ? edgesOf(doc.chain) : [] };
}
