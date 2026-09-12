'use client';

import { useCallback, useMemo, useState } from 'react';
import type { EventRef, PointyDocument } from '../types/pointy';
import {
  chainToFlow,
  emit,
  findEvent,
  lint,
  setNodePosition,
  setWireOperator,
  updateEvent,
} from '../lib/pointy';

/**
 * The editor's state.
 *
 * The document is the single source of truth. Everything on screen — the graph,
 * the source in the output panel, the diagnostics, the inspector — is derived
 * from it, so they cannot drift apart. Gestures call an operation from
 * `lib/pointy/document.ts`, which returns a new document; nothing mutates.
 *
 * Replaces `usePipeline`, which stored reactflow nodes and edges directly and
 * therefore had nowhere to keep an operator.
 */
export function usePointyDocument(initial: PointyDocument) {
  const [doc, setDoc] = useState<PointyDocument>(initial);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const flow = useMemo(() => chainToFlow(doc), [doc]);
  const source = useMemo(() => emit(doc), [doc]);
  const diagnostics = useMemo(() => lint(doc), [doc]);

  const selectedEvent = useMemo<EventRef | null>(
    () => (selectedEventId ? findEvent(doc.chain, selectedEventId) ?? null : null),
    [doc.chain, selectedEventId],
  );

  /** Node drag. Writes layout and nothing else — the program is unchanged. */
  const moveNode = useCallback((eventId: string, position: { x: number; y: number }) => {
    setDoc((d) => setNodePosition(d, eventId, position));
  }, []);

  const patchEvent = useCallback(
    (eventId: string, patch: Partial<Omit<EventRef, 'id'>>) => {
      setDoc((d) => updateEvent(d, eventId, patch));
    },
    [],
  );

  const changeWireOperator = useCallback(
    (sourceId: string, targetId: string, operator: 'seq' | 'pipe') => {
      setDoc((d) => setWireOperator(d, sourceId, targetId, operator));
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
    selectedEventId,
    selectedEvent,
    selectEvent: setSelectedEventId,
    moveNode,
    patchEvent,
    changeWireOperator,
    setDefinitionSource,
  };
}

export type PointyDocumentStore = ReturnType<typeof usePointyDocument>;
