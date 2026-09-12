'use client';

import type { EventRef, Namespace } from '../../types/pointy';
import { cn } from '../../lib/cn';
import { emitExpr } from '../../lib/pointy/emit';

/** State variants of the Node component set — Figma 61:5722. */
export type NodeState =
  | 'default'
  | 'selected'
  | 'error'
  | 'failed'
  | 'skipped'
  | 'reused';

export const NODE_WIDTH = 200;

export const SHELL_STATE: Record<NodeState, string> = {
  default: 'border-edge-strong',
  selected: 'border-seq border-2 shadow-[0_0_16px_rgba(0,229,255,0.35)]',
  error: 'border-danger border-[1.5px] shadow-[0_0_16px_rgba(255,95,87,0.30)]',
  failed: 'border-danger/70 border-[1.5px]',
  skipped: 'border-edge-strong opacity-45',
  reused: 'border-flow/85 border-[1.5px] border-dashed',
};

const NAMESPACE_STYLE: Record<Namespace, { tint: string; text: string; glyph: string }> = {
  local: { tint: 'bg-accent-tint', text: 'text-accent', glyph: '✎' },
  hub: { tint: 'bg-seq-tint', text: 'text-seq', glyph: '◇' },
  pypi: { tint: 'bg-template-tint', text: 'text-template', glyph: '◈' },
  github: { tint: 'bg-flow-tint', text: 'text-flow', glyph: '⌥' },
};

/** The coloured 3px bar across the top of every node. */
export function AccentBar({ tone }: { tone: string }) {
  return <div className={cn('h-[3px] w-full rounded-t-[8px]', tone)} />;
}

export function SourceBadge({ namespace }: { namespace: Namespace }) {
  const s = NAMESPACE_STYLE[namespace];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[3px] rounded-[3px] px-[5px] py-[2px]',
        'font-mono text-[8.6px] leading-none font-medium',
        s.tint,
        s.text,
      )}
    >
      <span aria-hidden>{s.glyph}</span>
      {namespace}
    </span>
  );
}

export function ExecutorBadge({ label = '{}' }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-[3px] bg-keyword-tint px-[4px] py-[2px] font-mono text-[8.6px] leading-none font-medium text-keyword">
      {label}
    </span>
  );
}

/** Run status, shown in the meta row: `✕ failed 1.4s`, `⊘ skipped`, `↺ 2nd visit`. */
export function StatusNote({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={cn('font-mono text-[8.6px] leading-none font-medium', tone)}>
      {children}
    </span>
  );
}

export function MetaRow({ children }: { children: React.ReactNode }) {
  return <div className="flex w-full items-center gap-1.5">{children}</div>;
}

/** `MAP` + `<Parse>` for a meta event, or just the name. */
export function NodeTitle({ ref: eventRef }: { ref: EventRef }) {
  if (eventRef.meta) {
    return (
      <div className="flex items-center gap-[5px] font-mono text-[13px] leading-[17px] font-medium">
        <span className="text-keyword">{eventRef.meta.mode}</span>
        <span className="text-template">&lt;{eventRef.meta.template}&gt;</span>
      </div>
    );
  }
  return (
    <div className="font-mono text-[13px] leading-[17px] font-medium text-primary">
      {eventRef.name}
    </div>
  );
}

/** `[executor="celery", timeout=60]` — hidden when there are none. */
export function AttributeLine({ ref: eventRef }: { ref: EventRef }) {
  const attrs = [...(eventRef.meta?.metaAttributes ?? []), ...eventRef.attributes];
  if (attrs.length === 0) return null;
  return (
    <div className="truncate font-mono text-[10px] leading-[13px] text-code">
      [{attrs.map((a) => `${a.name}=${emitExpr(a.value)}`).join(', ')}]
    </div>
  );
}

export function VersionLabel({ version }: { version?: string }) {
  if (!version) return null;
  return <span className="font-mono text-[9.4px] text-tertiary">v{version}</span>;
}
