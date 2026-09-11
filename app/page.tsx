'use client';

import { ReactFlowProvider } from 'reactflow';
import PipelineEditor from './components/PipelineEditor';

/**
 * The editor still mounts the pre-migration components — phase 1 is tokens and
 * primitives only, so this screen keeps working while it is rebuilt in phase 3
 * against docs/ui-migration.md. It will look like the old editor because it is
 * the old editor; only the page chrome around it has gone.
 */
export default function Home() {
  return (
    <ReactFlowProvider>
      <main className="flex h-screen w-full flex-col overflow-hidden bg-bg-base">
        <PipelineEditor />
      </main>
    </ReactFlowProvider>
  );
}
