import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi } from 'vitest';
import { createCoinToss } from '../domain/coinToss';
import type { CoinToss } from '../domain/types';
import TabletopScene from './TabletopScene';

interface RenderTabletopSceneOptions {
  currentThrow?: number;
  pendingToss?: CoinToss | null;
  resultAvailable?: boolean;
  onOpenResult?: () => void;
  onTossRequest?: () => void;
  onTossSettled?: () => void;
}

function renderTabletopScene({
  currentThrow = 1,
  pendingToss = null,
  resultAvailable = false,
  onOpenResult = vi.fn(),
  onTossRequest = vi.fn(),
  onTossSettled = vi.fn()
}: RenderTabletopSceneOptions = {}) {
  render(
    <TabletopScene
      currentThrow={currentThrow}
      pendingToss={pendingToss}
      resultAvailable={resultAvailable}
      onOpenResult={onOpenResult}
      onTossRequest={onTossRequest}
      onTossSettled={onTossSettled}
    />
  );

  return { onOpenResult, onTossRequest, onTossSettled };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('TabletopScene', () => {
  it('renders the coin interaction without question or AI copy', async () => {
    const user = userEvent.setup();
    const onTossRequest = vi.fn();

    renderTabletopScene({ onTossRequest });

    await user.click(screen.getByRole('button', { name: '投掷铜钱' }));

    expect(onTossRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('开始起卦')).not.toBeInTheDocument();
    expect(screen.queryByText('AI 解读')).not.toBeInTheDocument();
  });

  it('settles a pending toss in the non-WebGL fallback', async () => {
    vi.useFakeTimers();
    const pendingToss = createCoinToss(['heads', 'tails', 'tails']);
    const onTossSettled = vi.fn();

    renderTabletopScene({ pendingToss, onTossSettled });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onTossSettled).toHaveBeenCalledTimes(1);
  });

  it('keeps fallback coins and settles a toss when WebGL renderer setup fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D
    );
    const pendingToss = createCoinToss(['heads', 'tails', 'heads']);
    const onTossSettled = vi.fn();

    expect(() => renderTabletopScene({ pendingToss, onTossSettled })).not.toThrow();

    expect(document.querySelector('.tabletopCanvas canvas')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.fallbackCoin')).toHaveLength(3);
    expect(document.querySelectorAll('.fallbackCoin[data-face="heads"]')).toHaveLength(2);
    expect(document.querySelectorAll('.fallbackCoin[data-face="tails"]')).toHaveLength(1);
    expect(document.querySelectorAll('.fallbackCoin[data-face="heads"] .fallbackCoinGlyph')).toHaveLength(8);
    expect(document.querySelectorAll('.fallbackCoin[data-face="tails"] .fallbackCoinMint')).toHaveLength(2);
    expect(screen.getAllByText('乾')).toHaveLength(2);
    expect(screen.getAllByText('隆')).toHaveLength(2);
    expect(screen.getAllByText('通')).toHaveLength(2);
    expect(screen.getAllByText('宝')).toHaveLength(2);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onTossSettled).toHaveBeenCalledTimes(1);
  });

  it('settles a rerendered pending toss once without restarting the timer', async () => {
    vi.useFakeTimers();
    const pendingToss = createCoinToss(['heads', 'tails', 'tails']);
    const firstSettled = vi.fn();
    const secondSettled = vi.fn();
    const thirdSettled = vi.fn();

    const { rerender } = render(
      <TabletopScene
        currentThrow={2}
        pendingToss={pendingToss}
        resultAvailable={false}
        onOpenResult={vi.fn()}
        onTossRequest={vi.fn()}
        onTossSettled={firstSettled}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1700);
    });

    rerender(
      <TabletopScene
        currentThrow={2}
        pendingToss={pendingToss}
        resultAvailable={false}
        onOpenResult={vi.fn()}
        onTossRequest={vi.fn()}
        onTossSettled={secondSettled}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(520);
    });

    expect(firstSettled).not.toHaveBeenCalled();
    expect(secondSettled).toHaveBeenCalledTimes(1);

    rerender(
      <TabletopScene
        currentThrow={2}
        pendingToss={pendingToss}
        resultAvailable={false}
        onOpenResult={vi.fn()}
        onTossRequest={vi.fn()}
        onTossSettled={thirdSettled}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(secondSettled).toHaveBeenCalledTimes(1);
    expect(thirdSettled).not.toHaveBeenCalled();
  });

  it('opens the result when a result is available', async () => {
    const user = userEvent.setup();
    const onOpenResult = vi.fn();
    const onTossRequest = vi.fn();

    renderTabletopScene({ resultAvailable: true, onOpenResult, onTossRequest });

    await user.click(screen.getByRole('button', { name: '查看结果' }));

    expect(onOpenResult).toHaveBeenCalledTimes(1);
    expect(onTossRequest).not.toHaveBeenCalled();
  });
});
