'use client';

import { useCallback, useMemo, useState } from 'react';
import type { EventRef, Expr, PointyDocument, RegistrySource } from '../types/pointy';
import type { StructuralResult } from '../lib/pointy';
import {
  chainToFlow,
  connect as connectOp,
  disconnect as disconnectOp,
  discardStaged,
  emit,
  findEvent,
  lint,
  newEventId,
  addBranchPath,
  attachDefinition,
  uniqueBlankEvent,
  convertToBranch,
  duplicateEvent,
  removeAttribute,
  removeEvent,
  removeSource,
  removeVariable,
  setAttribute,
  setNodePosition,
  setRetry,
  setSource,
  setVariable,
  setWireOperator,
  stageEvent,
  updateEvent,
  updateStaged,
  wrapInGroup,
  setParallel,
  isParallelJoin,
} from '../lib/pointy';
import { lintDefinitions } from '../lib/definition/lintDefinition';

/** A wire the user has selected, identified by the pair it joins. */
export interface WireSelection {
  id: string;
  source: string;
  target: string;
  operator: string;
}

/**
 * The editor's state.
 *
 * The document is the single source of truth. Everything on screen — the graph,
 * the source in the output panel, the diagnostics, the inspector — is derived
 * from it, so they cannot drift apart. Gestures call a pure operation from
 * `lib/pointy`, which returns a new document; nothing mutates.
 */
