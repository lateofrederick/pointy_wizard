'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  useNodesState,
  useReactFlow,
  useStore,
  type Connection,
  type ConnectionLineComponentProps,
  type Edge,
  type Node,
  type NodeChange,
  type OnConnectStartParams,
} from 'reactflow';
import 'reactflow/dist/style.css';

import type { PointyDocumentStore } from '../../hooks/usePointyDocument';
import type { WireOperator } from '../../lib/pointy';
import { hasSuccessor } from '../../lib/pointy/edit';
import { nodes as chainNodes } from '../../lib/pointy/walk';
import type { Point } from '../../lib/pointy/geometry';
import { EventNode, type EventNodeData } from './EventNode';
import { BranchNode, type BranchNodeData } from './BranchNode';
import { GroupNode, type GroupNodeData } from './GroupNode';
import { StagedNode, type StagedNodeData } from './StagedNode';
import { Wire, type WireData } from './Wire';
import { WirePopover } from './WirePopover';
import { EmptyState } from './EmptyState';
import { NodeContextMenu, type MenuItem } from './NodeContextMenu';
import { Notice } from './Notice';
import { ToolPill } from './ToolPill';
import { OperatorLegend } from './OperatorLegend';
import { viewport } from './viewportStore';
import { emitExpr } from '../../lib/pointy/emit';
import type { NodeState } from './nodeShared';
import { DRAG_MIME, type PaletteDragPayload } from './dragPayload';
import {
  PendingConnectionLine,
  branchPromotionHint,
  nextBranchDescriptor,
} from './PendingConnectionLine';

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
    wrap,
    toBranch,
    addBranch,
    duplicate,
    addDefinition,
    changeRetry,
    notice,
    dismissNotice,
    changeWireOperator,
    disconnectWire,
  } = store;

  const { screenToFlowPosition, zoomTo, fitView } = useReactFlow();
  const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);

  /**
   * The selected wire's midpoint in flow coordinates — the popover's anchor.
   * The Wire component reports it (it is the one place holding the exact
   * geometry reactflow computed) through a layout effect, so nothing here
   * guesses handle positions twice.
   */
  const [wireMid, setWireMid] = useState<Point | null>(null);
  const onWireMidpoint = useCallback((point: Point) => setWireMid(point), []);

  /** Display name for a wire endpoint — the popover's header. */
  const nodeName = (id: string) => flow.nodes.find((n) => n.id === id)?.ref.name ?? id;

  /**
   * The top bar's zoom control lives outside ReactFlowProvider, so the live
   * viewport is published to the module store and the store's commands come
   * back through these handles. One direction per concern: reactflow stays the
   * only thing that actually moves the camera.
   */
  const liveZoom = useStore((s) => s.transform[2]);

  useEffect(() => {
    viewport.publish(liveZoom);
  }, [liveZoom]);

  useEffect(
    () =>
      viewport.register({
        zoomTo: (z) => void zoomTo(z, { duration: 120 }),
        fit: () => void fitView({ padding: 0.2, duration: 250 }),
      }),
    [zoomTo, fitView],
  );

  /**
   * Open the node menu at a point on screen, converted to canvas-relative so it
   * sits where the click was. Declared here because the node data built below
   * closes over it — the ⋮ button on a card opens the same menu as right-click.
   */
  const openMenuFor = useCallback((nodeId: string, clientX: number, clientY: number) => {
    const box = document.querySelector('.react-flow')?.getBoundingClientRect();
    setMenu({ nodeId, x: clientX - (box?.left ?? 0), y: clientY - (box?.top ?? 0) });
  }, []);

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
          data: {
            ref: n.ref,
            state,
            rows,
            onAddBranch: () => addBranch(n.id),
            onMenu: (x, y) => openMenuFor(n.id, x, y),
          } satisfies BranchNodeData,
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
          onMenu: (x, y) => openMenuFor(n.id, x, y),
        } satisfies EventNodeData,
      };
    });

    return [...groupNodes, ...eventNodes];
  }, [
    flow.nodes,
    branchRows,
    errorIds,
    selectedEventId,
    groupNodes,
    patchEvent,
    discard,
    addBranch,
    openMenuFor,
  ]);

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
        data: { operator: e.operator, descriptor: e.descriptor, onMidpoint: onWireMidpoint },
      })),
    [flow.edges, selectedWire, onWireMidpoint],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeInternal(changes);
      for (const c of changes) {
        if (c.type === 'select' && c.selected) selectEvent(c.id);
      }
    },
    [onNodesChangeInternal, selectEvent],
  );

  /**
   * Commit the position when the drag ends.
   *
   * NOT from the `position` change stream: reactflow's final change carries
   * `dragging: false` but no `position`, so a guard on both never fired and
   * every drag was silently discarded on the next render. `onNodeDragStop`
   * hands over the node with its settled position, which is the fact we want.
   *
   * The third argument is every node in the drag, so a multi-selection moves
   * as one.
   */
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node, dragged: Node[]) => {
      for (const n of dragged?.length ? dragged : [node]) moveNode(n.id, n.position);
    },
    [moveNode],
  );

  /** A new connection is always sequential; the operator is changed after. */
  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) connect(c.source, c.target, 'seq');
    },
    [connect],
  );

  /**
   * Mid-drag branch promotion preview — screen 08 (node 25:2210).
   *
   * A second wire off an already-wired port PROMOTES the source on drop, so
   * the gesture has to say that before the drop happens. Decided once at
   * gesture start from the very facts `connect()` decides from —
   * `hasSuccessor` plus the next free descriptor — and cleared in
   * `onConnectEnd`, which reactflow fires on every release, whatever it lands
   * on. While the hint is set the stock connection line is swapped for the
   * dashed preview (wire + snap ring + pill).
   *
   * Only a drag that starts on a source (out) port can promise this: a wire
   * dragged backwards from a target port resolves its source on hover, which
   * connect() still judges correctly on drop.
   */
  const [pendingBranchHint, setPendingBranchHint] = useState<string | null>(null);

  const onConnectStart = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
      const sourceId = params.handleType === 'source' ? params.nodeId : null;
      const descriptor = sourceId
        ? nextBranchDescriptor(branchRows.get(sourceId), hasSuccessor(doc.chain, sourceId))
        : null;
      setPendingBranchHint(descriptor === null ? null : branchPromotionHint(descriptor));
    },
    [branchRows, doc.chain],
  );

  const onConnectEnd = useCallback(() => setPendingBranchHint(null), []);

  const renderPendingLine = useCallback(
    (props: ConnectionLineComponentProps) =>
      pendingBranchHint ? <PendingConnectionLine {...props} hint={pendingBranchHint} /> : null,
    [pendingBranchHint],
  );
  // undefined keeps reactflow's stock line; the component is identity-stable
  // for the length of a drag, so the preview does not remount mid-gesture.
  const connectionLineComponent = pendingBranchHint ? renderPendingLine : undefined;

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
    const id = menu.nodeId;
    const parallelMember = inParallel.has(id);
    const ref = flow.nodes.find((n) => n.id === id)?.ref;
    const close = <T,>(run: (nodeId: string) => T) => () => {
      run(id);
      setMenu(null);
    };

    return [
      {
        id: 'define',
        label: 'Add event definition',
        shortcut: '⌘E',
        glyph: '✎',
        disabledReason:
          ref && ref.namespace !== 'local'
            ? `${ref.namespace}:: events are resolved from the registry, so their Python lives with the package.`
            : undefined,
        onSelect: close(addDefinition),
      },
      {
        id: 'branch',
        label: 'Convert to branch',
        glyph: '◆',
        onSelect: close(toBranch),
      },
      {
        id: 'group',
        label: 'Wrap in group',
        shortcut: '⌘G',
        glyph: '{ }',
        // The one rule the canvas enforces rather than reports.
        disabledReason: parallelMember
          ? 'This event runs in a || parallel pair. A { } group is an orchestrator and cannot be a process — the parser rejects it.'
          : undefined,
        onSelect: close(wrap),
      },
      {
        id: 'retry',
        label: ref?.retry ? 'Retry set — adjust in the inspector' : 'Add retry (×2)',
        glyph: '↻',
        // 2 is the minimum a numeric retry may be; the stepper takes it further.
        disabledReason: ref?.retry ? 'This event already retries.' : undefined,
        onSelect: close((nodeId) => changeRetry(nodeId, 2)),
      },
      { id: '__sep', label: '' },
      {
        id: 'duplicate',
        label: 'Duplicate',
        shortcut: '⌘D',
        glyph: '⧉',
        onSelect: close(duplicate),
      },
      {
        id: 'delete',
        label: 'Delete node',
        shortcut: '⌫',
        glyph: '✕',
        destructive: true,
        onSelect: close(remove),
      },
    ];
  }, [menu, inParallel, flow.nodes, remove, wrap, toBranch, duplicate, addDefinition, changeRetry]);

  if (flow.nodes.length === 0) {
    return (
      <div
        className="relative h-full w-full"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={onDrop}
      >
        <EmptyState />
        <ToolPill />
        <OperatorLegend />
        <Notice message={notice} onDismiss={dismissNotice} />
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
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        connectionLineComponent={connectionLineComponent}
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
          openMenuFor(node.id, e.clientX, e.clientY);
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

      <ToolPill />
      <OperatorLegend />

      <Notice message={notice} onDismiss={dismissNotice} />

      {/* Screen 07: the wire operator popover, anchored to the selected wire's
          midpoint. Gated on the selection — pane click and Escape both clear
          it, which closes the popover with no separate open state to sync. */}
      {selectedWire && wireMid && (
        <WirePopover
          title={`${nodeName(selectedWire.source)} → ${nodeName(selectedWire.target)}`}
          operator={selectedWire.operator as WireOperator}
          anchor={wireMid}
          onSetOperator={(op) =>
            changeWireOperator(selectedWire.source, selectedWire.target, op)
          }
          onDelete={() => disconnectWire(selectedWire.source, selectedWire.target)}
          onClose={() => selectWire(null)}
        />
      )}

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
