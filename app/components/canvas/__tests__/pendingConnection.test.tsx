/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConnectionLineType, Position, type ConnectionLineComponentProps } from 'reactflow';
import {
  PendingConnectionLine,
  branchPromotionHint,
  nextBranchDescriptor,
} from '../PendingConnectionLine';
import type { Descriptor } from '../../../types/pointy';

/**
 * Screen 08's words and thresholds.
 *
 * The descriptor arithmetic must agree with edit.ts connect(): 0 goes to the
 * successor the source already has, the wire in hand takes 1, an existing
 * branch takes its next free digit, ten digits means full.
 */
afterEach(cleanup);

const rows = (...descriptors: Descriptor[]) => descriptors.map((descriptor) => ({ descriptor }));

describe('nextBranchDescriptor', () => {
  it('is null without a successor — the drop would splice, not promote', () => {
    expect(nextBranchDescriptor(undefined, false)).toBeNull();
    expect(nextBranchDescriptor(rows(0, 1), false)).toBeNull();
  });

  it('claims 1 for the first extra wire — 0 belongs to the existing successor', () => {
    expect(nextBranchDescriptor(undefined, true)).toBe(1);
  });

  it('takes the next free digit on a branch that already exists', () => {
    expect(nextBranchDescriptor(rows(0, 1), true)).toBe(2);
    expect(nextBranchDescriptor(rows(0, 1, 2, 3, 4, 5, 6, 7, 8), true)).toBe(9);
  });

  it('is null when all ten descriptors are used — the branch is full', () => {
    expect(nextBranchDescriptor(rows(0, 1, 2, 3, 4, 5, 6, 7, 8, 9), true)).toBeNull();
  });
});

describe('branchPromotionHint', () => {
  it('names the first two paths the way the design does', () => {
    expect(branchPromotionHint(0)).toBe('Release to add branch 0 (success)');
    expect(branchPromotionHint(1)).toBe('Release to add branch 1 (failure)');
  });

  it('leaves higher paths as bare numbers — they are not named in the DSL', () => {
    expect(branchPromotionHint(2)).toBe('Release to add branch 2');
    expect(branchPromotionHint(9)).toBe('Release to add branch 9');
  });
});

describe('PendingConnectionLine', () => {
  const base: ConnectionLineComponentProps = {
    connectionLineType: ConnectionLineType.Bezier,
    fromX: 0,
    fromY: 0,
    toX: 100,
    toY: 40,
    fromPosition: Position.Right,
    toPosition: Position.Left,
    connectionStatus: null,
  };

  // reactflow mounts the line inside its connection <svg>; wrapping mirrors
  // that so the SVG namespace (and the queries) behave as they do live.
  const draw = (props: Partial<ConnectionLineComponentProps> & { hint: string }) =>
    render(
      <svg>
        <PendingConnectionLine {...base} {...props} />
      </svg>,
    );

  it('draws only the dashed pending wire while no target is under the cursor', () => {
    const { container } = draw({ hint: 'Release to add branch 1 (failure)' });
    expect(screen.queryByText('Release to add branch 1 (failure)')).toBeNull();
    expect(container.querySelector('circle')).toBeNull();
    const wire = container.querySelector('path');
    expect(wire?.getAttribute('stroke-dasharray')).toBe('5 4');
    expect(wire?.getAttribute('stroke')).toBe('var(--op-seq)');
  });

  it('adds the snap ring and the hint pill over a valid target', () => {
    const { container } = draw({
      connectionStatus: 'valid',
      hint: 'Release to add branch 1 (failure)',
    });
    expect(screen.getByText('Release to add branch 1 (failure)')).toBeDefined();
    const ring = container.querySelector('circle');
    expect(ring?.getAttribute('r')).toBe('11');
    expect(ring?.getAttribute('cx')).toBe('100');
  });

  it('keeps the ring off invalid handles — nothing is promised there', () => {
    const { container } = draw({ connectionStatus: 'invalid', hint: 'Release to add branch 2' });
    expect(screen.queryByText('Release to add branch 2')).toBeNull();
    expect(container.querySelector('circle')).toBeNull();
  });
});
