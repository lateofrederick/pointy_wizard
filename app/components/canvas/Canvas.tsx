'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  useNodesState,
  useReactFlow,
  type Connection,
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
import { StagedNode, type StagedNodeData } from './StagedNode';
import { Wire, type WireData } from './Wire';
import { EmptyState } from './EmptyState';
import { NodeContextMenu, type MenuItem } from './NodeContextMenu';
import { emitExpr } from '../../lib/pointy/emit';
import type { NodeState } from './nodeShared';
import { DRAG_MIME, type PaletteDragPayload } from './dragPayload';

const nodeTypes = {
  event: EventNode,
  branch: BranchNode,
  group: GroupNode,
  staged: StagedNode,
};
const edgeTypes = { wire: Wire };

const GROUP_PAD = 18;
const GROUP_TOP_PAD = 30;
const NODE_W = 200;
const NODE_H = 82;

export function Canvas({ store }: { store: PointyDocumentStore }) {
  const {
    doc,
    flow,
    diagnostics,
    selectedEventId,
    selectedWire,
    selectEvent,
    selectWire,
    moveNode,
    patchEvent,
    stage,
    connect,
    discard,
    remove,
  } = store;

  const { screenToFlowPosition } = useReactFlow();
  const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);

  const errorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of diagnostics) {
      if (d.severity === 'error' && d.target.kind === 'event') ids.add(d.target.eventId);
    }
    return ids;
  }, [diagnostics]);

  const branchRows = useMemo(() => {
    const map = new Map<string, { descriptor: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; label?: string }[]>();
    for (const node of chainNodes(doc.chain)) {
      if (node.kind === 'branch') {
        map.set(node.on.id, node.paths.map((p) => ({ descriptor: p.descriptor, label: p.label })));
      }
    }
    return map;
  }, [doc.chain]);

  /** Which events sit inside a `||` pair — the rule screen 17 enforces. */
  const inParallel = useMemo(() => {
    const ids = new Set<string>();
    for (const node of chainNodes(doc.chain)) {
      if (node.kind !== 'parallel') continue;
      for (const m of chainNodes(node)) {
        if (m.kind === 'event') ids.add(m.ref.id);
      }
    }
    return ids;
  }, [doc.chain]);

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
    const eventNodes: Node[] = flow.nodes.map((n) => {
      if (n.staged) {
        return {
          id: n.id,
          type: 'staged',
          position: n.position,
          selected: n.id === selectedEventId,
          zIndex: 2,
          data: {
            ref: n.ref,
            onRename: (name: string) => patchEvent(n.id, { name }),
            onDiscard: () => discard(n.id),
          } satisfies StagedNodeData,
        };
      }

      const rows = branchRows.get(n.id);
      const state: NodeState = errorIds.has(n.id) ? 'error' : n.reused ? 'reused' : 'default';

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

    return [...groupNodes, ...eventNodes];
  }, [flow.nodes, branchRows, errorIds, selectedEventId, groupNodes, patchEvent, discard]);

  /**
   * reactflow needs local node state for a drag to feel live — the node has to
   * follow the cursor frame by frame. The document is only written on drag end,
   * so `layout` gets one entry per gesture rather than one per mouse move.
   */
  const [rfNodes, setRfNodes, onNodesChangeInternal] = useNodesState(derivedNodes);

  useEffect(() => {
    setRfNodes(derivedNodes);
  }, [derivedNodes, setRfNodes]);

  const rfEdges = useMemo<Edge<WireData>[]>(
    () =>
      flow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.operator === 'branch' ? `d${e.descriptor}` : undefined,
        type: 'wire',
        selected: selectedWire?.id === e.id,
        data: { operator: e.operator, descriptor: e.descriptor },
      })),
    [flow.edges, selectedWire],
  );

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

  /** A new connection is always sequential; the operator is changed after. */
  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) connect(c.source, c.target, 'seq');
    },
    [connect],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;

      const payload = JSON.parse(raw) as PaletteDragPayload;
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      stage(
        {
          name: payload.name,
          namespace: payload.namespace,
          version: payload.version,
          attributes: [],
          meta: payload.meta,
        },
        // Drop point is the cursor; offset so the card is centred under it.
        { x: point.x - NODE_W / 2, y: point.y - NODE_H / 2 },
      );
    },
    [screenToFlowPosition, stage],
  );

  const menuItems = useMemo<MenuItem[]>(() => {
    if (!menu) return [];
    const parallelMember = inParallel.has(menu.nodeId);
    return [
      { id: 'define', label: 'Add event definition', shortcut: '⌘E', glyph: '✎' },
      { id: 'branch', label: 'Convert to branch', glyph: '◆' },
      {
        id: 'group',
        label: 'Wrap in group',
        shortcut: '⌘G',
        glyph: '{ }',
        // The one rule the canvas enforces rather than reports.
        disabledReason: parallelMember
          ? 'This event runs in a || parallel pair. A { } group is an orchestrator and cannot be a process — the parser rejects it.'
          : undefined,
      },
      { id: 'retry', label: 'Add retry…', glyph: '↻' },
      { id: '__sep', label: '' },
      { id: 'duplicate', label: 'Duplicate', shortcut: '⌘D', glyph: '⧉' },
      {
        id: 'delete',
        label: 'Delete node',
        shortcut: '⌫',
        glyph: '✕',
        destructive: true,
        onSelect: () => remove(menu.nodeId),
      },
    ];
  }, [menu, inParallel, remove]);

  if (flow.nodes.length === 0) {
    return (
      <div
        className="h-full w-full"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={onDrop}
      >
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onEdgeClick={(_, edge) =>
          selectWire({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            operator: (edge.data as WireData)?.operator ?? 'seq',
          })
        }
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          const box = (e.currentTarget as HTMLElement)
            .closest('.react-flow')
            ?.getBoundingClientRect();
          setMenu({
            nodeId: node.id,
            x: e.clientX - (box?.left ?? 0),
            y: e.clientY - (box?.top ?? 0),
          });
          selectEvent(node.id);
        }}
        onPaneClick={() => {
          selectEvent(null);
          selectWire(null);
          setMenu(null);
        }}
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

      {menu && (
        <NodeContextMenu
          title={
            flow.nodes.find((n) => n.id === menu.nodeId)?.ref.name ?? 'Event'
          }
          items={menuItems}
          position={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
