'use client';

import { createContext, useContext } from 'react';
import type { SessionUser } from './api';

/**
 * Who is using the app, if anyone.
 *
 * The value comes from the server component that renders the screen, so the
 * first paint already knows — no flash of a "Sign in" button for someone who is
 * signed in, and no request from the client to find out.
 *
 * `null` is a first-class state, not an error. The editor works signed out; it
 * is saving, and reaching EventHub, that need an account.
 */
const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** The signed-in user, or null. */
export function useSession(): SessionUser | null {
  return useContext(SessionContext);
}

// signInHref lives in lib/routes.ts, not here: a server component needs to call
// it to redirect, and nothing exported from a 'use client' module can be called
// from the server.
