/**
 * Wire geometry.
 *
 * Encodes the execution-model drawing settled in design (docs/ui-migration.md
 * §6). The numbers here are not arbitrary — they were tuned against the Figma
 * canvases and each one fixes a specific legibility problem:
 *
 *   PULLBACK    the arrow tip stops at the port's ring instead of vanishing
 *               under the 10px port dot
 *   HEAD_LENGTH a head small enough not to dominate a 72px wire, large enough
 *               to read at 92% zoom
 *   handles     follow the port's axis, so a wire leaves a side port sideways
 *               and a top port downwards — anything else reads as broken
 */

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface Point {
  x: number;
  y: number;
}

export const PORT_RADIUS = 5;
/** Tip stops one pixel clear of the port ring. */
export const PULLBACK = PORT_RADIUS + 1;
export const HEAD_LENGTH = 10.5;
export const HEAD_HALF_WIDTH = 4.4;
/** Perpendicular offset of each lane in a `||` pair. */
export const LANE_OFFSET = 5;
/** Where the chevrons sit along a streaming wire. */
export const CHEVRON_TS = [0.35, 0.7] as const;

/** Direction a wire travels as it *leaves* a port on this side. */
function outward(side: Side): Point {
  switch (side) {
    case 'right':
      return { x: 1, y: 0 };
    case 'left':
      return { x: -1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'top':
      return { x: 0, y: -1 };
  }
}

/** Direction a wire travels as it *arrives* at a port on this side. */
function inward(side: Side): Point {
  const o = outward(side);
  return { x: -o.x, y: -o.y };
}

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (p: Point, k: number): Point => ({ x: p.x * k, y: p.y * k });
const perp = (p: Point): Point => ({ x: -p.y, y: p.x });

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function cubicTangent(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const d = {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
  const len = Math.hypot(d.x, d.y) || 1;
  return { x: d.x / len, y: d.y / len };
}

export interface WireInput {
  source: Point;
  target: Point;
  sourceSide: Side;
  targetSide: Side;
}

export interface Chevron {
  /** `M a L b L c` — an open chevron straddling the strand. */
  d: string;
}

export interface WireGeometry {
  /** Single strand. Used by sequential and streaming. */
  path: string;
  /** The two lanes of a `||` pair, split and rejoined. */
  lanes: [string, string];
  /** Filled triangle, apex at the port ring. */
  head: string;
  chevrons: Chevron[];
}

export function wireGeometry({
  source,
  target,
  sourceSide,
  targetSide,
}: WireInput): WireGeometry {
  const dirOut = outward(sourceSide);
  const dirIn = inward(targetSide);

  // The tip sits short of the port centre so the head is not buried under the
  // port dot, and the strand stops short of the tip so the head reads solid.
  const apex = add(target, scale(dirIn, -PULLBACK));
  const strandEnd = add(apex, scale(dirIn, -HEAD_LENGTH));

  const span = Math.hypot(strandEnd.x - source.x, strandEnd.y - source.y);
  const handle = Math.max(40, span * 0.45);

  const p0 = source;
  const p1 = add(source, scale(dirOut, handle));
  const p2 = add(strandEnd, scale(dirIn, -handle));
  const p3 = strandEnd;

  const path = `M${p0.x} ${p0.y} C${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;

  // `||` splits into two lanes through the middle and converges on one head,
  // so both ends still attach to a single port.
  const axis = perp(dirIn);
  const lane = (sign: number) => {
    const o = scale(axis, LANE_OFFSET * sign);
    return (
      `M${p0.x} ${p0.y} ` +
      `C${p1.x + o.x} ${p1.y + o.y} ${p2.x + o.x} ${p2.y + o.y} ${p3.x} ${p3.y}`
    );
  };

  const base = add(apex, scale(dirIn, -HEAD_LENGTH));
  const across = scale(perp(dirIn), HEAD_HALF_WIDTH);
  const head =
    `M${apex.x} ${apex.y} ` +
    `L${base.x + across.x} ${base.y + across.y} ` +
    `L${base.x - across.x} ${base.y - across.y} Z`;

  const chevrons = CHEVRON_TS.map((t) => {
    const p = cubic(p0, p1, p2, p3, t);
    const u = cubicTangent(p0, p1, p2, p3, t);
    const v = perp(u);
    const backA = add(p, add(scale(u, -3.6), scale(v, 4)));
    const backB = add(p, add(scale(u, -3.6), scale(v, -4)));
    return { d: `M${backA.x} ${backA.y} L${p.x} ${p.y} L${backB.x} ${backB.y}` };
  });

  return { path, lanes: [lane(1), lane(-1)], head, chevrons };
}

/** Midpoint of the strand — where an operator label would sit if we keep one. */
export function wireMidpoint(input: WireInput): Point {
  const { source, target, sourceSide, targetSide } = input;
  const dirOut = outward(sourceSide);
  const dirIn = inward(targetSide);
  const apex = add(target, scale(dirIn, -PULLBACK));
  const strandEnd = add(apex, scale(dirIn, -HEAD_LENGTH));
  const span = Math.hypot(strandEnd.x - source.x, strandEnd.y - source.y);
  const handle = Math.max(40, span * 0.45);
  return cubic(
    source,
    add(source, scale(dirOut, handle)),
    add(strandEnd, scale(dirIn, -handle)),
    strandEnd,
    0.5,
  );
}
