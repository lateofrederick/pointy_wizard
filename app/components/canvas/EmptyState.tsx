'use client';

/**
 * The empty canvas — Figma screen 14 (`36:2792`).
 *
 * Three gesture hints rather than one big "Add event" button: the canvas has
 * three distinct ways in, and naming them is what teaches the model. The
 * emitted file is still real Pointy at this point — it just has no events.
 */
const HINTS = [
  {
    glyph: '⠿',
    title: 'Drag an event in',
    body: 'Pull any tile from the registry on the left onto the canvas, or start from Blank event and name it in place.',
  },
  {
    glyph: '→',
    title: 'Connect two events',
    body: 'Drag from one node’s right port to another’s left. New connections are sequential; change the operator by selecting the wire.',
  },
  {
    glyph: '◆',
    title: 'Branch on a descriptor',
    body: 'Drop a second wire on a node to turn it into a branch. 0 is success, 1 is failure, 2–9 are yours.',
  },
];

export function EmptyState() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-bg-canvas px-8">
      <div className="max-w-[560px]">
        <h2 className="font-sans text-[19px] font-medium text-primary">
          Nothing on the canvas yet
        </h2>
        <p className="mt-2 font-sans text-[12px] leading-[19px] text-secondary">
          A pipeline is events joined by typed connections. The connection carries the
          execution model, so the shape you draw here is the program that runs.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {HINTS.map((h) => (
            <div
              key={h.title}
              className="flex gap-3 rounded-[8px] border border-edge-subtle bg-bg-surface px-4 py-3"
            >
              <span
                aria-hidden
                className="mt-[1px] font-mono text-[13px] leading-none text-seq"
              >
                {h.glyph}
              </span>
              <div>
                <p className="font-sans text-[11.5px] font-medium text-primary">{h.title}</p>
                <p className="mt-1 font-sans text-[10px] leading-[16px] text-tertiary">
                  {h.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
