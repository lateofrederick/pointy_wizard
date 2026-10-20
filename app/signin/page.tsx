import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { currentUser } from '../lib/server/auth';
import { AuthScreen } from '../components/auth/AuthScreen';
import { safeNext } from '../lib/routes';

export const metadata = { title: 'Sign in · Pointy Wizard' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Someone who is already signed in has no business on this form — send them
  // wherever they were heading.
  if (await currentUser()) {
    const { next } = await searchParams;
    redirect(safeNext(next ?? null) ?? '/pipelines');
  }

  // useSearchParams needs a boundary, or the whole route opts out of
  // prerendering.
  return (
    <Suspense>
      <AuthScreen mode="signin" />
    </Suspense>
  );
}
