import { events, mapEvents } from './pointy';
import type { EventDefinition, EventRef, PointyDocument } from '../types/pointy';

/**
 * Definition cache — the browser's memory for event definitions until the
 * backend round-trips them properly.
 *
 * WHY THIS EXISTS: a definition is TWO facts — the Python file
 * (`doc.definitions`) and the link from an event to it (`ref.definitionId`).
 * Neither survives a reload today: `.pointy` source has no syntax for the
 * link (parse.ts hands back `definitions: {}` and emit never writes
 * definitionId), and the server stores the definitions map but not the links.
 * So after any refresh the event silently comes back "unlinked" and the
 * Python looks lost even when the map was carried across.
 *
 * This module keeps both facts in localStorage — the map plus an
 * event-id → definition-id table — scoped per pipeline ('draft' for the
 * unsaved editor, matching the draft's own single-key scheme). AppShell
 * applies the snapshot once on load and rewrites it as the document
 * changes, with a beforeunload flush so a refresh inside the debounce
 * window still lands.
 *
 * THE REAL FIX, when it is designed: express the link in the language (a
 * definition directive in `.pointy`) or as a server column, make emit/
 * parse/save/load carry it, and delete this file. Until then the cache
 * wins on load — it is the only place the links exist at all.
 */
export interface DefinitionSnapshot {
  definitions: Record<string, EventDefinition>;
  /** event id → definition id (the file's key in `definitions`). */
  links: Record<string, string>;
}

const keyFor = (scope: string) => `pw-defs-${scope}`;

/** Both facts, taken from the live document. */
export function snapshotDefinitions(doc: PointyDocument): DefinitionSnapshot {
  const links: Record<string, string> = {};
  for (const ref of [...events(doc.chain), ...doc.staged]) {
    if (ref.definitionId) links[ref.id] = ref.definitionId;
  }
  return { definitions: doc.definitions, links };
}

/**
 * Merge a snapshot back into a freshly loaded document.
 *
 * Links only restore when they resolve — a dangling pointer is worse than
 * none: the inspector would offer to edit a file that is not there. The
 * cache's definitions win per key, because they were written after any
 * server or draft copy of the same file.
 */
export function applyDefinitionSnapshot(
  doc: PointyDocument,
  snap: DefinitionSnapshot,
): PointyDocument {
  const restore = (r: EventRef): EventRef => {
    const link = snap.links[r.id];
    return link && snap.definitions[link] ? { ...r, definitionId: link } : r;
  };
  return {
    ...doc,
    chain: doc.chain ? mapEvents(doc.chain, restore) : null,
    staged: doc.staged.map(restore),
    definitions: { ...doc.definitions, ...snap.definitions },
  };
}

export function readDefinitionCache(scope: string): DefinitionSnapshot | null {
  try {
    const raw = localStorage.getItem(keyFor(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DefinitionSnapshot> | null;
    if (!parsed || typeof parsed !== 'object' || !parsed.definitions) return null;
    return { definitions: parsed.definitions, links: parsed.links ?? {} };
  } catch {
    return null;
  }
}

export function writeDefinitionCache(scope: string, snap: DefinitionSnapshot): void {
  try {
    localStorage.setItem(keyFor(scope), JSON.stringify(snap));
  } catch {
    /* private mode or quota: the editor still works, it just cannot remember. */
  }
}
