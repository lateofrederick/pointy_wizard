import { NextResponse } from 'next/server';
import { currentUser, endSession } from '../../../lib/server/auth';

export const runtime = 'nodejs';

/** Who am I? Returns null rather than 401 — "signed out" is not an error. */
export async function GET() {
  return NextResponse.json({ user: await currentUser() });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
