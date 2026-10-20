import { currentUser } from './lib/server/auth';
import { SessionProvider } from './lib/session';
import { AppShell } from './components/shell/AppShell';
import { emptyDocument } from './types/pointy';

/**
 * The landing page is the editor.
 *
 * No sign-in wall: you arrive on a working canvas and start drawing. An account
 * is asked for at the first point it actually means something — saving, or
 * reaching EventHub — and never before.
 *
 * The document starts empty, which renders screen 14's empty state. If the
 * browser is holding a draft from a previous visit, AppShell restores it after
 * mount; that cannot happen here because localStorage does not exist on the
 * server.
 */
export default async function Home() {
  const user = await currentUser();

  return (
    <SessionProvider user={user}>
      <AppShell initial={emptyDocument()} />
    </SessionProvider>
  );
}
