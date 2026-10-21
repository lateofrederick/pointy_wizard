import { NextResponse } from 'next/server';
import { write } from '../../../lib/server/db';
import { currentUser } from '../../../lib/server/auth';
import { loadPipeline } from '../../../lib/server/pipelines';
import { tryParse } from '../../../lib/pointy/parse';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * One pipeline.
 *
 * The stored form is `.pointy` source plus the editor state that is not part of
 * the language — layout, Python definitions, registry sources. Loading parses
 * the source back into a document, so a save/load cycle continuously proves
 * emit() and parse() agree.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { id } = await params;
  const result = await loadPipeline(user.id, id);

  if (!result.ok) {
    return result.reason === 'not-found'
      ? NextResponse.json({ error: 'No such pipeline.' }, { status: 404 })
      : NextResponse.json(
          { error: `Stored source could not be parsed. ${result.error}` },
          { status: 500 },
        );
  }

  return NextResponse.json({
    pipeline: { id: result.id, updatedAt: result.updatedAt, document: result.document },
  });
}

export async function PUT(request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    source?: string;
    layout?: Record<string, { x: number; y: number }>;
    definitions?: Record<string, { filename: string; source: string }>;
    sources?: { namespace: 'pypi' | 'github' | 'hub'; package: string; version: string }[];
  } | null;

  if (!body?.source) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  // Refuse to store something that cannot be read back. A save that corrupts a
  // pipeline is worse than a save that fails.
  const parsed = tryParse(body.source, body.name ?? 'untitled');
  if (!parsed.ok) {
    return NextResponse.json(
      { error: `Refusing to save unparseable source. ${parsed.error}` },
      { status: 400 },
    );
  }

  const updatedAt = new Date().toISOString();
  const ok = await write((db) => {
    const stored = db.pipelines.find((p) => p.id === id);
    if (!stored || stored.ownerId !== user.id) return false;

    stored.source = body.source!;
    if (body.name) stored.name = body.name;
    if (body.layout) stored.layout = body.layout;
    if (body.definitions) stored.definitions = body.definitions;
    if (body.sources) stored.sources = body.sources;
    stored.updatedAt = updatedAt;
    return true;
  });

  if (!ok) return NextResponse.json({ error: 'No such pipeline.' }, { status: 404 });
  return NextResponse.json({ ok: true, updatedAt });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { id } = await params;
  const ok = await write((db) => {
    const index = db.pipelines.findIndex((p) => p.id === id && p.ownerId === user.id);
    if (index === -1) return false;
    db.pipelines.splice(index, 1);
    return true;
  });

  if (!ok) return NextResponse.json({ error: 'No such pipeline.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
