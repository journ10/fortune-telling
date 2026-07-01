import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as THREE from 'three';
import { afterEach, beforeEach, vi } from 'vitest';
import { createCoinToss } from '../domain/coinToss';
import type { CoinFace } from '../domain/types';
import type { CoinToss } from '../domain/types';
import TabletopScene, {
  MIN_COIN_LANDING_DISTANCE,
  TABLETOP_COIN_RADIUS,
  TABLETOP_COIN_THICKNESS,
  computeCoinTableContactY,
  createCoinAnimationPlans,
  createCoinGroup
} from './TabletopScene';

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
  it('uses a restrained traditional coin scale', () => {
    expect(TABLETOP_COIN_RADIUS).toBeGreaterThanOrEqual(0.46);
    expect(TABLETOP_COIN_RADIUS).toBeLessThanOrEqual(0.52);
  });

  it('keeps generated coin resting points from overlapping', () => {
    const faceSets: CoinFace[][] = [
      ['heads', 'heads', 'heads'],
      ['heads', 'tails', 'heads'],
      ['tails', 'heads', 'tails'],
      ['tails', 'tails', 'tails']
    ];

    for (let currentThrow = 1; currentThrow <= 6; currentThrow += 1) {
      faceSets.forEach((faces) => {
        const plans = createCoinAnimationPlans(currentThrow, faces);

        plans.forEach((plan, index) => {
          plans.slice(index + 1).forEach((otherPlan) => {
            const distance = Math.hypot(
              plan.landingX + plan.slideX - otherPlan.landingX - otherPlan.slideX,
              plan.landingZ + plan.slideZ - otherPlan.landingZ - otherPlan.slideZ
            );

            expect(distance).toBeGreaterThanOrEqual(MIN_COIN_LANDING_DISTANCE);
          });
        });
      });
    }
  });

  it('keeps the coin body above the tabletop for tilted and upright rotations', () => {
    const rotations = [
      new THREE.Euler(-Math.PI / 2, 0, 0),
      new THREE.Euler(0, 0, 0),
      new THREE.Euler(Math.PI / 4, Math.PI / 3, Math.PI / 6),
      new THREE.Euler(Math.PI * 0.82, Math.PI * 0.35, Math.PI * 0.18)
    ];

    rotations.forEach((rotation) => {
      const contactY = computeCoinTableContactY(rotation);
      const normal = new THREE.Vector3(0, 0, 1).applyEuler(rotation);
      const verticalHalfExtent =
        TABLETOP_COIN_RADIUS * Math.sqrt(1 - normal.y * normal.y) +
        (TABLETOP_COIN_THICKNESS / 2) * Math.abs(normal.y);

      expect(contactY).toBeGreaterThanOrEqual(verticalHalfExtent);
    });
  });

  it('builds traditional coins with 3D relief details instead of only flat face textures', () => {
    const coin = createCoinGroup(0);
    const reliefMeshes: THREE.Object3D[] = [];

    coin.traverse((child) => {
      if (child.userData.relief === true) {
        reliefMeshes.push(child);
      }
    });

    expect(reliefMeshes.length).toBeGreaterThanOrEqual(18);
  });

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
