'use client';

import { ReactFlowProvider } from 'reactflow';
import { usePointyDocument } from '../../hooks/usePointyDocument';
import { sampleDocument } from '../../lib/sampleDocument';
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
 */
export function AppShell() {
  const store = usePointyDocument(sampleDocument);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg-base">
      <TopBar filename={store.doc.name} diagnostics={store.diagnostics} dirty />

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
