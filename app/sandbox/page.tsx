import { AppShell } from '../components/shell/AppShell';
import { sampleDocument } from '../lib/sampleDocument';

export const metadata = { title: 'Sandbox · Pointy Wizard' };

/**
 * The editor on screen 03's own pipeline, with no account and no server.
 *
 * Kept because it is the fastest way to exercise the canvas, the emitter and
 * the inspector without signing in — and because it is the one screen that is
 * guaranteed to match the Figma frame exactly. Nothing here persists.
 */
export default function SandboxPage() {
  return <AppShell initial={sampleDocument} />;
}
