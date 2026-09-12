import { redirect } from 'next/navigation';
import { currentUser } from '../lib/server/auth';
import { PipelineList } from '../components/app/PipelineList';

export const metadata = { title: 'Your pipelines · Pointy Wizard' };

export default async function PipelinesPage() {
  const user = await currentUser();
  if (!user) redirect('/signin');
  return <PipelineList user={user} />;
}
