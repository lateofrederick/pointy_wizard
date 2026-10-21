import { redirect } from 'next/navigation';
import { currentUser } from '../lib/server/auth';
import { SessionProvider } from '../lib/session';
import { signInHref } from '../lib/routes';
import { PipelineList } from '../components/app/PipelineList';

export const metadata = { title: 'Your pipelines · Pointy Wizard' };

export default async function PipelinesPage() {
  // "Your pipelines" needs a you.
  const user = await currentUser();
  if (!user) redirect(signInHref('/pipelines'));

  return (
    <SessionProvider user={user}>
      <PipelineList user={user} />
    </SessionProvider>
  );
}
