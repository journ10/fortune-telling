import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi } from 'vitest';
import TabletopScene from './TabletopScene';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TabletopScene gesture trigger', () => {
  it('keeps the coin interaction surface keyboard-triggerable as the native toss button', async () => {
    const user = userEvent.setup();
    const onTossRequest = vi.fn();

    render(
      <TabletopScene
        currentThrow={1}
        pendingTossId={null}
        resultAvailable={false}
        onOpenResult={vi.fn()}
        onTossRequest={onTossRequest}
        onTossSettled={vi.fn()}
      />
    );

    const tossButton = screen.getByRole('button', { name: '投掷铜钱' });

    tossButton.focus();
    expect(tossButton).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(onTossRequest).toHaveBeenCalledTimes(1);
  });
});
