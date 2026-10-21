'use client';

import { useState } from 'react';
import type { MetaMode, Namespace } from '../../types/pointy';
import { cn } from '../../lib/cn';
import { Button } from '../ui';
import { DRAG_MIME, type PaletteDragPayload } from '../canvas/dragPayload';

/** Attach the payload the canvas expects on drop. */
function dragProps(payload: PaletteDragPayload) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'copy';
    },
  };
}

/**
 * The EventHub registry — Figma component set 61:5841 (PaletteTile).
 *
 * The 3px left bar is the namespace colour and is the fastest read on the
 * screen. `blank` is the dashed tile pinned above the categories: it is the
 * canvas-first route to a custom event, and the only tile with no version.
 *
 * Phase 3 renders it. Dragging tiles onto the canvas is phase 4.
 */

interface Tile {
  name: string;
  meta: string;
  namespace: Namespace;
}

interface Category {
  name: string;
  count: number;
  tiles: Tile[];
}

const META_EVENTS = ['MAP', 'FILTER', 'REDUCE', 'FOREACH', 'FLATMAP', 'FANOUT'];

const CATEGORIES: Category[] = [
  {
    name: 'EXTRACT',
    count: 6,
    tiles: [
      { name: 'RestApiExtract', meta: 'Extract · v2.1.0', namespace: 'hub' },
      { name: 'KafkaIngest', meta: 'Extract · v1.8.2', namespace: 'hub' },
      { name: 'S3Fetch', meta: 'Extract · v0.9.1', namespace: 'hub' },
    ],
  },
  {
    name: 'TRANSFORM',
    count: 9,
    tiles: [
      { name: 'ValidateProfile', meta: 'Transform · in this file', namespace: 'local' },
      { name: 'NormalizeSchema', meta: 'Transform · v3.0.0', namespace: 'pypi' },
    ],
  },
  {
    name: 'AI & AGENTS',
    count: 5,
    tiles: [
      { name: 'ClassifyIntent', meta: 'AI & Agents · v1.2.0', namespace: 'hub' },
      { name: 'RouteAgent', meta: 'AI & Agents · v1.2.0', namespace: 'github' },
    ],
  },
];

const ACCENT: Record<Namespace, string> = {
  local: 'bg-accent',
  hub: 'bg-seq',
  pypi: 'bg-template',
  github: 'bg-flow',
};

const BADGE: Record<Namespace, { tint: string; text: string; glyph: string }> = {
  local: { tint: 'bg-accent-tint', text: 'text-accent', glyph: '✎' },
  hub: { tint: 'bg-seq-tint', text: 'text-seq', glyph: '◇' },
  pypi: { tint: 'bg-template-tint', text: 'text-template', glyph: '◈' },
  github: { tint: 'bg-flow-tint', text: 'text-flow', glyph: '⌥' },
};

/**
 * The panel toggle: a bordered square with three lines — the hamburger every
 * platform uses for show/hide-a-panel. The first version was an 8px ◀ glyph,
 * which is punctuation rather than a control: too small to spot, too faint
 * to trust. Labels carry the direction; the icon only says "panel".
 */
function PanelToggleButton({
  collapsed,
  onClick,
}: {
  /** Which action the press performs — sets the label, not the icon. */
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? 'Expand registry panel' : 'Collapse registry panel'}
      title={collapsed ? 'Expand registry panel' : 'Collapse registry panel'}
      className={cn(
        'grid h-[22px] w-[22px] shrink-0 cursor-pointer place-items-center rounded-[6px]',
        'border border-edge bg-bg-sunken text-tertiary',
        'hover:border-edge-strong hover:text-secondary',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seq',
      )}
    >
      <span aria-hidden className="flex flex-col gap-[2.5px]">
        <span className="h-[1.5px] w-[11px] rounded-full bg-current" />
        <span className="h-[1.5px] w-[11px] rounded-full bg-current" />
        <span className="h-[1.5px] w-[11px] rounded-full bg-current" />
      </span>
    </button>
  );
}

