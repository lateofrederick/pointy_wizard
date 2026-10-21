import { events, mapEvents } from './pointy';
import type { EventDefinition, EventRef, PointyDocument } from '../types/pointy';

/**
 * Definition store — the browser's memory for event definitions until the
 * backend round-trips them properly.
 *
 * WHY THIS EXISTS: a definition is TWO facts — the Python file
 * (`doc.definitions`) and the link from an event to it (`ref.definitionId`).
 * Neither survives a reload of a SAVED pipeline today: `.pointy` source has
 * no syntax for the link (parse.ts hands back `definitions: {}` and emit
 * never writes definitionId), and while the server round-trips the
 * definitions map (loadPipeline applies `stored.definitions`), the links die
 * with the parse. Unsaved drafts are self-sufficient for the FILES —
 * `pw-draft` stores the whole document including `definitions` — so this
 * store is belt-and-braces for drafts and the only survival path for
 * pipelines.
 *
 * WHY LINKS ARE KEYED BY `namespace::name`, NOT BY EVENT ID: event ids do
 * not survive a parse. `newEventId()` mints a fresh timestamp id on every
 * parse of the same source (parse.ts calls it per event occurrence), so the
 * id the link was cached against is guaranteed to be gone after a reload —
 * an id-keyed lookup restores nothing, and the write-back that follows then
 * erases the links from the store (the exact bug this keying fixes: the
 * definitions map survived, because it is filename-keyed, while every link
 * vanished). Names are the identity the rest of the app already assumes —
 * the Python file is `snake(ref.name)`, and flow.ts keys CFG-reuse marking
 * on `namespace::name`. Two occurrences of one event therefore converge on
 * one link, which matches the file-per-name reality: they could not have
 * different files anyway. Known cost: renaming an event changes its key, so
 * a rename loses the cached link on the next reload (the file itself stays,
 * filename-keyed); the language/server fix below also fixes that.
 *
 * Storage is IndexedDB: one database, one store, one record per workspace
 * scope. localStorage would hold a few kilobytes of Python fine, but it is a
 * synchronous API with a hard per-origin cap, and the direction of travel is
 * that the real backend owns this data — IndexedDB's shape (named stores,
 * keyed records, async) maps onto that future without a rewrite of callers.
 *
 * SCOPE — how workspaces stay apart: the key is `pipeline:<id>` for a saved
 * pipeline and `draft` for the single unsaved editor slot (the same slot
 * `pw-draft` uses). Two pipelines never share a record; the draft never
 * bleeds into a pipeline or vice versa. Deliberately NOT user-scoped: the
 * draft itself is browser-global, so scoping definitions by user while the
 * draft is not would desync the two stores (definitions restored for a
 * document that is not). When the backend owns definitions, ownership moves
 * there and this file goes away.
 *
 * UNLOAD, HONESTLY: IndexedDB writes are asynchronous, so a write started
 * while the page is dying (the old localStorage beforeunload flush) may be
 * killed before it commits. AppShell flushes on pagehide and on
 * visibilitychange→hidden — the latter still has a live event loop, and is
 * the hook that actually lands tab switches and mobile app-switches. The
 * residual window is one debounce period of definition edits; the draft's own
 * localStorage write has the same window.
 *
 * THE REAL FIX, when it is designed: express the link in the language (a
 * definition directive in `.pointy`) or as a server column — with stable
 * event identity, which also unbreaks layout (positions are id-keyed too,
 * and every reload currently drops them to auto-layout) — and delete this
 * file. Until then the store wins on load — it is the only place pipeline
 * links exist at all.
 */
export interface DefinitionSnapshot {
  definitions: Record<string, EventDefinition>;
  /** `namespace::name` → definition id (the file's key in `definitions`). */
  links: Record<string, string>;
}

/**
 * The stable identity of an event occurrence's source name — what a link is
 * keyed by. Occurrence ids are per-parse; this is not. Same key flow.ts
 * already uses to mark CFG reuse.
 */
export const linkKey = (ref: Pick<EventRef, 'namespace' | 'name'>) =>
  `${ref.namespace}::${ref.name}`;

