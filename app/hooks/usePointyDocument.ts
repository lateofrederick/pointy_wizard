'use client';

import { useCallback, useMemo, useState } from 'react';
import type { EventRef, Expr, PointyDocument } from '../types/pointy';
import {
  chainToFlow,
  connect as connectOp,
  discardStaged,
  emit,
  findEvent,
  lint,
  newEventId,
  removeAttribute,
  removeEvent,
  setAttribute,
  setNodePosition,
  setRetry,
  setWireOperator,
  stageEvent,
  updateEvent,
  updateStaged,
} from '../lib/pointy';

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
  const [doc, setDoc] = useState<PointyDocument>(initial);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedWire, setSelectedWire] = useState<WireSelection | null>(null);
  /** Transient message explaining what a gesture did, or why it was refused. */
  const [notice, setNotice] = useState<string | null>(null);

  const flow = useMemo(() => chainToFlow(doc), [doc]);
  const source = useMemo(() => emit(doc), [doc]);
  const diagnostics = useMemo(() => lint(doc), [doc]);

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

  /** Node drag. Writes layout and nothing else — the program is unchanged. */
  const moveNode = useCallback((eventId: string, position: { x: number; y: number }) => {
    setDoc((d) => setNodePosition(d, eventId, position));
  }, []);

  const patchEvent = useCallback((eventId: string, patch: Partial<Omit<EventRef, 'id'>>) => {
    setDoc((d) =>
      d.staged.some((s) => s.id === eventId)
        ? updateStaged(d, eventId, patch)
        : updateEvent(d, eventId, patch),
    );
  }, []);

  const changeWireOperator = useCallback(
    (sourceId: string, targetId: string, operator: 'seq' | 'pipe') => {
      setDoc((d) => setWireOperator(d, sourceId, targetId, operator));
      setSelectedWire((w) => (w ? { ...w, operator } : w));
    },
    [],
  );

  /** Drop a tile on the canvas. It is not in the program until it is wired. */
  const stage = useCallback(
    (ref: Omit<EventRef, 'id'>, position: { x: number; y: number }) => {
      const id = newEventId();
      setDoc((d) => stageEvent(d, { ...ref, id }, position));
      setSelectedEventId(id);
      return id;
    },
    [],
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
    [],
  );

  const discard = useCallback((eventId: string) => {
    setDoc((d) => discardStaged(d, eventId));
    setSelectedEventId((cur) => (cur === eventId ? null : cur));
  }, []);

  const remove = useCallback((eventId: string) => {
    setDoc((d) => removeEvent(d, eventId));
    setSelectedEventId((cur) => (cur === eventId ? null : cur));
  }, []);

  const upsertAttribute = useCallback((eventId: string, name: string, value: Expr) => {
    setDoc((d) => setAttribute(d, eventId, name, value));
  }, []);

  const deleteAttribute = useCallback((eventId: string, name: string) => {
    setDoc((d) => removeAttribute(d, eventId, name));
  }, []);

  const changeRetry = useCallback(
    (eventId: string, retry: number | 'default' | undefined) => {
      setDoc((d) => setRetry(d, eventId, retry));
    },
    [],
  );

  const setDefinitionSource = useCallback((definitionId: string, next: string) => {
    setDoc((d) => {
      const existing = d.definitions[definitionId];
      if (!existing) return d;
      return {
        ...d,
        definitions: { ...d.definitions, [definitionId]: { ...existing, source: next } },
      };
    });
  }, []);

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
    discard,
    remove,
    upsertAttribute,
    deleteAttribute,
    changeRetry,
    setDefinitionSource,
  };
}

export type PointyDocumentStore = ReturnType<typeof usePointyDocument>;
