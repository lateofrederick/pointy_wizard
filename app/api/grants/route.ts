import { NextResponse } from 'next/server';
import { newId, read, write, type StoredGrant } from '../../lib/server/db';
import { GRANT_SCOPES, type GrantScope } from '../../lib/constants';
import { currentUser } from '../../lib/server/auth';

export const runtime = 'nodejs';

/**
 * EventHub grants — Figma screen 19.
 *
 * A grant is stored consent, nothing more: there is no EventHub service to call
 * yet, so this endpoint records what the user agreed to and lets them take it
 * back. It is held per user and per package, exactly as the screen promises,
 * and it is deliberately unrelated to the session cookie that signs them in.
 */

const SCOPES: readonly GrantScope[] = GRANT_SCOPES;

export interface GrantView {
  id: string;
  package: string;
  scopes: GrantScope[];
  grantedAt: string;
}

const view = (g: StoredGrant): GrantView => ({
  id: g.id,
  package: g.package,
  scopes: g.scopes,
  grantedAt: g.grantedAt,
});

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const mine = await read((db) => db.grants.filter((g) => g.userId === user.id));
  return NextResponse.json({ grants: mine.map(view) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    package?: string;
    scopes?: string[];
  } | null;

  const pkg = body?.package?.trim();
  if (!pkg) return NextResponse.json({ error: 'Name a registry package.' }, { status: 400 });

  const requested = (body?.scopes ?? []).filter((s): s is GrantScope =>
    SCOPES.includes(s as GrantScope),
  );

  // `read` is not a choice — without it nothing on the canvas resolves, which
  // is why the screen draws its toggle locked on.
  const scopes = Array.from(new Set<GrantScope>(['read', ...requested]));

  const grant: StoredGrant = {
    id: newId('grt'),
    userId: user.id,
    package: pkg,
    scopes,
    grantedAt: new Date().toISOString(),
  };

  const stored = await write((db) => {
    // Re-authorising replaces: a grant is the current consent, not a log of it.
    // The existing id is kept, so the response and the list agree.
    const index = db.grants.findIndex((g) => g.userId === user.id && g.package === pkg);
    if (index === -1) {
      db.grants.push(grant);
      return grant;
    }
    db.grants[index] = { ...grant, id: db.grants[index].id };
    return db.grants[index];
  });

  return NextResponse.json({ grant: view(stored) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const pkg = new URL(request.url).searchParams.get('package');
  if (!pkg) return NextResponse.json({ error: 'Name a registry package.' }, { status: 400 });

  const removed = await write((db) => {
    const index = db.grants.findIndex((g) => g.userId === user.id && g.package === pkg);
    if (index === -1) return false;
    db.grants.splice(index, 1);
    return true;
  });

  if (!removed) return NextResponse.json({ error: 'No such grant.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
