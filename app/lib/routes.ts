/**
 * URL builders, usable from both sides.
 *
 * Deliberately free of a `'use client'` directive and of any import that would
 * pull one in: a server component redirecting to sign-in needs this, and
 * anything exported from a client module can only be rendered, never called,
 * from the server.
 */

/**
 * A sign-in link that comes back here afterwards.
 *
 * Anything gated should use this rather than a bare `/signin`, so a person who
 * signs in mid-task lands back on the task and not on a list.
 */
export function signInHref(returnTo: string): string {
  return `/signin?next=${encodeURIComponent(returnTo)}`;
}

/**
 * Only ever redirect somewhere on this site.
 *
 * `next` arrives in the URL, so anyone can put anything in it. Without this a
 * link to `/signin?next=https://evil.example` would hand a freshly signed-in
 * user straight to someone else's page. Protocol-relative `//host` is rejected
 * too — it is an absolute URL wearing a relative path's clothes.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}
