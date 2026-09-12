import { redirect } from 'next/navigation';
import { currentUser } from '../lib/server/auth';
import { AuthScreen } from '../components/auth/AuthScreen';

export const metadata = { title: 'Create your account · Pointy Wizard' };

export default async function SignUpPage() {
  if (await currentUser()) redirect('/pipelines');
  return <AuthScreen mode="signup" />;
}
