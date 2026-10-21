import { describe, expect, it } from 'vitest';
import {
  HEAD_LENGTH,
  PULLBACK,
  wireGeometry,
  wireMidpoint,
  type WireInput,
} from '../geometry';

/** Pull the numbers back out of a path string so the maths can be asserted. */
function numbers(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

const horizontal: WireInput = {
  source: { x: 100, y: 200 },
  target: { x: 400, y: 200 },
  sourceSide: 'right',
  targetSide: 'left',
};

describe('wireGeometry — the arrowhead', () => {
  it('stops the tip short of the port centre so it clears the port dot', () => {
    const { head } = wireGeometry(horizontal);
    const [apexX, apexY] = numbers(head);
    // Arriving travelling +x, so the apex sits PULLBACK to the left of target.
    expect(apexX).toBeCloseTo(400 - PULLBACK);
    expect(apexY).toBeCloseTo(200);
  });

  it('points the head along the arrival axis, not the straight line', () => {
    const { head } = wireGeometry({
      source: { x: 100, y: 100 },
      target: { x: 300, y: 400 },
      sourceSide: 'bottom',
      targetSide: 'top',
    });
    const [apexX, apexY] = numbers(head);
    // Arriving downwards into a top port.
    expect(apexX).toBeCloseTo(300);
    expect(apexY).toBeCloseTo(400 - PULLBACK);
  });

  it('draws a closed triangle', () => {
    expect(wireGeometry(horizontal).head.trim().endsWith('Z')).toBe(true);
  });
});

describe('wireGeometry — the strand', () => {
  it('starts exactly on the source port', () => {
    const [x, y] = numbers(wireGeometry(horizontal).path);
    expect(x).toBe(100);
    expect(y).toBe(200);
  });

  it('stops a head-length short of the tip so the head reads solid', () => {
    const n = numbers(wireGeometry(horizontal).path);
    const endX = n[n.length - 2];
    expect(endX).toBeCloseTo(400 - PULLBACK - HEAD_LENGTH);
  });

  it('leaves a side port sideways — control point is offset on x, not y', () => {
    const n = numbers(wireGeometry(horizontal).path);
    const [, , c1x, c1y] = n;
    expect(c1x).toBeGreaterThan(100);
    expect(c1y).toBeCloseTo(200);
  });

  it('leaves a bottom port downwards — control point is offset on y', () => {
    const n = numbers(
      wireGeometry({ ...horizontal, sourceSide: 'bottom', targetSide: 'top' }).path,
    );
    const [, , c1x, c1y] = n;
    expect(c1x).toBeCloseTo(100);
    expect(c1y).toBeGreaterThan(200);
  });
});

describe('wireGeometry — parallel lanes', () => {
  it('gives two lanes that share both endpoints', () => {
    const { lanes } = wireGeometry(horizontal);
    const a = numbers(lanes[0]);
    const b = numbers(lanes[1]);
    expect([a[0], a[1]]).toEqual([b[0], b[1]]); // same origin
    expect([a[6], a[7]]).toEqual([b[6], b[7]]); // same landing point
  });

  it('bows the lanes to opposite sides in the middle', () => {
    const { lanes } = wireGeometry(horizontal);
    const a = numbers(lanes[0]);
    const b = numbers(lanes[1]);
    expect(a[3]).not.toBeCloseTo(b[3]); // control-point y differs
    expect(a[3] - 200).toBeCloseTo(-(b[3] - 200)); // symmetric about the axis
  });
});

describe('wireGeometry — streaming chevrons', () => {
  it('places two of them along the strand', () => {
    expect(wireGeometry(horizontal).chevrons).toHaveLength(2);
  });

  it('puts them in order and between the endpoints', () => {
    const [first, second] = wireGeometry(horizontal).chevrons;
    const x1 = numbers(first.d)[2];
    const x2 = numbers(second.d)[2];
    expect(x1).toBeGreaterThan(100);
    expect(x2).toBeGreaterThan(x1);
    expect(x2).toBeLessThan(400);
  });
});

describe('wireMidpoint', () => {
  it('lands on the strand, half way along a straight run', () => {
    const mid = wireMidpoint(horizontal);
    expect(mid.y).toBeCloseTo(200);
    expect(mid.x).toBeGreaterThan(100);
    expect(mid.x).toBeLessThan(400);
  });
});
