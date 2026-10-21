import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { currentUser } from '../lib/server/auth';
import { AuthScreen } from '../components/auth/AuthScreen';
import { safeNext } from '../lib/routes';

export const metadata = { title: 'Create your account · Pointy Wizard' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await currentUser()) {
    const { next } = await searchParams;
    redirect(safeNext(next ?? null) ?? '/pipelines');
  }

  return (
    <Suspense>
      <AuthScreen mode="signup" />
    </Suspense>
  );
}
