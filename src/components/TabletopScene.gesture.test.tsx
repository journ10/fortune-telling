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
    const onTossRelease = vi.fn();
    const onTossShakeStart = vi.fn();

    render(
      <TabletopScene
        currentThrow={1}
        pendingTossId={null}
        resultAvailable={false}
        onOpenResult={vi.fn()}
        onTossRelease={onTossRelease}
        onTossRequest={vi.fn()}
        onTossShakeStart={onTossShakeStart}
        onTossSettled={vi.fn()}
      />
    );

    const tossButton = screen.getByRole('button', { name: '按住颠钱，松开掷出' });

    tossButton.focus();
    expect(tossButton).toHaveFocus();

    fireEvent.keyDown(tossButton, { key: 'Enter' });
    fireEvent.keyUp(tossButton, { key: 'Enter' });

    expect(onTossShakeStart).toHaveBeenCalledTimes(1);
    expect(onTossRelease).toHaveBeenCalledTimes(1);
  });
});
