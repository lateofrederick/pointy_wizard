/**
 * @vitest-environment jsdom
 */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { StagedNode, type StagedNodeData } from '../StagedNode';

afterEach(cleanup);

/**
 * The canvas applies onRename to the document and passes the new ref back —
 * StagedNode reads the committed name from props, not from its local state.
 * The harness plays that loop so assertions see what a real parent would show.
 */
function Harness({
  onRename,
  onDiscard,
  initial,
}: {
  onRename: (n: string) => void;
  onDiscard: () => void;
  initial: string;
}) {
  const [stagedName, setStagedName] = useState(initial);
  const data: StagedNodeData = {
    ref: { id: 's1', name: stagedName, namespace: 'local', attributes: [] },
    onRename: (n) => {
      onRename(n);
      setStagedName(n);
    },
    onDiscard,
  };
  return (
    <StagedNode
      id="s1"
      type="staged"
      data={data}
      selected={false}
      dragging={false}
      zIndex={2}
      isConnectable
      xPos={0}
      yPos={0}
    />
  );
}

function mount(initial = 'NewEvent') {
  const onRename = vi.fn();
  const onDiscard = vi.fn();
  render(
    <ReactFlowProvider>
      <Harness onRename={onRename} onDiscard={onDiscard} initial={initial} />
    </ReactFlowProvider>,
  );
  return { onRename, onDiscard };
}

describe('StagedNode naming phase', () => {
  it('opens in naming mode with the hint and a focused input', () => {
    mount();
    const input = screen.getByLabelText('Event name') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(screen.getByText(/Enter to name it/)).toBeDefined();
  });

  it('commits on Enter: hint gone, name shown as static text, renamed once', () => {
    const { onRename } = mount();
    const input = screen.getByLabelText('Event name');
    fireEvent.change(input, { target: { value: 'ClassifyTone' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('ClassifyTone');
    expect(screen.queryByLabelText('Event name')).toBeNull();
    expect(screen.queryByText(/Enter to name it/)).toBeNull();
    expect(screen.getByText('ClassifyTone')).toBeDefined();
  });

  it('a blur with a value commits rather than staying in the input', () => {
    const { onRename } = mount();
    const input = screen.getByLabelText('Event name');
    fireEvent.change(input, { target: { value: 'FetchRows' } });
    fireEvent.blur(input);

    expect(onRename).toHaveBeenCalledWith('FetchRows');
    expect(screen.queryByText(/Enter to name it/)).toBeNull();
  });

  it('an empty name discards the draft instead of committing it', () => {
    const { onRename, onDiscard } = mount('');
    const input = screen.getByLabelText('Event name');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('Escape discards from naming mode', () => {
    const { onDiscard } = mount();
    fireEvent.keyDown(screen.getByLabelText('Event name'), { key: 'Escape' });
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('clicking the committed name re-enters naming with the current value', () => {
    const { onRename } = mount();
    const input = screen.getByLabelText('Event name');
    fireEvent.change(input, { target: { value: 'LoadCsv' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('LoadCsv'));
    const again = screen.getByLabelText('Event name') as HTMLInputElement;
    expect(again.value).toBe('LoadCsv');
    expect(document.activeElement).toBe(again);
    expect(screen.getByText(/Enter to name it/)).toBeDefined();
    // Re-entering renames nothing until Enter/blur commits again.
    expect(onRename).toHaveBeenCalledTimes(1);
  });
});
