import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import TabletopScene from './TabletopScene';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TabletopScene gesture trigger', () => {
  it('keeps the coin interaction surface keyboard-triggerable as the native toss button', () => {
    const onPhysicalTossRequest = vi.fn();

    render(
      <TabletopScene
        currentThrow={1}
        pendingToss={null}
        resultAvailable={false}
        onOpenResult={vi.fn()}
        onPhysicalTossRequest={onPhysicalTossRequest}
        onTossSimulationError={vi.fn()}
        onTossSettled={vi.fn()}
      />
    );

    const tossButton = screen.getByRole('button', { name: '拖动铜钱，松手掷出' });

    tossButton.focus();
    expect(tossButton).toHaveFocus();

    fireEvent.keyDown(tossButton, { key: 'Enter' });
    fireEvent.keyUp(tossButton, { key: 'Enter' });

    expect(onPhysicalTossRequest).toHaveBeenCalledTimes(1);
    expect(onPhysicalTossRequest.mock.calls[0][0]).toMatchObject({
      currentThrow: 1,
      source: 'keyboard'
    });
  });
});
