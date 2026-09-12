import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../lib/server/auth';
import { loadPipeline } from '../../lib/server/pipelines';
import { AppShell } from '../../components/shell/AppShell';

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/signin');

  const { id } = await params;
  const result = await loadPipeline(user.id, id);

  if (!result.ok && result.reason === 'not-found') notFound();

  if (!result.ok) {
    // Stored source that will not parse is a bug in emit/parse, not user error.
    // Say so plainly instead of opening an editor onto an empty canvas.
    return (
      <main className="grid min-h-screen place-items-center bg-bg-base px-8">
        <div className="max-w-[520px]">
          <h1 className="font-sans text-[20px] font-medium text-primary">
            This pipeline could not be opened
          </h1>
          <p className="mt-3 font-sans text-[13px] leading-6 text-secondary">
            Its stored source did not parse, so the editor would have shown you something
            other than what is saved.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-[8px] border border-edge bg-bg-sunken p-4 font-mono text-[11.5px] text-danger">
            {result.error}
          </pre>
        </div>
      </main>
    );
  }

  return (
    <AppShell initial={result.document} pipelineId={result.id} savedAt={result.updatedAt} />
  );
}
