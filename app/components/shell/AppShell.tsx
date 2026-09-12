'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { usePointyDocument } from '../../hooks/usePointyDocument';
import { api, ApiError } from '../../lib/api';
import type { PointyDocument } from '../../types/pointy';
import { Canvas } from '../canvas/Canvas';
import { Inspector } from './Inspector';
import { OutputPanel } from './OutputPanel';
import { Palette } from './Palette';
import { TopBar } from './TopBar';

/**
 * The editor shell — Figma screen 03's regions.
 *
 * Top bar across the width, then palette | (canvas over output panel) |
 * inspector. Every region reads from the same document, so the graph, the
 * emitted source and the diagnostics are always the same fact.
 *
 * With a `pipelineId` the shell also owns persistence. Without one it is a
 * local scratchpad — /sandbox — and Save is not offered.
 */
export function AppShell({
  initial,
  pipelineId,
  savedAt,
}: {
  initial: PointyDocument;
  pipelineId?: string;
  savedAt?: string;
}) {
  const store = usePointyDocument(initial);

  // Dirtiness is measured against what the server last accepted, not against a
  // flag we set on every gesture: a change that is then undone is not a change.
  const [saved, setSaved] = useState(() => snapshot(store.doc, store.source));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTime, setSavedTime] = useState(savedAt);

  const current = useMemo(
    () => snapshot(store.doc, store.source),
    [store.doc, store.source],
  );
  const dirty = current !== saved;

  const save = useCallback(async () => {
    if (!pipelineId || saving) return;
    setSaving(true);
    setSaveError(null);
    const attempted = current;
    try {
      const { updatedAt } = await api.savePipeline(pipelineId, {
        name: store.doc.name,
        source: store.source,
        layout: store.doc.layout,
        definitions: store.doc.definitions,
        sources: store.doc.sources,
      });
      // Mark the snapshot that was actually sent, not whatever the document
      // looks like now — the user may have kept editing during the request.
      setSaved(attempted);
      setSavedTime(updatedAt);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [pipelineId, saving, current, store.doc, store.source]);

  useEffect(() => {
    if (!pipelineId) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pipelineId, save]);

  // Leaving with unsaved work should cost a keystroke, not a shrug.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const exportFile = useCallback(() => {
    const blob = new Blob([store.source], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.doc.name}.pointy`;
    a.click();
    URL.revokeObjectURL(url);
  }, [store.source, store.doc.name]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg-base">
      <TopBar
        filename={store.doc.name}
        diagnostics={store.diagnostics}
        dirty={dirty}
        saving={saving}
        savedAt={savedTime}
        error={saveError}
        onSave={pipelineId ? save : undefined}
        onExport={exportFile}
      />

      <div className="flex min-h-0 flex-1">
        <Palette />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <ReactFlowProvider>
              <Canvas store={store} />
            </ReactFlowProvider>
          </div>

          <div className="h-[280px] shrink-0">
            <OutputPanel
              filename={store.doc.name}
              source={store.source}
              diagnostics={store.diagnostics}
            />
          </div>
        </main>

        <Inspector store={store} />
      </div>
    </div>
  );
}

/**
 * What is worth persisting, as one comparable string: the program itself plus
 * the editor state the language cannot express. Canvas position is included
 * because moving a node is a change the user expects to survive a reload.
 */
function snapshot(doc: PointyDocument, source: string): string {
  return JSON.stringify([source, doc.name, doc.layout, doc.definitions, doc.sources]);
}