/**
 * The scope key for a workspace. `pipeline:<id>` and `draft` are
 * self-describing and cannot collide — a raw pipeline id could one day be the
 * literal string "draft".
 */
export const draftScope = 'draft';
export const pipelineScope = (pipelineId: string) => `pipeline:${pipelineId}`;

/** Both facts, taken from the live document. */
export function snapshotDefinitions(doc: PointyDocument): DefinitionSnapshot {
  const links: Record<string, string> = {};
  for (const ref of [...events(doc.chain), ...doc.staged]) {
    if (ref.definitionId) links[linkKey(ref)] = ref.definitionId;
  }
  return { definitions: doc.definitions, links };
}

/**
 * Merge a snapshot back into a freshly loaded document.
 *
 * Links only restore when they resolve — a dangling pointer is worse than
 * none: the inspector would offer to edit a file that is not there. The
 * store's definitions win per key, because they were written after any
 * server or draft copy of the same file.
 */
export function applyDefinitionSnapshot(
  doc: PointyDocument,
  snap: DefinitionSnapshot,
): PointyDocument {
  const restore = (r: EventRef): EventRef => {
    const link = snap.links[linkKey(r)];
    return link && snap.definitions[link] ? { ...r, definitionId: link } : r;
  };
  return {
    ...doc,
    chain: doc.chain ? mapEvents(doc.chain, restore) : null,
    staged: doc.staged.map(restore),
    definitions: { ...doc.definitions, ...snap.definitions },
  };
}

/* --- the store itself ----------------------------------------------------- */

const DB_NAME = 'pointy-editor';
const DB_VERSION = 1;
const STORE = 'definitions';

/** One record per workspace scope. `savedAt` is for debugging, nothing reads it. */
interface DefinitionRecord {
  scope: string;
  definitions: Record<string, EventDefinition>;
  links: Record<string, string>;
  savedAt: string;
}

function isRecord(value: unknown): value is DefinitionRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DefinitionRecord).scope === 'string' &&
    typeof (value as DefinitionRecord).definitions === 'object' &&
    (value as DefinitionRecord).definitions !== null
  );
}

/** Promisify an IDBRequest. */
function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// One shared connection: same-connection transactions are ordered, so a read
// issued after a write sees that write — the read-after-write guarantee the
// editor relies on (save-then-navigate, unmount-flush-then-remount).
let dbPromise: Promise<IDBDatabase> | null = null;

function openStore(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'scope' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // Another tab holds an older version open. Nothing older exists yet;
    // treat as no store rather than hanging the editor.
    request.onblocked = () => reject(new Error('pointy-editor store blocked'));
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

/**
 * The snapshot for one workspace, or null when there is none (or no
 * store — private-mode restrictions degrade to "cannot remember", never to a
 * broken editor).
 */
export async function readDefinitionCache(
  scope: string,
): Promise<DefinitionSnapshot | null> {
  try {
    const db = await openStore();
    const record = await req(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(scope),
    );
    if (!isRecord(record)) return null;
    return { definitions: record.definitions, links: record.links ?? {} };
  } catch {
    return null;
  }
}

/** Record the snapshot for one workspace. Last write wins; failures are silent. */
export async function writeDefinitionCache(
  scope: string,
  snap: DefinitionSnapshot,
): Promise<void> {
  try {
    const db = await openStore();
    const record: DefinitionRecord = {
      scope,
      definitions: snap.definitions,
      links: snap.links,
      savedAt: new Date().toISOString(),
    };
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(record));
  } catch {
    /* no store: the editor still works, it just cannot remember. */
  }
}

/** Drop one workspace's record — a draft whose snapshot just moved to a pipeline. */
export async function deleteDefinitionCache(scope: string): Promise<void> {
  try {
    const db = await openStore();
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(scope));
  } catch {
    /* nothing to clean up. */
  }
}

/**
 * Empty the whole store. Tests use it for isolation; a future sign-out that
 * wants local copies gone uses it too.
 */
export async function clearDefinitionStore(): Promise<void> {
  try {
    const db = await openStore();
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
  } catch {
    /* nothing to clear. */
  }
}
