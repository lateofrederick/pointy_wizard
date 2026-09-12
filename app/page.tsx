import { redirect } from 'next/navigation';
import { currentUser } from './lib/server/auth';

/**
 * There is no home page. Signed in, the landing place is your pipelines
 * (screen 20); signed out, it is the sign-in screen, whose right half is the
 * marketing page.
 */
export default async function Home() {
  redirect((await currentUser()) ? '/pipelines' : '/signin');
}
