import { redirect } from 'next/navigation';
import { currentUser } from '../lib/server/auth';
import { AuthScreen } from '../components/auth/AuthScreen';

export const metadata = { title: 'Sign in · Pointy Wizard' };

export default async function SignInPage() {
  // Someone who is already signed in has no business on this form.
  if (await currentUser()) redirect('/pipelines');
  return <AuthScreen mode="signin" />;
}
