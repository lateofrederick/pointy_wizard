'use client';

import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import type { PointyDocumentStore } from '../../hooks/usePointyDocument';
import { nodes as chainNodes } from '../../lib/pointy/walk';
import { EventNode, type EventNodeData } from './EventNode';
import { BranchNode, type BranchNodeData } from './BranchNode';
import { GroupNode, type GroupNodeData } from './GroupNode';
import { Wire, type WireData } from './Wire';
import { EmptyState } from './EmptyState';
import { emitExpr } from '../../lib/pointy/emit';
import type { NodeState } from './nodeShared';

const nodeTypes = { event: EventNode, branch: BranchNode, group: GroupNode };
const edgeTypes = { wire: Wire };

/** Padding around a group's members when its box is derived. */
const GROUP_PAD = 18;
const GROUP_TOP_PAD = 30;
const NODE_W = 200;
const NODE_H = 82;

export function Canvas({ store }: { store: PointyDocumentStore }) {
  const { doc, flow, diagnostics, selectedEventId, selectEvent, moveNode } = store;

  const errorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of diagnostics) {
      if (d.severity === 'error' && d.target.kind === 'event') ids.add(d.target.eventId);
    }
    return ids;
  }, [diagnostics]);

  /** Descriptor rows, keyed by the branch node they belong to. */
  const branchRows = useMemo(() => {
    const map = new Map<string, { descriptor: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; label?: string }[]>();
    for (const node of chainNodes(doc.chain)) {
      if (node.kind === 'branch') {
        map.set(node.on.id, node.paths.map((p) => ({ descriptor: p.descriptor, label: p.label })));
      }
    }
    return map;
  }, [doc.chain]);

  /**
   * Group boxes are derived from where their members ended up, not stored. A
   * group is structural; its rectangle is just a way of showing that.
   */
  const groupNodes = useMemo<Node<GroupNodeData>[]>(() => {
    const out: Node<GroupNodeData>[] = [];
    let i = 0;

    for (const node of chainNodes(doc.chain)) {
      if (node.kind !== 'group') continue;

      const memberIds = new Set<string>();
      for (const m of chainNodes(node)) {
        if (m.kind === 'event') memberIds.add(m.ref.id);
        if (m.kind === 'branch') memberIds.add(m.on.id);
      }

      const points = flow.nodes.filter((n) => memberIds.has(n.id)).map((n) => n.position);
      if (points.length === 0) continue;

      const minX = Math.min(...points.map((p) => p.x)) - GROUP_PAD;
      const minY = Math.min(...points.map((p) => p.y)) - GROUP_TOP_PAD;
      const maxX = Math.max(...points.map((p) => p.x + NODE_W)) + GROUP_PAD;
      const maxY = Math.max(...points.map((p) => p.y + NODE_H)) + GROUP_PAD;

      const attrs = node.attributes.length
        ? `[${node.attributes.map((a) => `${a.name}=${emitExpr(a.value)}`).join(', ')}]`
        : undefined;

      out.push({
        id: `group-${i++}`,
        type: 'group',
        position: { x: minX, y: minY },
        draggable: false,
        selectable: false,
        zIndex: 0,
        data: { label: '{ }', attributes: attrs, width: maxX - minX, height: maxY - minY },
      });
    }

    return out;
  }, [doc.chain, flow.nodes]);

  const derivedNodes = useMemo<Node[]>(() => {
    const eventNodes: Node<EventNodeData | BranchNodeData>[] = flow.nodes.map((n) => {
      const rows = branchRows.get(n.id);
      const state: NodeState = errorIds.has(n.id)
        ? 'error'
        : n.reused
          ? 'reused'
          : 'default';

      if (rows) {
        return {
          id: n.id,
          type: 'branch',
          position: n.position,
          selected: n.id === selectedEventId,
          zIndex: 1,
          data: { ref: n.ref, state, rows } satisfies BranchNodeData,
        };
      }

      return {
        id: n.id,
        type: 'event',
        position: n.position,
        selected: n.id === selectedEventId,
        zIndex: 1,
        data: {
          ref: n.ref,
          state,
          accent: n.ref.meta ? 'bg-keyword' : n.ref.namespace === 'hub' ? 'bg-seq' : 'bg-keyword',
        } satisfies EventNodeData,
      };
    });

    // Groups first so they paint behind the nodes they contain.
    return [...groupNodes, ...eventNodes];
  }, [flow.nodes, branchRows, errorIds, selectedEventId, groupNodes]);

  const rfEdges = useMemo<Edge<WireData>[]>(
    () =>
      flow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        // Branch wires leave the port belonging to their descriptor.
        sourceHandle: e.operator === 'branch' ? `d${e.descriptor}` : undefined,
        type: 'wire',
        data: { operator: e.operator, descriptor: e.descriptor },
      })),
    [flow.edges],
  );

  /**
   * reactflow needs local node state for a drag to feel live — the node has to
   * follow the cursor frame by frame. The document is only written on drag end,
   * so `layout` gets one entry per gesture rather than one per mouse move, and
   * undo has something sensible to step through.
   */
  const [rfNodes, setRfNodes, onNodesChangeInternal] = useNodesState(derivedNodes);

  useEffect(() => {
    setRfNodes(derivedNodes);
  }, [derivedNodes, setRfNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeInternal(changes);
      for (const c of changes) {
        if (c.type === 'position' && c.position && c.dragging === false) {
          moveNode(c.id, c.position);
        }
        if (c.type === 'select' && c.selected) selectEvent(c.id);
      }
    },
    [onNodesChangeInternal, moveNode, selectEvent],
  );

  if (flow.nodes.length === 0) return <EmptyState />;

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onPaneClick={() => selectEvent(null)}
      proOptions={{ hideAttribution: true }}
      minZoom={0.3}
      maxZoom={2}
      defaultViewport={{ x: 0, y: 0, zoom: 0.92 }}
      className="bg-bg-canvas"
    >
      {/* The dot grid reads off the theme token rather than a fixed grey, so it
          stays legible on both grounds. */}
      <Background
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1}
        color="var(--text-tertiary)"
      />
    </ReactFlow>
  );
}
