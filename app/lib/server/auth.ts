import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { read, type StoredUser } from './db';
import { MIN_PASSWORD } from '../constants';

/**
 * Session handling.
 *
 * WHAT THIS IS: scrypt password hashing with a per-user salt, and an
 * HMAC-signed, httpOnly, sameSite=lax session cookie. No dependencies beyond
 * node:crypto. Enough to make accounts real for local use.
 *
 * WHAT THIS IS NOT, and must be before anything is exposed publicly:
 *   - no rate limiting or lockout on sign-in
 *   - no email verification, no password reset
 *   - no CSRF token; it leans entirely on sameSite=lax
 *   - no session revocation list — a stolen cookie is valid until it expires
 *   - POINTY_SECRET falls back to a constant in development, so cookies signed
 *     on one dev machine verify on another
 *
 * Treat this as a working sketch of auth, not as auth.
 */

const scryptAsync = promisify(scrypt);

const COOKIE = 'pw_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

const DEV_SECRET = 'pointy-wizard-development-secret-do-not-ship';

function secret(): string {
  const fromEnv = process.env.POINTY_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('POINTY_SECRET must be set in production (32+ random characters).');
  }
  return DEV_SECRET;
}

export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString('hex'),
): Promise<{ hash: string; salt: string }> {
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return { hash: derived.toString('hex'), salt };
}

export async function verifyPassword(
  password: string,
  user: Pick<StoredUser, 'passwordHash' | 'salt'>,
): Promise<boolean> {
  const { hash } = await hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  // Lengths must match before timingSafeEqual, and it must not short-circuit
  // on content.
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function serialiseToken(userId: string): string {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

function parseToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  const expected = sign(`${userId}.${expires}`);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;

  return userId;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function startSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, serialiseToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Never returns the password hash. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const userId = parseToken(token);
  if (!userId) return null;

  const user = await read((db) => db.users.find((u) => u.id === userId));
  if (!user) return null;

  return { id: user.id, email: user.email, name: user.name };
}

/** Basic shape checks. Deliberately permissive except on length. */
export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Enter a valid email address.';
  // 12 is what screen 02 promises the user. The form and the server say the
  // same number, so the rule is never discovered only on submit.
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  return null;
}
