import { NextResponse } from 'next/server';
import { newId, write } from '../../../lib/server/db';
import { hashPassword, startSession, validateCredentials } from '../../../lib/server/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
    name?: string;
  } | null;

  const email = body?.email?.trim().toLowerCase() ?? '';
  const password = body?.password ?? '';
  const name = body?.name?.trim() || email.split('@')[0];

  const problem = validateCredentials(email, password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { hash, salt } = await hashPassword(password);

  const result = await write((db) => {
    if (db.users.some((u) => u.email === email)) return { conflict: true as const };
    const user = {
      id: newId('usr'),
      email,
      name,
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return { conflict: false as const, user };
  });

  if (result.conflict) {
    return NextResponse.json(
      { error: 'An account with that email already exists.' },
      { status: 409 },
    );
  }

  await startSession(result.user.id);
  return NextResponse.json({
    user: { id: result.user.id, email: result.user.email, name: result.user.name },
  });
}
