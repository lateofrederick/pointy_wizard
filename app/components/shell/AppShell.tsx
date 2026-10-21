'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { usePointyDocument } from '../../hooks/usePointyDocument';
import { api, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { signInHref } from '../../lib/routes';
import { emit, tryParse } from '../../lib/pointy';
import {
  applyDefinitionSnapshot,
  deleteDefinitionCache,
  draftScope,
  pipelineScope,
  readDefinitionCache,
  snapshotDefinitions,
  writeDefinitionCache,
} from '../../lib/definitionCache';
import { INITIAL_RUN_STATE, runReducer } from '../../lib/runView';
import type { PointyDocument } from '../../types/pointy';
import { Canvas } from '../canvas/Canvas';
import { ResizeHandle } from '../ui';
import { Inspector } from './Inspector';
import { OutputPanel } from './OutputPanel';
import { Palette, PaletteRail } from './Palette';
import { PublishModal } from './PublishModal';
import { TopBar } from './TopBar';

/**
 * The editor shell — Figma screen 03's regions.
 *
 * Top bar across the width, then palette | (canvas over output panel) |
 * inspector. Every region reads from the same document, so the graph, the
 * emitted source and the diagnostics are always the same fact.
 *
 * THE EDITOR WORKS SIGNED OUT. That is the point of it being the landing page:
 * you draw a pipeline first and are asked who you are only when the answer
 * starts to matter. Save has three shapes accordingly:
 *
 *   pipelineId           → PUT, the pipeline already exists
 *   no id, signed in     → POST, then move to its own URL
 *   no id, signed out    → sign in first, coming back here
 *
 * In the last case the work must survive the round trip, which is what the
 * draft in localStorage is for.
 */

const DRAFT_KEY = 'pw-draft';

/** The inspector's width, in px — default, drag floor, and drag ceiling. */
const INSPECTOR_W = { default: 340, min: 280, max: 640 };

export function AppShell({
  initial,
  pipelineId,
  savedAt,
  keepDraft = true,
}: {
  initial: PointyDocument;
  pipelineId?: string;
  savedAt?: string;
  /**
   * Whether an unsaved document is mirrored to localStorage. Off for /sandbox,
   * which opens a fixed document and must not overwrite the real draft.
   */
  keepDraft?: boolean;
}) {
  const store = usePointyDocument(initial);
  const router = useRouter();
  const user = useSession();

  /** An unsaved pipeline keeps itself in the browser; a saved one does not. */
  const isDraft = !pipelineId && keepDraft;

  // Dirtiness is measured against what the server last accepted, not against a
  // flag we set on every gesture: a change that is then undone is not a change.
  const [saved, setSaved] = useState(() => snapshot(store.doc, store.source));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTime, setSavedTime] = useState(savedAt);

  // Screen 11's Publish modal is an inert shell — there is no registry service
  // behind it, so it is open/closed state only and never holds publish data.
  const [publishOpen, setPublishOpen] = useState(false);

  /**
   * Shell layout: the registry palette can be tucked away to give the canvas
   * the width, and the inspector's divider drags — the event details column is
   * read more than the palette is, so it gets the wider room on demand. Both
   * are plain state: they survive tab and selection switches (they live above
   * all of that) and reset with the page, which is the honest scope for a
   * window layout preference.
   */
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_W.default);

  // Screen 12's RUN OUTPUT is a view of the output panel, not a place the app
  // goes: there is no runner service (todo.txt, "WHY 11 AND 12 ARE NOT BUILT"),
  // so Run opens the view and the view states that rather than inventing a run.
  // The transitions, and the copy for a press that could not do what it said,
  // live in lib/runView.ts.
  const [run, dispatchRun] = useReducer(runReducer, INITIAL_RUN_STATE);

  // The output panel's slot height: open it fills 280px (the panel is h-full,
  // so the PROBLEMS column coming and going never changes the panel's height),
  // collapsed it is just the 42px header — the space goes back to the canvas
  // rather than a dark strip under a fixed wrapper.
  const [outputOpen, setOutputOpen] = useState(true);

  const current = useMemo(
    () => snapshot(store.doc, store.source),
    [store.doc, store.source],
  );
  const dirty = current !== saved;

  /* --- the draft ---------------------------------------------------------- */

  const { setDoc } = store;
  const restored = useRef(false);

  // Restore once, after mount: localStorage does not exist on the server, and
  // reading it during render would make the two disagree.
  useEffect(() => {
    if (!isDraft || restored.current) return;
    restored.current = true;

    const draft = readDraft();
    if (!draft) return;
    setDoc(draft);
    // The restored draft is unsaved by definition, so `saved` stays as it was
    // and the top bar keeps saying so.
  }, [isDraft, setDoc]);

  // Keep the draft current. Debounced, because this runs on every keystroke in
  // the inspector and every pixel of a node drag.
  useEffect(() => {
    if (!isDraft || !restored.current) return;
    const id = window.setTimeout(() => writeDraft(store.doc), 400);
    return () => window.clearTimeout(id);
  }, [isDraft, store.doc, current]);

  /* --- definition cache --------------------------------------------------- */

  // Event definitions cannot survive a reload any other way: `.pointy` source
  // has no syntax for the event→file link, and the server round-trips the
  // definitions map but not the links, so the link is restored from the
  // browser. See lib/definitionCache.ts for why this exists, how workspaces
  // stay apart, and what deletes it.
  const defScope = pipelineId ? pipelineScope(pipelineId) : draftScope;
  // Writes stay off until the store has been consulted: writing before that
  // would clobber a cached snapshot with the just-loaded, link-less document.
  const [defsReady, setDefsReady] = useState(false);

  // Async (IndexedDB): the read settles in a later task, so the snapshot
  // merges into whatever the document is by then — a functional update, which
  // preserves any edit made in the gap. A scope change cancels the in-flight
  // read so a slow pipeline:A read cannot land on pipeline:B's document.
  useEffect(() => {
    if (!keepDraft) return;
    let cancelled = false;
    void readDefinitionCache(defScope).then((snap) => {
      if (cancelled) return;
      if (snap) setDoc((d) => applyDefinitionSnapshot(d, snap));
      setDefsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [keepDraft, defScope, setDoc]);

  // Rewrite as the document changes. Debounced like the draft; the cleanup
  // writes rather than only clearing, so an unmount mid-window — sign-in
  // redirect, save-and-navigate — lands the last write instead of dropping
  // it. The write is async, but the page is still alive after a React
  // unmount, so the transaction completes.
  useEffect(() => {
    if (!keepDraft || !defsReady) return;
    const write = () => {
      void writeDefinitionCache(defScope, snapshotDefinitions(store.doc));
    };
    const id = window.setTimeout(write, 400);
    return () => {
      window.clearTimeout(id);
      write();
    };
  }, [keepDraft, defsReady, defScope, store.doc]);

  // Leaving the page entirely. React's cleanups do not run on a real refresh
  // or tab close, and an IndexedDB write started while the page dies may be
  // killed before it commits — unlike the synchronous localStorage flush this
  // replaced. pagehide is the unload hook that still fires reliably;
  // visibilitychange→hidden is the one that still has a live event loop, and
  // covers tab switches and mobile app-switches where the page survives.
  // Residual loss window: one debounce period of definition edits.
  useEffect(() => {
    if (!keepDraft || !defsReady) return;
    const flush = () => {
      void writeDefinitionCache(defScope, snapshotDefinitions(store.doc));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [keepDraft, defsReady, defScope, store.doc]);

  /* --- saving ------------------------------------------------------------- */

  const save = useCallback(async () => {
    if (saving) return;

    // Signed out: nothing to save to yet. Stash the work first, so coming back
    // after signing in picks up exactly where this left off.
    if (!user) {
      if (isDraft) writeDraft(store.doc);
      router.push(signInHref(isDraft ? '/' : window.location.pathname));
      return;
    }

    setSaving(true);
    setSaveError(null);
    const attempted = current;

    try {
      if (pipelineId) {
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
        setSaving(false);
        return;
      }

      // First save of a draft: create it, carry the editor state over, then
      // move to its own URL so a reload and a shared link both work.
      const { pipeline } = await api.createPipeline(store.doc.name, store.source);
      await api.savePipeline(pipeline.id, {
        name: store.doc.name,
        source: store.source,
        layout: store.doc.layout,
        definitions: store.doc.definitions,
        sources: store.doc.sources,
      });
      // The navigation remounts this shell with pipelineScope(pipeline.id),
      // and that scope is empty until this lands — the links would die on
      // this very jump if the snapshot stayed under the draft. Awaited, so
      // the new mount's read is ordered after the write on the shared
      // connection; the draft's own record goes with it.
      await writeDefinitionCache(
        pipelineScope(pipeline.id),
        snapshotDefinitions(store.doc),
      );
      void deleteDefinitionCache(draftScope);
      clearDraft();
      router.push(`/pipelines/${pipeline.id}`);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Could not save.');
      setSaving(false);
    }
  }, [saving, user, pipelineId, isDraft, current, store.doc, store.source, router]);

  const { undo, redo } = store;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Not while typing: ⌘Z in a text field is the field's own undo.
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          void save();
          break;
        case 'z':
          if (typing) return;
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          break;
        case 'y':
          if (typing) return;
          e.preventDefault();
          redo();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, undo, redo]);

  // Leaving with unsaved work should cost a keystroke, not a shrug. A signed-out
  // draft is exempt: it is in localStorage, so leaving loses nothing.
  useEffect(() => {
    if (!dirty || (isDraft && !user)) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, isDraft, user]);

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
        onRename={store.rename}
        diagnostics={store.diagnostics}
        dirty={dirty}
        saving={saving}
        savedAt={savedTime}
        error={saveError}
        onSave={save}
        saveLabel={!user ? 'Sign in to save' : pipelineId ? 'Save' : 'Save to my pipelines'}
        onExport={exportFile}
        onPublish={() => setPublishOpen(true)}
        runView={run.view}
        onRun={() => dispatchRun({ type: 'run' })}
      />

      <div className="flex min-h-0 flex-1">
        {paletteOpen ? (
          <Palette
            onNewEvent={store.addBlankEvent}
            onCollapse={() => setPaletteOpen(false)}
          />
        ) : (
          <PaletteRail onExpand={() => setPaletteOpen(true)} />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <ReactFlowProvider>
              <Canvas store={store} />
            </ReactFlowProvider>
          </div>

          <div className={`shrink-0 ${outputOpen ? 'h-[280px]' : 'h-[42px]'}`}>
            <OutputPanel
              filename={store.doc.name}
              source={store.source}
              diagnostics={store.diagnostics}
              onDownload={exportFile}
              onFix={store.applyFix}
              runView={run.view}
              runNotice={run.notice}
              onRunEvent={dispatchRun}
              collapsed={!outputOpen}
              onToggleCollapse={() => setOutputOpen((open) => !open)}
            />
          </div>
        </main>

        {/* Fixed width so the panel and its divider move as one unit; the
            handle straddles the panel's left edge. */}
        <div className="relative flex shrink-0" style={{ width: inspectorWidth }}>
          <Inspector store={store} />
          <ResizeHandle
            width={inspectorWidth}
            min={INSPECTOR_W.min}
            max={INSPECTOR_W.max}
            label="Resize inspector"
            onResize={setInspectorWidth}
            onReset={() => setInspectorWidth(INSPECTOR_W.default)}
          />
        </div>
      </div>

      {publishOpen && (
        <PublishModal
          doc={store.doc}
          source={store.source}
          onClose={() => setPublishOpen(false)}
        />
      )}
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

/* --- draft storage --------------------------------------------------------
 *
 * Stored the same way the server stores a pipeline: `.pointy` source plus the
 * editor state that is not part of the language. Reading it back parses the
 * source, so the draft path exercises the same round trip a save does — and a
 * draft that cannot be parsed is discarded rather than half-restored.
 */

interface Draft {
  source: string;
  name: string;
  layout: PointyDocument['layout'];
  definitions: PointyDocument['definitions'];
  sources: PointyDocument['sources'];
}

function writeDraft(doc: PointyDocument) {
  try {
    const draft: Draft = {
      // Re-emitted rather than reusing `store.source` so this stays a pure
      // function of the document.
      source: emit(doc),
      name: doc.name,
      layout: doc.layout,
      definitions: doc.definitions,
      sources: doc.sources,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* private mode, or out of quota. The editor still works. */
  }
}

function readDraft(): PointyDocument | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;

    const draft = JSON.parse(raw) as Draft;
    const parsed = tryParse(draft.source, draft.name);
    if (!parsed.ok) {
      clearDraft();
      return null;
    }

    return {
      ...parsed.doc,
      name: draft.name,
      layout: draft.layout ?? {},
      definitions: draft.definitions ?? {},
      sources: draft.sources ?? [],
    };
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to do */
  }
}
