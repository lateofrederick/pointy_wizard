'use client';

import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  glyph?: string;
  destructive?: boolean;
  /**
   * Present when the action is structurally impossible here. The menu dims the
   * row and shows the reason — a rule the canvas enforces should say why, not
   * just fail. Figma screen 17.
   */
  disabledReason?: string;
  onSelect?: () => void;
}

export interface NodeContextMenuProps {
  title: string;
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function NodeContextMenu({ title, items, position, onClose }: NodeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const blocked = items.find((i) => i.disabledReason);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: position.x, top: position.y }}
      className="absolute z-50 w-[210px] rounded-[8px] border border-edge-strong bg-bg-surface py-1.5 shadow-modal"
    >
      <p className="px-3 pb-1.5 font-mono text-[9.4px] text-tertiary">{title}</p>

      {items.map((item) => (
        <div key={item.id}>
          {item.id === '__sep' ? (
            <div className="my-1 border-t border-edge-subtle" />
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={!!item.disabledReason}
              aria-disabled={!!item.disabledReason}
              onClick={() => {
                item.onSelect?.();
                onClose();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-[7px] text-left font-sans text-[11.5px]',
                item.disabledReason
                  ? 'cursor-not-allowed text-disabled'
                  : item.destructive
                    ? 'cursor-pointer text-danger hover:bg-danger-tint'
                    : 'cursor-pointer text-secondary hover:bg-neutral-tint hover:text-primary',
              )}
            >
              {item.glyph && (
                <span aria-hidden className="w-3 font-mono text-[10px]">
                  {item.glyph}
                </span>
              )}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="font-mono text-[9.5px] text-tertiary">{item.shortcut}</span>
              )}
            </button>
          )}
        </div>
      ))}

      {blocked && (
        <div className="mx-2 mt-1.5 rounded-[6px] border border-warn/35 bg-warn-tint px-2.5 py-2">
          <p className="font-sans text-[9.5px] font-medium text-warn">
            ⊘ {blocked.label} isn’t available here
          </p>
          <p className="mt-1 font-sans text-[9px] leading-[14px] text-secondary">
            {blocked.disabledReason}
          </p>
        </div>
      )}
    </div>
  );
}
