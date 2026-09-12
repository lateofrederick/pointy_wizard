/**
 * Values that the form and the server must agree on.
 *
 * Kept free of imports so both a client component and a route handler can read
 * them without dragging node built-ins into the bundle.
 */

/** Stated on screen 02 ("at least 12 characters") and enforced on signup. */
export const MIN_PASSWORD = 12;

/**
 * The EventHub scopes screen 19 itemises, in the order the screen lists them.
 *
 * `read` is first and is not optional: without it nothing on the canvas
 * resolves, which is why its toggle is drawn locked on.
 */
export const GRANT_SCOPES = ['read', 'publish', 'deprecate'] as const;
export type GrantScope = (typeof GRANT_SCOPES)[number];
