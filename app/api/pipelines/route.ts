import { NextResponse } from 'next/server';
import { newId, read, write, type StoredPipeline } from '../../lib/server/db';
import { currentUser } from '../../lib/server/auth';
import { emit } from '../../lib/pointy/emit';
import { tryParse } from '../../lib/pointy/parse';
import { lint } from '../../lib/pointy/lint';
import { events } from '../../lib/pointy/walk';
import { emptyDocument, type Chain } from '../../types/pointy';

export const runtime = 'nodejs';

/** The list row — enough for screen 20 without shipping every pipeline's source. */
export interface PipelineSummary {
  id: string;
  name: string;
  /** First few event names, for the second line of the name cell. */
  preview: string;
  eventCount: number;
  mode: 'DAG' | 'CFG';
  errorCount: number;
  warningCount: number;
  updatedAt: string;
}

/**
 * `hub::RestApiExtract → MAP<ValidateProfile> → RouteDecision …`
 *
 * Deliberately not the emitted source: the row needs a shape, not a program.
 * Operators are flattened to a single arrow because at this size the
 * distinction between `->` and `|->` is noise.
 */
function previewOf(chain: Chain | null): string {
  const refs = events(chain);
  const label = (r: (typeof refs)[number]) => {
    const base = r.namespace === 'local' ? r.name : `${r.namespace}::${r.name}`;
    return r.meta ? `${r.meta.mode}<${r.meta.template}>` : base;
  };
  const shown = refs.slice(0, 3).map(label).join(' → ');
  return refs.length > 3 ? `${shown} …` : shown;
}

function summarise(p: StoredPipeline): PipelineSummary {
  const parsed = tryParse(p.source, p.name);
  if (!parsed.ok) {
    return {
      id: p.id,
      name: p.name,
      preview: 'source could not be parsed',
      eventCount: 0,
      mode: 'CFG',
      errorCount: 1,
      warningCount: 0,
      updatedAt: p.updatedAt,
    };
  }

  const doc = { ...parsed.doc, sources: p.sources, definitions: p.definitions };
  const diagnostics = lint(doc);
  // Counting occurrences means walking the chain, which is cheap and avoids
  // storing a denormalised count that could drift from the source.
  const eventCount = events(doc.chain).length;

  return {
    id: p.id,
    name: p.name,
    preview: previewOf(doc.chain),
    eventCount,
    mode: doc.directives.mode ?? 'CFG',
    errorCount: diagnostics.filter((d) => d.severity === 'error').length,
    warningCount: diagnostics.filter((d) => d.severity === 'warning').length,
    updatedAt: p.updatedAt,
  };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const mine = await read((db) => db.pipelines.filter((p) => p.ownerId === user.id));
  const pipelines = mine
    .map(summarise)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return NextResponse.json({ pipelines });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    source?: string;
  } | null;

  const name = (body?.name ?? 'untitled').trim() || 'untitled';

  // An imported file arrives as source; a new pipeline starts from an empty
  // document so the two paths converge immediately.
  let source = body?.source;
  if (source) {
    const parsed = tryParse(source, name);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: `That file is not valid Pointy. ${parsed.error}` },
        { status: 400 },
      );
    }
  } else {
    source = emit({ ...emptyDocument(name), directives: { version: '0.1.0' } });
  }

  const now = new Date().toISOString();
  const pipeline: StoredPipeline = {
    id: newId('pln'),
    ownerId: user.id,
    name,
    source,
    layout: {},
    definitions: {},
    sources: [],
    createdAt: now,
    updatedAt: now,
  };

  await write((db) => {
    db.pipelines.push(pipeline);
  });

  return NextResponse.json({ pipeline: summarise(pipeline) }, { status: 201 });
}
