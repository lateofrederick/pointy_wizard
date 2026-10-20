'use client';

import { useEffect, useState } from 'react';
import type { PointyDocumentStore } from '../../hooks/usePointyDocument';
import type { Attr, Namespace, RegistrySource } from '../../types/pointy';
import { emitExpr } from '../../lib/pointy/emit';
import { cn } from '../../lib/cn';
import { Button, Callout, Chip, Field, SectionHeader } from '../ui';
import { DefinitionEditor } from '../editor/DefinitionEditor';
import { ConnectionInspector } from './ConnectionInspector';
import { ExpressionEditor } from './ExpressionEditor';
import { AuthoriseEventHub } from './AuthoriseEventHub';
import { api, type GrantView } from '../../lib/api';
import { useSession } from '../../lib/session';
import { signInHref } from '../../lib/routes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = 'properties' | 'definition';

/**
 * The inspector — Figma screens 03 (Properties) and 04 (Definition).
 *
 * With nothing selected it shows the pipeline itself (screen 13's territory):
 * directives, variables and registry sources are properties of the file, not of
 * any one event.
 */
export function Inspector({ store }: { store: PointyDocumentStore }) {
  const [tab, setTab] = useState<Tab>('properties');
  const { doc, selectedEvent, selectedWire, patchEvent, diagnostics, setDefinitionSource } = store;

  // A selected wire takes over the panel entirely — Figma screen 07.
  if (selectedWire) return <ConnectionInspector store={store} />;
  if (!selectedEvent) return <PipelineInspector store={store} />;

  const ref = selectedEvent;
  const definition = ref.definitionId ? doc.definitions[ref.definitionId] : undefined;
  const eventDiagnostics = diagnostics.filter(
    (d) => d.target.kind === 'event' && d.target.eventId === ref.id,
  );

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-edge bg-bg-surface">
      <div className="flex items-center gap-2 border-l-2 border-template px-[14px] pt-4 pb-1">
        <h2 className="font-mono text-[14px] font-medium text-primary">{ref.name}</h2>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => store.selectEvent(null)}
          aria-label="Clear selection"
          className="cursor-pointer font-sans text-[12px] text-tertiary hover:text-primary"
        >
          ✕
        </button>
      </div>
      <p className="px-[14px] pb-3 font-mono text-[9.4px] text-tertiary">
        <span className="text-seq">EVENT</span> · {ref.namespace}
        {ref.version ? ` · v${ref.version}` : ''}
      </p>

      <div className="flex gap-4 border-b border-edge px-[14px]">
        <TabButton active={tab === 'properties'} onClick={() => setTab('properties')}>
          Properties
        </TabButton>
        <TabButton active={tab === 'definition'} onClick={() => setTab('definition')}>
          Definition
          <span className="ml-1.5 rounded-[3px] bg-accent-tint px-1 py-px font-mono text-[8px] text-accent">
            py
          </span>
        </TabButton>
      </div>

      {tab === 'properties' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[14px] py-4">
          {eventDiagnostics.map((d, i) => (
            <Callout
              key={i}
              tone={d.severity === 'error' ? 'error' : 'warning'}
              title={d.message}
              action={d.fix?.label}
            >
              {d.rule}
            </Callout>
          ))}

          <SectionHeader>IDENTITY</SectionHeader>
          <Field
            label="Event name"
            value={ref.name}
            onValueChange={(name) => patchEvent(ref.id, { name })}
            hint="Must be a valid Python identifier"
          />
          <Field label="Registry source" kind="select" value={ref.namespace as Namespace} />
          {ref.version && <Field label="Version" kind="select" value={`v${ref.version}`} />}

          <SectionHeader>EXECUTION</SectionHeader>
          <Field
            label="Retry attempts"
            kind="stepper"
            value={typeof ref.retry === 'number' ? ref.retry : 0}
            min={0}
            onValueChange={(v) => {
              const n = Number(v);
              patchEvent(ref.id, { retry: n === 0 ? undefined : n });
            }}
            state={typeof ref.retry === 'number' && ref.retry < 2 ? 'error' : 'default'}
            hint="off · min 2 when set"
          />

          <AttributeSection store={store} eventId={ref.id} attributes={ref.attributes} />

          {ref.meta && ref.meta.metaAttributes.length > 0 && (
            <>
              <SectionHeader>META-LEVEL ATTRIBUTES</SectionHeader>
              <div className="flex flex-col gap-1.5">
                {ref.meta.metaAttributes.map((a) => (
                  <div
                    key={a.name}
                    className="flex items-center gap-2 rounded-[6px] border border-keyword/30 bg-keyword-tint px-3 py-2"
                  >
                    <span className="font-mono text-[10.5px] text-code">{a.name}</span>
                    <span className="font-mono text-[10.5px] text-tertiary">=</span>
                    <span className="flex-1 truncate font-mono text-[10.5px] text-template">
                      {emitExpr(a.value)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="-mt-2 font-sans text-[9px] leading-[14px] text-tertiary">
                Meta-level attributes configure the wrapper. Template-level ones above are
                inherited by every instance the mode creates.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-[14px] py-3">
          {definition ? (
            <DefinitionEditor
              filename={definition.filename}
              source={definition.source}
              eventName={ref.name}
              onChange={(next) => setDefinitionSource(definition.filename, next)}
            />
          ) : (
            <Callout tone="info" title="No definition linked" action="Add event definition →">
              {ref.namespace === 'local'
                ? 'A local event needs a class deriving from EventBase before the pipeline can run.'
                : `${ref.namespace}::${ref.name} is resolved from the registry, so its Python lives with the package.`}
            </Callout>
          )}
        </div>
      )}
    </aside>
  );
}

/**
 * Template-level attributes, editable. Values go through the expression editor
 * rather than a plain text field, because an attribute value is a Pointy
 * expression and the grammar is small enough to check as you type.
 */
function AttributeSection({
  store,
  eventId,
  attributes,
}: {
  store: PointyDocumentStore;
  eventId: string;
  attributes: Attr[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  return (
    <>
      <SectionHeader action="＋ add" onAction={() => setAdding(true)}>
        ATTRIBUTES
      </SectionHeader>

      <div className="flex flex-col gap-1.5">
        {attributes.map((a) =>
          editing === a.name ? (
            <ExpressionEditor
              key={a.name}
              name={a.name}
              value={a.value}
              onCancel={() => setEditing(null)}
              onCommit={(next) => {
                store.upsertAttribute(eventId, a.name, next);
                setEditing(null);
              }}
            />
          ) : (
            <div
              key={a.name}
              className="flex items-center gap-2 rounded-[6px] border border-edge bg-bg-sunken px-3 py-2"
            >
              <span className="font-mono text-[10.5px] text-code">{a.name}</span>
              <span className="font-mono text-[10.5px] text-tertiary">=</span>
              <button
                type="button"
                onClick={() => setEditing(a.name)}
                className="flex-1 cursor-pointer truncate text-left font-mono text-[10.5px] text-template hover:underline"
              >
                {emitExpr(a.value)}
              </button>
              <button
                type="button"
                onClick={() => store.deleteAttribute(eventId, a.name)}
                aria-label={`Remove ${a.name}`}
                className="cursor-pointer font-sans text-[11px] text-tertiary hover:text-danger"
              >
                ✕
              </button>
            </div>
          ),
        )}

        {attributes.length === 0 && !adding && (
          <p className="font-sans text-[9.5px] text-tertiary">No attributes set.</p>
        )}

        {adding && (
          <div className="flex items-center gap-2 rounded-[6px] border border-seq/60 bg-bg-sunken px-3 py-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setAdding(false);
                  setNewName('');
                }
                if (e.key === 'Enter' && newName.trim()) {
                  store.upsertAttribute(eventId, newName.trim(), {
                    kind: 'literal',
                    value: '',
                  });
                  setEditing(newName.trim());
                  setAdding(false);
                  setNewName('');
                }
              }}
              placeholder="attribute_name"
              aria-label="New attribute name"
              className="flex-1 bg-transparent font-mono text-[10.5px] text-code outline-none placeholder:text-disabled"
            />
            <Button
              kind="ghost"
              onClick={() => {
                setAdding(false);
                setNewName('');
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Nothing selected: the file's own properties — Figma screen 13.
 *
 * Variables and sources are edited here and nowhere else. A source is what
 * makes a non-local namespace resolvable, so adding one is the fix the
 * `unresolved-namespace` diagnostic is asking for.
 */
function PipelineInspector({ store }: { store: PointyDocumentStore }) {
  const { doc } = store;
  const mode = doc.directives.mode ?? 'CFG';

  /** Which variable is open in the expression editor; '' means a new one. */
  const [editingVariable, setEditingVariable] = useState<string | null>(null);
  const [newVariableName, setNewVariableName] = useState('');
  const [editingSource, setEditingSource] = useState<string | null>(null);

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-edge bg-bg-surface">
      <div className="border-l-2 border-seq px-[14px] pt-4 pb-1">
        <h2 className="font-mono text-[14px] font-medium text-primary">{doc.name}</h2>
      </div>
      <p className="px-[14px] pb-3 font-mono text-[9.4px] text-tertiary">
        <span className="text-seq">PIPELINE</span> · {mode} · {doc.sources.length} sources
      </p>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[14px] py-4">
        <SectionHeader>DIRECTIVES</SectionHeader>
        <div>
          <p className="mb-1.5 font-sans text-[10.5px] text-secondary">Mode</p>
          <div className="flex gap-0.5 rounded-[6px] border border-edge bg-bg-sunken p-[3px]">
            {(['DAG', 'CFG'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => store.setMode(m)}
                className={cn(
                  'flex-1 cursor-pointer rounded-[4px] py-1.5 font-mono text-[10.5px] font-medium',
                  mode === m ? 'bg-seq-tint text-seq' : 'text-tertiary hover:text-secondary',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-sans text-[9.5px] leading-[15px] text-tertiary">
            CFG lets the same event appear more than once — how loops, retries and agent
            handoffs are expressed. DAG forbids reuse.
          </p>
        </div>

        <SectionHeader
          action="＋ add"
          onAction={() => {
            setNewVariableName(nextVariableName(doc.variables.map((v) => v.name)));
            setEditingVariable('');
          }}
        >
          VARIABLES
        </SectionHeader>

        <div className="flex flex-col gap-1 rounded-[7px] border border-edge bg-bg-sunken px-3 py-2.5">
          {doc.variables.length === 0 && editingVariable === null && (
            <p className="font-sans text-[9.5px] text-tertiary">None declared.</p>
          )}

          {doc.variables.map((v) =>
            editingVariable === v.name ? (
              <ExpressionEditor
                key={v.name}
                name={`@${v.name}`}
                value={v.value}
                onCommit={(next) => {
                  store.upsertVariable(v.name, next);
                  setEditingVariable(null);
                }}
                onCancel={() => setEditingVariable(null)}
              />
            ) : (
              <div key={v.name} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingVariable(v.name)}
                  className="flex-1 cursor-pointer truncate text-left font-mono text-[10.5px]"
                >
                  <span className="text-accent">@{v.name}</span>
                  <span className="text-code"> = </span>
                  <span className="text-template">{emitExpr(v.value)}</span>
                </button>
                <RemoveButton
                  label={`Remove variable ${v.name}`}
                  onClick={() => store.deleteVariable(v.name)}
                />
              </div>
            ),
          )}

          {editingVariable === '' && (
            <div className="flex flex-col gap-1.5">
              <input
                value={newVariableName}
                onChange={(e) => setNewVariableName(e.target.value)}
                aria-label="New variable name"
                className="h-7 rounded-[5px] border border-edge bg-bg-surface px-2 font-mono text-[10.5px] text-accent outline-none focus:border-seq"
              />
              <ExpressionEditor
                name={`@${newVariableName || 'name'}`}
                value={{ kind: 'literal', value: null }}
                onCommit={(next) => {
                  const name = newVariableName.trim();
                  if (name) store.upsertVariable(name, next);
                  setEditingVariable(null);
                }}
                onCancel={() => setEditingVariable(null)}
              />
            </div>
          )}
        </div>

        <SectionHeader action="＋ add" onAction={() => setEditingSource('')}>
          SOURCES
        </SectionHeader>

        <div className="flex flex-col gap-1 rounded-[7px] border border-edge bg-bg-sunken px-3 py-2.5">
          {doc.sources.length === 0 && editingSource === null && (
            <p className="font-sans text-[9.5px] text-tertiary">
              None registered. A <span className="font-mono">hub::</span>,{' '}
              <span className="font-mono">pypi::</span> or{' '}
              <span className="font-mono">github::</span> event cannot resolve without one.
            </p>
          )}

          {doc.sources.map((s) =>
            editingSource === s.package ? (
              <SourceForm
                key={s.package}
                source={s}
                onCommit={(next) => {
                  store.upsertSource(next, s.package);
                  setEditingSource(null);
                }}
                onCancel={() => setEditingSource(null)}
              />
            ) : (
              <div key={s.package} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSource(s.package)}
                    className="flex flex-1 cursor-pointer gap-2 truncate text-left font-mono text-[10px]"
                  >
                    <span className="w-12 shrink-0 text-flow">{s.namespace}</span>
                    <span className="flex-1 truncate text-secondary">{s.package}</span>
                    <span className="text-tertiary">v{s.version}</span>
                  </button>
                  <RemoveButton
                    label={`Remove source ${s.package}`}
                    onClick={() => store.deleteSource(s.package)}
                  />
                </div>
                {s.namespace === 'hub' && <GrantRow packageName={s.package} />}
              </div>
            ),
          )}

          {editingSource === '' && (
            <SourceForm
              onCommit={(next) => {
                store.upsertSource(next);
                setEditingSource(null);
              }}
              onCancel={() => setEditingSource(null)}
            />
          )}
        </div>

        <div className="mt-2">
          <Chip tone="neutral">Select a node to inspect it</Chip>
        </div>
      </div>
    </aside>
  );
}

/**
 * Grant state for one hub package — the entry point to screen 19.
 *
 * A hub source names a registry; this says whether the user has authorised
 * access to it, and lets them grant or revoke. The grant is per user, so it is
 * fetched rather than read off the document.
 */
function GrantRow({ packageName }: { packageName: string }) {
  const user = useSession();
  const pathname = usePathname();
  const [grant, setGrant] = useState<GrantView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Signed out there is nothing to ask about — a grant belongs to a person.
    if (!user) {
      setLoaded(true);
      return;
    }
    let live = true;
    api
      .listGrants()
      .then(({ grants }) => {
        if (!live) return;
        setGrant(grants.find((g) => g.package === packageName) ?? null);
        setLoaded(true);
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [packageName, user]);

  async function revoke() {
    await api.revokeGrant(packageName).catch(() => undefined);
    setGrant(null);
  }

  if (!loaded) return null;

  // Reaching EventHub is one of the two things that needs an account. Say what
  // it needs rather than opening a modal that will fail at the last step.
  if (!user) {
    return (
      <div className="flex items-center gap-2 pl-[3.5rem]">
        <span className="font-sans text-[9px] text-tertiary">not connected</span>
        <span className="flex-1" />
        <Link
          href={signInHref(pathname ?? '/')}
          className="font-sans text-[9px] text-seq hover:underline"
        >
          Sign in to connect →
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 pl-[3.5rem]">
        {grant ? (
          <>
            <span className="font-sans text-[9px] text-keyword">
              ✓ authorised · {grant.scopes.join(', ')}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="cursor-pointer font-sans text-[9px] text-seq hover:underline"
            >
              change
            </button>
            <button
              type="button"
              onClick={revoke}
              className="cursor-pointer font-sans text-[9px] text-tertiary hover:text-danger"
            >
              revoke
            </button>
          </>
        ) : (
          <>
            <span className="font-sans text-[9px] text-tertiary">not connected</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="cursor-pointer font-sans text-[9px] text-seq hover:underline"
            >
              Authorise EventHub →
            </button>
          </>
        )}
      </div>

      {open && (
        <AuthoriseEventHub
          packageName={packageName}
          existing={grant ?? undefined}
          onClose={() => setOpen(false)}
          onGranted={(next) => {
            setGrant(next);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

/** `@var1`, `@var2`, … — a name that is free, so the editor opens on something. */
function nextVariableName(taken: string[]): string {
  for (let n = 1; ; n += 1) {
    const candidate = `var${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="shrink-0 cursor-pointer px-1 font-sans text-[11px] text-tertiary hover:text-danger"
    >
      ✕
    </button>
  );
}

const REGISTRY_NAMESPACES = ['hub', 'pypi', 'github'] as const;

/**
 * A registry source is three plain strings, so it gets plain inputs rather than
 * the expression editor. The namespace is a fixed set — `local` is implicit and
 * can never be registered.
 */
function SourceForm({
  source,
  onCommit,
  onCancel,
}: {
  source?: RegistrySource;
  onCommit: (next: RegistrySource) => void;
  onCancel: () => void;
}) {
  const [namespace, setNamespace] = useState<RegistrySource['namespace']>(
    source?.namespace ?? 'hub',
  );
  const [pkg, setPkg] = useState(source?.package ?? '');
  const [version, setVersion] = useState(source?.version ?? '');

  const complete = pkg.trim() !== '' && version.trim() !== '';

  function commit() {
    if (!complete) return;
    onCommit({ namespace, package: pkg.trim(), version: version.trim() });
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-[6px] border border-edge-strong bg-bg-raised p-2">
      <div className="flex gap-1">
        {REGISTRY_NAMESPACES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNamespace(n)}
            className={cn(
              'flex-1 cursor-pointer rounded-[4px] py-1 font-mono text-[9.5px]',
              namespace === n ? 'bg-flow-tint text-flow' : 'text-tertiary hover:text-secondary',
            )}
          >
            {n}
          </button>
        ))}
      </div>

      <input
        value={pkg}
        onChange={(e) => setPkg(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
          e.stopPropagation();
        }}
        placeholder="corp/approved-events"
        aria-label="Package"
        className="h-7 rounded-[5px] border border-edge bg-bg-sunken px-2 font-mono text-[10px] text-secondary outline-none placeholder:text-disabled focus:border-seq"
      />
      <input
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
          e.stopPropagation();
        }}
        placeholder="3.0.0"
        aria-label="Version"
        className="h-7 rounded-[5px] border border-edge bg-bg-sunken px-2 font-mono text-[10px] text-secondary outline-none placeholder:text-disabled focus:border-seq"
      />

      <div className="flex gap-2 pt-0.5">
        <Button kind="ghost" className="h-7 flex-1 px-0" onClick={commit} disabled={!complete}>
          {source ? 'Update' : 'Add'}
        </Button>
        <Button kind="secondary" className="h-7 flex-1 px-0" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer border-b-2 pb-2 font-sans text-[11.5px]',
        active
          ? 'border-seq font-medium text-primary'
          : 'border-transparent text-tertiary hover:text-secondary',
      )}
    >
      {children}
    </button>
  );
}
