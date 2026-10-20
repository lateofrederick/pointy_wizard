import { currentUser } from '../lib/server/auth';
import { SessionProvider } from '../lib/session';
import { AppShell } from '../components/shell/AppShell';
import { sampleDocument } from '../lib/sampleDocument';

export const metadata = { title: 'Sandbox · Pointy Wizard' };

/**
 * The editor on screen 03's own pipeline.
 *
 * `/` is the real starting point and opens empty. This route exists because
 * screen 03's document is the one thing guaranteed to match a Figma frame
 * exactly, which makes it the fastest way to check the canvas against the
 * design. It shares the draft key with `/`, so treat it as a viewer: what you
 * change here is not what `/` restores.
 */
export default async function SandboxPage() {
  const user = await currentUser();

  return (
    <SessionProvider user={user}>
      <AppShell initial={sampleDocument} keepDraft={false} />
    </SessionProvider>
  );
}
