'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type PipelineSummary, type SessionUser } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Chip } from '../ui';
import { AccountBar, Rail } from './Chrome';

/**
 * Your pipelines — Figma screen 20 (`41:5374`).
 *
 * Two deliberate departures from the design, both because the column would
 * otherwise be furniture with nothing behind it:
 *
 *  - The LAST RUN column is not drawn. There is no run history yet (screen 12),
 *    and a column that is empty on every row teaches the reader nothing.
 *  - The tabs filter by what the linter actually knows — valid, warnings,
 *    errors — not by Drafts/Published, which is a publishing concept that
 *    arrives with screen 11.
 *
 * Both are listed in todo.txt so the design and the build can be reconciled
 * rather than quietly diverging.
 */

type Filter = 'all' | 'valid' | 'warning' | 'error';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'valid', label: 'Valid' },
  { id: 'warning', label: 'Warnings' },
  { id: 'error', label: 'Errors' },
];

export function PipelineList({ user }: { user: SessionUser }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [pipelines, setPipelines] = useState<PipelineSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { pipelines } = await api.listPipelines();
      setPipelines(pipelines);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your pipelines.');
      setPipelines([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => tally(pipelines ?? []), [pipelines]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (pipelines ?? [])
      .filter((p) => statusOf(p) === filter || filter === 'all')
      .filter(
        (p) =>
          !needle ||
          p.name.toLowerCase().includes(needle) ||
          p.preview.toLowerCase().includes(needle),
      );
  }, [pipelines, filter, query]);

  async function createNew() {
    setBusy(true);
    setError(null);
    try {
      const { pipeline } = await api.createPipeline('untitled');
      router.push(`/pipelines/${pipeline.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create a pipeline.');
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const source = await file.text();
      const name = file.name.replace(/\.pointy$/i, '') || 'imported';
      const { pipeline } = await api.createPipeline(name, source);
      router.push(`/pipelines/${pipeline.id}`);
    } catch (e) {
      // A rejected import is the parser's verdict, and it names the line —
      // show it verbatim rather than a generic failure.
      setError(e instanceof ApiError ? e.message : 'Could not read that file.');
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setPipelines((current) => (current ?? []).filter((p) => p.id !== id));
    try {
      await api.deletePipeline(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete that pipeline.');
      void load();
    }
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg-base">
      <AccountBar user={user} query={query} onQueryChange={setQuery} />

      <div className="flex min-h-0 flex-1">
        <Rail user={user} />

        <main className="min-w-0 flex-1 overflow-y-auto px-9 py-[30px]">
          <div className="flex items-center gap-3">
            <h1 className="font-sans text-[24px] font-medium text-primary">Your pipelines</h1>
            <span className="font-mono text-[13px] text-tertiary">
              {pipelines?.length ?? ''}
            </span>

            <span className="flex-1" />

            <input
              ref={fileInput}
              type="file"
              accept=".pointy,text/plain"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset first: picking the same file twice must fire again.
                e.target.value = '';
                if (file) void importFile(file);
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className={cn(
                'h-9 cursor-pointer rounded-[6px] border border-edge-strong px-4',
                'font-sans text-[11.5px] text-secondary hover:bg-neutral-tint hover:text-primary',
                busy && 'cursor-not-allowed opacity-50',
              )}
            >
              ↑&nbsp;&nbsp;Import .pointy
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={createNew}
              className={cn(
                'h-9 cursor-pointer rounded-[6px] bg-seq px-[18px]',
                'font-sans text-[11.5px] font-medium text-bg-sunken hover:bg-seq-hover',
                busy && 'cursor-not-allowed opacity-50',
              )}
            >
              ＋&nbsp;&nbsp;New pipeline
            </button>
          </div>

          <div className="mt-[22px] flex items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'flex h-7 cursor-pointer items-center rounded-[5px] px-2.5 font-sans',
                  filter === f.id
                    ? 'bg-neutral-tint text-[10.5px] font-medium text-primary'
                    : 'text-[10.5px] text-tertiary hover:text-secondary',
                )}
              >
                {f.label}&nbsp;&nbsp;{f.id === 'all' ? (pipelines?.length ?? 0) : counts[f.id]}
              </button>
            ))}
            <span className="flex-1" />
            <span className="font-sans text-[10.5px] text-tertiary">
              Sort&nbsp;&nbsp;Last edited
            </span>
          </div>

          {error && (
            <p role="alert" className="mt-4 font-sans text-[11.5px] text-danger">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-0 px-[18px]">
            <ColumnHead className="flex-1">PIPELINE</ColumnHead>
            <ColumnHead className="w-[150px]">STATUS</ColumnHead>
            <ColumnHead className="w-[90px]">EVENTS</ColumnHead>
            <ColumnHead className="w-[74px]">MODE</ColumnHead>
            <ColumnHead className="w-[150px]">EDITED</ColumnHead>
            <span className="w-6" />
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {pipelines === null && <Placeholder>Loading…</Placeholder>}

            {pipelines !== null && pipelines.length === 0 && (
              <Placeholder>
                Nothing here yet. Start one, or import a <code>.pointy</code> file you already
                have.
              </Placeholder>
            )}

            {pipelines !== null && pipelines.length > 0 && shown.length === 0 && (
              <Placeholder>No pipeline matches that.</Placeholder>
            )}

            {shown.map((p) => (
              <Row key={p.id} pipeline={p} onDelete={() => remove(p.id)} />
            ))}
          </div>

          <p className="mt-[22px] font-sans text-[9.5px] text-tertiary">
            Deleting a pipeline here removes it immediately. There is no Trash yet.
          </p>
        </main>
      </div>
    </div>
  );
}

function Row({
  pipeline,
  onDelete,
}: {
  pipeline: PipelineSummary;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const status = statusOf(pipeline);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/pipelines/${pipeline.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') router.push(`/pipelines/${pipeline.id}`);
      }}
      className={cn(
        'flex h-[66px] cursor-pointer items-center rounded-[8px] border border-edge-subtle',
        'bg-bg-surface px-[18px] hover:border-edge-strong',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[5px] pr-4">
        <span className="truncate font-mono text-[13px] text-primary">
          {pipeline.name}.pointy
        </span>
        <span className="truncate font-mono text-[9.5px] text-tertiary">
          {pipeline.preview || 'empty pipeline'}
        </span>
      </div>

      <div className="w-[150px]">
        <Chip tone={status === 'error' ? 'red' : status === 'warning' ? 'amber' : 'green'}>
          {status === 'error'
            ? `✕ ${pipeline.errorCount} ERROR${pipeline.errorCount === 1 ? '' : 'S'}`
            : status === 'warning'
              ? `⚠ ${pipeline.warningCount} WARNING${pipeline.warningCount === 1 ? '' : 'S'}`
              : '✓ VALID'}
        </Chip>
      </div>

      <span className="w-[90px] font-sans text-[11.5px] text-secondary">
        {pipeline.eventCount}
      </span>
      <span className="w-[74px] font-mono text-[11px] text-secondary">{pipeline.mode}</span>
      <span className="w-[150px] font-sans text-[11.5px] text-tertiary">
        {relativeTime(pipeline.updatedAt)}
      </span>

      <div className="flex w-6 justify-end" onClick={(e) => e.stopPropagation()}>
        {confirming ? (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <button
              type="button"
              onClick={onDelete}
              className="cursor-pointer font-sans text-[10.5px] text-danger hover:underline"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="cursor-pointer font-sans text-[10.5px] text-tertiary hover:underline"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Delete ${pipeline.name}`}
            onClick={() => setConfirming(true)}
            className="cursor-pointer px-1 font-sans text-[13px] text-tertiary hover:text-primary"
          >
            ⋮
          </button>
        )}
      </div>
    </div>
  );
}

function ColumnHead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('ds-section-label', className)}>{children}</span>;
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[8px] border border-dashed border-edge px-[18px] py-8 text-center font-sans text-[11.5px] text-tertiary">
      {children}
    </p>
  );
}

function statusOf(p: PipelineSummary): Exclude<Filter, 'all'> {
  if (p.errorCount > 0) return 'error';
  if (p.warningCount > 0) return 'warning';
  return 'valid';
}

function tally(pipelines: PipelineSummary[]) {
  return pipelines.reduce(
    (acc, p) => {
      acc[statusOf(p)] += 1;
      return acc;
    },
    { valid: 0, warning: 0, error: 0 },
  );
}

const UNITS: [limit: number, seconds: number, name: string][] = [
  [60, 1, 'second'],
  [3600, 60, 'minute'],
  [86400, 3600, 'hour'],
  [604800, 86400, 'day'],
  [2629800, 604800, 'week'],
  [31557600, 2629800, 'month'],
];

function relativeTime(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 45) return 'just now';
  for (const [limit, size, name] of UNITS) {
    if (seconds < limit) {
      const n = Math.round(seconds / size);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
  const years = Math.round(seconds / 31557600);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
