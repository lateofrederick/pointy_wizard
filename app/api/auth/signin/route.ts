import { NextResponse } from 'next/server';
import { read } from '../../../lib/server/db';
import { startSession, verifyPassword } from '../../../lib/server/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;

  const email = body?.email?.trim().toLowerCase() ?? '';
  const password = body?.password ?? '';

  const user = await read((db) => db.users.find((u) => u.email === email));

  // One message for both "no such account" and "wrong password", so the
  // response does not tell an attacker which emails are registered.
  const wrong = NextResponse.json(
    { error: 'That email and password do not match.' },
    { status: 401 },
  );

  if (!user) {
    // Still spend the time hashing, so a missing account is not measurably
    // faster than a wrong password.
    await verifyPassword(password, {
      passwordHash: '00'.repeat(64),
      salt: 'decoy',
    });
    return wrong;
  }

  if (!(await verifyPassword(password, user))) return wrong;

  await startSession(user.id);
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
}