export function Palette({
  onNewEvent,
  onCollapse,
}: {
  onNewEvent?: () => void;
  onCollapse?: () => void;
}) {
  const [query, setQuery] = useState('');

  const categories = CATEGORIES.map((c) => ({
    ...c,
    tiles: c.tiles.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())),
  })).filter((c) => c.tiles.length > 0 || query === '');

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-edge bg-bg-surface">
      <div className="flex items-center gap-2 px-[14px] pt-[18px] pb-3">
        <span className="ds-section-label">EVENTHUB REGISTRY</span>
        <span className="font-mono text-[9.4px] text-tertiary">32</span>
        <span className="flex-1" />
        {onCollapse && <PanelToggleButton collapsed={false} onClick={onCollapse} />}
      </div>

      <div className="px-[14px] pb-3">
        <div className="flex h-8 items-center gap-2 rounded-[7px] border border-edge bg-bg-sunken px-3">
          <span aria-hidden className="font-mono text-[10px] text-tertiary">
            ⌕
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search components…"
            aria-label="Search the registry"
            className="w-full bg-transparent font-sans text-[10.5px] text-primary outline-none placeholder:text-tertiary"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[14px] pb-4">
        <div className="mb-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="ds-section-label">META EVENTS</span>
            <span className="font-mono text-[9.4px] text-tertiary">6</span>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1">
            {META_EVENTS.map((m) => (
              <button
                key={m}
                type="button"
                {...dragProps({
                  name: m,
                  namespace: 'local',
                  // Dropping a mode gives an unbound wrapper; the template is
                  // named in place, like any other draft.
                  meta: { mode: m as MetaMode, template: 'Template', metaAttributes: [] },
                })}
                className="cursor-grab text-left font-mono text-[10px] font-medium text-keyword hover:underline"
              >
                {m}
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-mono text-[9px] text-tertiary">
            wrap an event · MODE&lt;Template&gt;[attrs]
          </p>
        </div>

        <BlankTile />

        {categories.map((c) => (
          <section key={c.name} className="mt-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span aria-hidden className="font-sans text-[8px] text-tertiary">
                ▼
              </span>
              <span className="ds-section-label">{c.name}</span>
              <span className="font-mono text-[9.4px] text-tertiary">{c.count}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {c.tiles.map((t) => (
                <PaletteTile key={t.name} tile={t} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="border-t border-edge p-[14px]">
        <Button kind="ghost" className="w-full" onClick={onNewEvent}>
          ＋ New custom event
        </Button>
      </div>
    </aside>
  );
}

/**
 * The registry collapsed: a sliver of rail whose only job is the way back.
 * The toggle lives in the palette header when open and here when closed, so
 * the control is always one click away and never needs hunting for. Same
 * square button as when open — only the label flips.
 */
export function PaletteRail({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="flex w-9 shrink-0 flex-col items-center border-r border-edge bg-bg-surface pt-4">
      <PanelToggleButton collapsed onClick={onExpand} />
    </div>
  );
}

function PaletteTile({ tile }: { tile: Tile }) {
  const badge = BADGE[tile.namespace];
  return (
    <div
      role="button"
      tabIndex={0}
      {...dragProps({
        name: tile.name,
        namespace: tile.namespace,
        version: tile.meta.match(/v([\d.]+)/)?.[1],
      })}
      className={cn(
        'flex cursor-grab overflow-hidden rounded-[6px] border border-edge-subtle bg-bg-raised',
        'hover:border-edge-strong',
      )}
    >
      <div className={cn('w-[2px] shrink-0', ACCENT[tile.namespace])} />
      <div className="flex flex-1 items-center gap-2 px-[9px] py-2">
        <span aria-hidden className="font-sans text-[11px] text-tertiary">
          ⠿
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11.5px] font-medium text-primary">
            {tile.name}
          </p>
          <p className="truncate font-sans text-[10px] text-tertiary">{tile.meta}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-[3px] rounded-[3px] px-[5px] py-[3px]',
            'font-mono text-[8.6px] leading-none font-medium',
            badge.tint,
            badge.text,
          )}
        >
          <span aria-hidden>{badge.glyph}</span>
          {tile.namespace}
        </span>
      </div>
    </div>
  );
}

function BlankTile() {
  return (
    <div
      role="button"
      tabIndex={0}
      {...dragProps({ name: 'NewEvent', namespace: 'local' })}
      className="flex cursor-grab items-center gap-2 rounded-[6px] border border-dashed border-seq/60 px-[9px] py-2"
    >
      <span aria-hidden className="font-sans text-[11px] text-seq/80">
        ＋
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11.5px] font-medium text-seq">Blank event</p>
        <p className="font-sans text-[10px] text-tertiary">Drag onto the canvas to name it</p>
      </div>
    </div>
  );
}
