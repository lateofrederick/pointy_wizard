import type { PointyDocument } from '../../types/pointy';
import { tryParse } from '../pointy/parse';
import { read } from './db';

/**
 * Load one pipeline as a document.
 *
 * Shared by the route handler and the editor page so there is exactly one
 * place that turns stored `.pointy` source back into a `PointyDocument`. The
 * page reads it directly rather than calling its own API over HTTP.
 */
export type LoadResult =
  | { ok: true; id: string; updatedAt: string; document: PointyDocument }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'unparseable'; error: string };

export async function loadPipeline(userId: string, id: string): Promise<LoadResult> {
  const stored = await read((db) => db.pipelines.find((p) => p.id === id));

  // Missing and not-yours answer the same, so ids cannot be probed.
  if (!stored || stored.ownerId !== userId) return { ok: false, reason: 'not-found' };

  const parsed = tryParse(stored.source, stored.name);
  if (!parsed.ok) return { ok: false, reason: 'unparseable', error: parsed.error };

  return {
    ok: true,
    id: stored.id,
    updatedAt: stored.updatedAt,
    document: {
      ...parsed.doc,
      name: stored.name,
      layout: stored.layout,
      definitions: stored.definitions,
      sources: stored.sources,
    },
  };
}
