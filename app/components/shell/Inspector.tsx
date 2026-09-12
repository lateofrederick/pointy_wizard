'use client';

import { useState } from 'react';
import type { PointyDocumentStore } from '../../hooks/usePointyDocument';
import type { Attr, Namespace } from '../../types/pointy';
import { emitExpr } from '../../lib/pointy/emit';
import { cn } from '../../lib/cn';
import { Button, Callout, Chip, Field, SectionHeader } from '../ui';
import { DefinitionEditor } from '../editor/DefinitionEditor';
import { ConnectionInspector } from './ConnectionInspector';
import { ExpressionEditor } from './ExpressionEditor';

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

/** Nothing selected: the file's own properties — Figma screen 13. */
function PipelineInspector({ store }: { store: PointyDocumentStore }) {
  const { doc } = store;
  const mode = doc.directives.mode ?? 'CFG';

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
                onClick={() => store.setDoc({ ...doc, directives: { ...doc.directives, mode: m } })}
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

        <SectionHeader action="＋ add">VARIABLES</SectionHeader>
        <div className="rounded-[7px] border border-edge bg-bg-sunken px-3 py-2.5">
          {doc.variables.length === 0 ? (
            <p className="font-sans text-[9.5px] text-tertiary">None declared.</p>
          ) : (
            doc.variables.map((v) => (
              <p key={v.name} className="font-mono text-[10.5px]">
                <span className="text-accent">@{v.name}</span>
                <span className="text-code"> = </span>
                <span className="text-template">{emitExpr(v.value)}</span>
              </p>
            ))
          )}
        </div>

        <SectionHeader action="＋ add">SOURCES</SectionHeader>
        <div className="flex flex-col gap-1 rounded-[7px] border border-edge bg-bg-sunken px-3 py-2.5">
          {doc.sources.map((s) => (
            <p key={s.package} className="flex gap-2 font-mono text-[10px]">
              <span className="w-12 shrink-0 text-flow">{s.namespace}</span>
              <span className="flex-1 truncate text-secondary">{s.package}</span>
              <span className="text-tertiary">v{s.version}</span>
            </p>
          ))}
        </div>

        <div className="mt-2">
          <Chip tone="neutral">Select a node to inspect it</Chip>
        </div>
      </div>
    </aside>
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
