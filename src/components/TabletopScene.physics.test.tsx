import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoinFace } from '../domain/types';

const physicsMock = vi.hoisted(() => ({
  createCoinPhysicsSimulation: vi.fn(),
  dispose: vi.fn(),
  initCoinPhysics: vi.fn(),
  releaseChamber: vi.fn(),
  snapshot: vi.fn(),
  step: vi.fn(),
  updateChamberDrive: vi.fn()
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class MockWebGLRenderer {
    domElement = document.createElement('canvas');
    outputColorSpace = '';
    shadowMap = { enabled: false };

    dispose() {}
    render() {}
    setPixelRatio() {}
    setSize() {}
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer
  };
});

vi.mock('../physics/coinPhysics', async () => {
  const THREE = await import('three');
  const activeSnapshot = {
    coins: [-1, 0, 1].map((slot) => ({
      physicsRotation: new THREE.Quaternion(),
      position: new THREE.Vector3(slot, 0.5, 0),
      visualRotation: new THREE.Quaternion()
    })),
    elapsed: 3,
    faces: null,
    phase: 'released',
    settled: false
  };
  physicsMock.snapshot.mockReturnValue(activeSnapshot);
  physicsMock.step.mockReturnValue(activeSnapshot);

  return {
    createCoinPhysicsSimulation: physicsMock.createCoinPhysicsSimulation,
    initCoinPhysics: physicsMock.initCoinPhysics,
    COIN_PHYSICS_ENGINE: 'rapier3d-compat',
    coinFaceFromPhysicsRotation: vi.fn(),
    coinFaceFromVisualRotation: vi.fn(),
    visualRotationFromPhysicsRotation: vi.fn()
  };
});

import TabletopScene from './TabletopScene';

describe('TabletopScene physics settlement', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D
    );

    physicsMock.initCoinPhysics.mockResolvedValue(undefined);
    physicsMock.createCoinPhysicsSimulation.mockReturnValue({
      dispose: physicsMock.dispose,
      releaseChamber: physicsMock.releaseChamber,
      snapshot: physicsMock.snapshot,
      step: physicsMock.step,
      updateChamberDrive: physicsMock.updateChamberDrive
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('does not let the fixed fallback timer settle while physics is still active', async () => {
    const onTossSettled = vi.fn<(faces: [CoinFace, CoinFace, CoinFace]) => void>();

    render(
      <TabletopScene
        currentThrow={1}
        pendingTossId={1}
        pendingTossSeed={0x11223344}
        resultAvailable={false}
        tossInteractionPhase="released"
        onOpenResult={vi.fn()}
        onTossRequest={vi.fn()}
        onTossSettled={onTossSettled}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(physicsMock.createCoinPhysicsSimulation).toHaveBeenCalledTimes(1);
    expect(physicsMock.createCoinPhysicsSimulation).toHaveBeenCalledWith(
      1,
      1,
      0x11223344,
      expect.objectContaining({
        drive: expect.objectContaining({ release: false }),
        mode: 'chamber'
      })
    );
    expect(physicsMock.releaseChamber).toHaveBeenCalledWith(
      expect.objectContaining({ release: true })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2220);
    });

    expect(onTossSettled).not.toHaveBeenCalled();
  });
});
