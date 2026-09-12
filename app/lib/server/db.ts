import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GrantScope } from '../constants';

/**
 * Dev-grade persistence: one JSON file under `.data/`.
 *
 * Deliberately the smallest thing that makes accounts and saved pipelines real.
 * It is NOT a production store — no migrations, no indexes, and the whole file
 * is rewritten on every change. Swapping it for a database means reimplementing
 * this module's four functions and nothing else; every caller goes through them.
 *
 * Writes are serialised through a promise chain because read-modify-write on a
 * whole file races badly otherwise.
 */

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  /** scrypt, hex. Never leaves the server. */
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface StoredPipeline {
  id: string;
  ownerId: string;
  name: string;
  /**
   * The `.pointy` source is the stored truth — not a serialised object graph.
   *
   * Loading parses it back, so every save and load exercises the round trip
   * that emit() and parse() are tested against. If they ever disagree, the app
   * finds out immediately rather than silently persisting something the
   * language cannot express.
   */
  source: string;
  /** Editor and project state, which is not part of the language. */
  layout: Record<string, { x: number; y: number }>;
  definitions: Record<string, { filename: string; source: string }>;
  sources: { namespace: 'pypi' | 'github' | 'hub'; package: string; version: string }[];
  createdAt: string;
  updatedAt: string;
}

/**
 * An EventHub authorisation — Figma screen 19.
 *
 * This is the record of what the user consented to, held against the registry
 * package rather than against their Pointy Wizard account: the screen is
 * explicit that the two are separate, and that revoking one does not touch the
 * other. There is no EventHub service to call yet, so this grant is exactly
 * what it says it is — a stored consent, per user, revocable.
 */
export interface StoredGrant {
  id: string;
  userId: string;
  /** e.g. "corp/approved-events". One grant per package. */
  package: string;
  scopes: GrantScope[];
  grantedAt: string;
}

interface Database {
  users: StoredUser[];
  pipelines: StoredPipeline[];
  grants: StoredGrant[];
}

const EMPTY: Database = { users: [], pipelines: [], grants: [] };

const FILE = join(process.cwd(), '.data', 'pointy.json');

let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Database> {
  try {
    const raw = await readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Database>;
    // Field-by-field, so a file written before a collection existed still loads.
    return {
      users: parsed.users ?? [],
      pipelines: parsed.pipelines ?? [],
      grants: parsed.grants ?? [],
    };
  } catch {
    // Missing or unreadable file means "no data yet", which is a valid state.
    return { ...EMPTY };
  }
}

async function save(db: Database): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(db, null, 2), 'utf8');
}

/** Serialise every access so concurrent requests cannot clobber each other. */
function withDb<T>(fn: (db: Database) => T | Promise<T>, mutates: boolean): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    if (mutates) await save(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export const read = <T>(fn: (db: Database) => T | Promise<T>) => withDb(fn, false);
export const write = <T>(fn: (db: Database) => T | Promise<T>) => withDb(fn, true);

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