export function usePointyDocument(initial: PointyDocument) {
  const [doc, setDocState] = useState<PointyDocument>(initial);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedWire, setSelectedWire] = useState<WireSelection | null>(null);
  /** Transient message explaining what a gesture did, or why it was refused. */
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Undo/redo.
   *
   * Cheap because every operation already returns a whole new document and
   * never mutates: the history is just the documents we have been handed. Node
   * drags are excluded — `moveNode` writes through `setDocQuietly`, so undo
   * steps through changes to the program, not through every gesture.
   */
  const [past, setPast] = useState<PointyDocument[]>([]);
  const [future, setFuture] = useState<PointyDocument[]>([]);

  const setDoc = useCallback((update: PointyDocument | ((d: PointyDocument) => PointyDocument)) => {
    setDocState((d) => {
      const next = typeof update === 'function' ? update(d) : update;
      if (next === d) return d;
      setPast((p) => [...p.slice(-49), d]);
      setFuture([]);
      return next;
    });
  }, []);

  /** Changes that should not be an undo step of their own. */
  const setDocQuietly = useCallback(
    (update: (d: PointyDocument) => PointyDocument) => setDocState(update),
    [],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setDocState((d) => {
        setFuture((f) => [d, ...f]);
        return previous;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setDocState((d) => {
        setPast((p) => [...p, d]);
        return next;
      });
      return f.slice(1);
    });
  }, []);

  const flow = useMemo(() => chainToFlow(doc), [doc]);
  const source = useMemo(() => emit(doc), [doc]);
  // Structural Pointy problems and Python contract problems are one list —
  // the problems panel, the top-bar gate and the publish check all see both.
  const diagnostics = useMemo(() => [...lint(doc), ...lintDefinitions(doc)], [doc]);

  const selectedEvent = useMemo<EventRef | null>(() => {
    if (!selectedEventId) return null;
    return (
      findEvent(doc.chain, selectedEventId) ??
      doc.staged.find((s) => s.id === selectedEventId) ??
      null
    );
  }, [doc, selectedEventId]);

  const isStaged = useMemo(
    () => !!selectedEventId && doc.staged.some((s) => s.id === selectedEventId),
    [doc.staged, selectedEventId],
  );

  const selectEvent = useCallback((id: string | null) => {
    setSelectedEventId(id);
    if (id) setSelectedWire(null);
  }, []);

  const selectWire = useCallback((wire: WireSelection | null) => {
    setSelectedWire(wire);
    if (wire) setSelectedEventId(null);
  }, []);

  /**
   * Node drag. Writes layout and nothing else — the program is unchanged.
   * Quietly, so undo does not have to walk back through every nudge.
   */
  const moveNode = useCallback(
    (eventId: string, position: { x: number; y: number }) => {
      setDocQuietly((d) => setNodePosition(d, eventId, position));
    },
    [setDocQuietly],
  );

  const patchEvent = useCallback((eventId: string, patch: Partial<Omit<EventRef, 'id'>>) => {
    setDoc((d) =>
      d.staged.some((s) => s.id === eventId)
        ? updateStaged(d, eventId, patch)
        : updateEvent(d, eventId, patch),
    );
  }, [setDoc]);

  const changeWireOperator = useCallback(
    (sourceId: string, targetId: string, operator: 'seq' | 'pipe' | 'parallel') => {
      setDoc((d) => {
        // `||` is structure in both directions — making a pair parallel and
        // taking one out are chain rewrites; seq <-> pipe is a pure relabel.
        if (operator === 'parallel' || isParallelJoin(d, sourceId, targetId)) {
          const result = setParallel(d, sourceId, targetId, operator);
          setNotice(result.refused ?? null);
          if (result.refused) return d;
          return result.doc;
        }
        return setWireOperator(d, sourceId, targetId, operator);
      });
      setSelectedWire((w) => (w ? { ...w, operator } : w));
    },
    [setDoc],
  );

  /** Drop a tile on the canvas. It is not in the program until it is wired. */
  const stage = useCallback(
    (ref: Omit<EventRef, 'id'>, position: { x: number; y: number }) => {
      const id = newEventId();
      setDoc((d) => stageEvent(d, { ...ref, id }, position));
      setSelectedEventId(id);
      return id;
    },
    [setDoc],
  );

  const connect = useCallback(
    (sourceId: string, targetId: string, operator: 'seq' | 'pipe' = 'seq') => {
      setDoc((d) => {
        const result = connectOp(d, sourceId, targetId, operator);
        setNotice(
          result.outcome === 'rejected'
            ? (result.reason ?? 'That connection is not allowed.')
            : result.outcome === 'promoted-to-branch'
              ? 'Two paths now leave this event — 0 is success, 1 is failure.'
              : result.outcome === 'new-traversal'
                ? 'Added a second traversal. CFG mode allows an event to run more than once.'
                : null,
        );
        return result.doc;
      });
    },
    [setDoc],
  );

  const discard = useCallback((eventId: string) => {
    setDoc((d) => discardStaged(d, eventId));
    setSelectedEventId((cur) => (cur === eventId ? null : cur));
  }, [setDoc]);

  /**
   * Delete a connection — the inverse of `connect`. Whatever left the program
   * comes back staged on the canvas; a refusal (a `||` wire, a fan-out strand)
   * arrives as a notice instead of a half-cut chain, the same way the
   * context-menu operations report their rules.
   */
  const disconnectWire = useCallback(
    (sourceId: string, targetId: string) => {
      setDoc((d) => {
        const result = disconnectOp(d, sourceId, targetId);
        setNotice(result.refused ?? null);
        if (result.refused) return d;
        setSelectedWire(null);
        return result.doc;
      });
    },
    [setDoc],
  );

  const remove = useCallback((eventId: string) => {
    setDoc((d) => removeEvent(d, eventId));
    setSelectedEventId((cur) => (cur === eventId ? null : cur));
  }, [setDoc]);

  const upsertAttribute = useCallback((eventId: string, name: string, value: Expr) => {
    setDoc((d) => setAttribute(d, eventId, name, value));
  }, [setDoc]);

  const deleteAttribute = useCallback((eventId: string, name: string) => {
    setDoc((d) => removeAttribute(d, eventId, name));
  }, [setDoc]);

  const changeRetry = useCallback(
    (eventId: string, retry: number | 'default' | undefined) => {
      setDoc((d) => setRetry(d, eventId, retry));
    },
    [setDoc],
  );

  /**
   * The context-menu operations — screen 17.
   *
   * They share a shape: try the pure operation, and if it refuses, say why
   * instead of doing nothing. A menu item that silently no-ops is the single
   * most common way a canvas feels broken.
   */
  const applyStructural = useCallback(
    (run: (d: PointyDocument) => StructuralResult) => {
      setDoc((d) => {
        const result = run(d);
        setNotice(result.refused ?? null);
        if (result.refused) return d;
        if (result.focusId) setSelectedEventId(result.focusId);
        return result.doc;
      });
    },
    [setDoc],
  );

  const wrap = useCallback(
    (eventId: string) => applyStructural((d) => wrapInGroup(d, eventId)),
    [applyStructural],
  );

  const toBranch = useCallback(
    (eventId: string) => applyStructural((d) => convertToBranch(d, eventId)),
    [applyStructural],
  );

  const addBranch = useCallback(
    (branchEventId: string) => applyStructural((d) => addBranchPath(d, branchEventId)),
    [applyStructural],
  );

  const duplicate = useCallback(
    (eventId: string) => applyStructural((d) => duplicateEvent(d, eventId)),
    [applyStructural],
  );

  const addDefinition = useCallback(
    (eventId: string) => applyStructural((d) => attachDefinition(d, eventId)),
    [applyStructural],
  );

  /**
   * Drop a blank event on the canvas — the palette's footer button.
   *
   * There is no cursor to aim at, so it places itself: a free name, and a spot
   * stepped off every node already there. Pressing it twice used to put the
   * second event exactly on top of the first, which looked like nothing had
   * happened.
   */
  const addBlankEvent = useCallback(() => {
    let id = '';
    setDoc((d) => {
      const ref = uniqueBlankEvent(d);
      id = ref.id;
      // A grid, not a diagonal cascade: a card is 200×82, so a small offset
      // leaves the new event mostly hidden behind the last one.
      const n = Object.keys(d.layout).length;
      return stageEvent(d, ref, { x: 90 + (n % 3) * 250, y: 90 + Math.floor(n / 3) * 130 });
    });
    setSelectedEventId(id);
    return id;
  }, [setDoc]);

  /* Pipeline-level edits — screen 13. These change the file, not a node. */

  const upsertVariable = useCallback(
    (name: string, value: Expr, previousName?: string) => {
      setDoc((d) => setVariable(d, name, value, previousName));
    },
    [setDoc],
  );

  const deleteVariable = useCallback((name: string) => {
    setDoc((d) => removeVariable(d, name));
  }, [setDoc]);

  const upsertSource = useCallback((source: RegistrySource, previousPackage?: string) => {
    setDoc((d) => setSource(d, source, previousPackage));
  }, [setDoc]);

  const deleteSource = useCallback((packageName: string) => {
    setDoc((d) => removeSource(d, packageName));
  }, [setDoc]);

  const setMode = useCallback((mode: 'DAG' | 'CFG' | undefined) => {
    setDoc((d) => ({ ...d, directives: { ...d.directives, mode } }));
  }, [setDoc]);

  const setDefinitionSource = useCallback((definitionId: string, next: string) => {
    setDoc((d) => {
      const existing = d.definitions[definitionId];
      if (!existing) return d;
      return {
        ...d,
        definitions: { ...d.definitions, [definitionId]: { ...existing, source: next } },
      };
    });
  }, [setDoc]);

  return {
    doc,
    setDoc,
    flow,
    source,
    diagnostics,
    notice,
    dismissNotice: () => setNotice(null),
    selectedEventId,
    selectedEvent,
    isStaged,
    selectEvent,
    selectedWire,
    selectWire,
    moveNode,
    patchEvent,
    changeWireOperator,
    stage,
    connect,
    disconnectWire,
    discard,
    remove,
    upsertAttribute,
    deleteAttribute,
    changeRetry,
    wrap,
    toBranch,
    addBranch,
    duplicate,
    addDefinition,
    addBlankEvent,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    upsertVariable,
    deleteVariable,
    upsertSource,
    deleteSource,
    setMode,
    setDefinitionSource,
  };
}

export type PointyDocumentStore = ReturnType<typeof usePointyDocument>;
