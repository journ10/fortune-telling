import { act, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoinFace } from '../domain/types';
import type { CoinPhysicsSimulation, CoinPhysicsSnapshot } from '../physics/coinPhysics';
import {
  createKeyboardPhysicalTossInput,
  type PhysicalTossInput
} from '../physics/physicalTossInput';
import { usePhysicalTossSimulation } from './usePhysicalTossSimulation';

const physicsMock = vi.hoisted(() => ({
  createCoinPhysicsSimulation: vi.fn(),
  initCoinPhysics: vi.fn()
}));

interface TossSimulationTestProps {
  input: PhysicalTossInput | null;
  pendingTossKey: string | null;
}

vi.mock('../physics/coinPhysics', () => ({
  createCoinPhysicsSimulation: physicsMock.createCoinPhysicsSimulation,
  initCoinPhysics: physicsMock.initCoinPhysics
}));

function createSnapshot(
  overrides: Partial<CoinPhysicsSnapshot> = {}
): CoinPhysicsSnapshot {
  return {
    coins: [-1, 0, 1].map((slot) => ({
      physicsRotation: new THREE.Quaternion(),
      position: new THREE.Vector3(slot, 0.5, 0),
      visualRotation: new THREE.Quaternion()
    })) as CoinPhysicsSnapshot['coins'],
    elapsed: 0,
    faces: null,
    phase: 'released',
    settled: false,
    settledReason: null,
    ...overrides
  };
}

function createSimulation(
  step: CoinPhysicsSimulation['step'],
  dispose = vi.fn()
): CoinPhysicsSimulation {
  return {
    dispose,
    snapshot: vi.fn(() => createSnapshot()),
    step
  };
}

describe('usePhysicalTossSimulation', () => {
  let animationFrames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;

  beforeEach(() => {
    physicsMock.createCoinPhysicsSimulation.mockReset();
    physicsMock.initCoinPhysics.mockReset();

    animationFrames = new Map();
    nextFrameId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;

      nextFrameId += 1;
      animationFrames.set(frameId, callback);

      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      animationFrames.delete(frameId);
    });

    physicsMock.initCoinPhysics.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  async function finishPhysicsInit() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  function runNextAnimationFrame(timestamp: number) {
    const nextFrame = animationFrames.entries().next().value;

    if (!nextFrame) {
      throw new Error('Expected a pending animation frame');
    }

    const [frameId, callback] = nextFrame;
    animationFrames.delete(frameId);

    act(() => {
      callback(timestamp);
    });
  }

  it('settles once with faces from a keyboard physical toss simulation', async () => {
    const faces: [CoinFace, CoinFace, CoinFace] = ['heads', 'tails', 'heads'];
    const activeSnapshot = createSnapshot({ elapsed: 0.1 });
    const settledSnapshot = createSnapshot({
      elapsed: 0.2,
      faces,
      settled: true,
      settledReason: 'strict'
    });
    const step = vi.fn()
      .mockReturnValueOnce(activeSnapshot)
      .mockReturnValueOnce(settledSnapshot);
    const simulation = createSimulation(step);
    const input = createKeyboardPhysicalTossInput({
      currentThrow: 1,
      perturbationSeed: 0x12345678
    });
    const onSettled = vi.fn<(settledFaces: [CoinFace, CoinFace, CoinFace]) => void>();

    physicsMock.createCoinPhysicsSimulation.mockReturnValue(simulation);

    const { result } = renderHook(() =>
      usePhysicalTossSimulation({
        pendingTossKey: 'keyboard:1',
        input,
        onSettled
      })
    );

    await finishPhysicsInit();

    expect(physicsMock.createCoinPhysicsSimulation).toHaveBeenCalledWith(input);

    runNextAnimationFrame(16);
    expect(result.current).toBe(activeSnapshot);
    expect(onSettled).not.toHaveBeenCalled();

    runNextAnimationFrame(116);

    expect(result.current).toBe(settledSnapshot);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(faces);
    expect(step).toHaveBeenCalledTimes(2);
    expect(animationFrames).toHaveLength(0);
  });

  it('disposes the active simulation when the toss key changes', async () => {
    const firstInput = createKeyboardPhysicalTossInput({
      currentThrow: 1,
      perturbationSeed: 0x11111111
    });
    const secondInput = createKeyboardPhysicalTossInput({
      currentThrow: 2,
      perturbationSeed: 0x22222222
    });
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const firstSimulation = createSimulation(vi.fn(() => createSnapshot()), firstDispose);
    const secondSimulation = createSimulation(vi.fn(() => createSnapshot()), secondDispose);
    const onSettled = vi.fn<(settledFaces: [CoinFace, CoinFace, CoinFace]) => void>();

    physicsMock.createCoinPhysicsSimulation
      .mockReturnValueOnce(firstSimulation)
      .mockReturnValueOnce(secondSimulation);

    const { rerender } = renderHook<CoinPhysicsSnapshot | null, TossSimulationTestProps>(
      ({ input, pendingTossKey }: TossSimulationTestProps) =>
        usePhysicalTossSimulation({
          pendingTossKey,
          input,
          onSettled
        }),
      {
        initialProps: {
          input: firstInput,
          pendingTossKey: 'keyboard:1'
        }
      }
    );

    await finishPhysicsInit();
    expect(physicsMock.createCoinPhysicsSimulation).toHaveBeenCalledWith(firstInput);

    rerender({
      input: secondInput,
      pendingTossKey: 'keyboard:2'
    });

    expect(firstDispose).toHaveBeenCalledTimes(1);

    await finishPhysicsInit();

    expect(physicsMock.createCoinPhysicsSimulation).toHaveBeenCalledWith(secondInput);
    expect(secondDispose).not.toHaveBeenCalled();
  });

  it('settles again when the same toss key is reused after returning to idle', async () => {
    const firstFaces: [CoinFace, CoinFace, CoinFace] = ['heads', 'tails', 'heads'];
    const secondFaces: [CoinFace, CoinFace, CoinFace] = ['tails', 'heads', 'tails'];
    const firstInput = createKeyboardPhysicalTossInput({
      currentThrow: 1,
      perturbationSeed: 0x33333333
    });
    const secondInput = createKeyboardPhysicalTossInput({
      currentThrow: 1,
      perturbationSeed: 0x44444444
    });
    const firstSimulation = createSimulation(
      vi.fn(() =>
        createSnapshot({
          faces: firstFaces,
          settled: true,
          settledReason: 'strict'
        })
      )
    );
    const secondSimulation = createSimulation(
      vi.fn(() =>
        createSnapshot({
          faces: secondFaces,
          settled: true,
          settledReason: 'strict'
        })
      )
    );
    const onSettled = vi.fn<(settledFaces: [CoinFace, CoinFace, CoinFace]) => void>();

    physicsMock.createCoinPhysicsSimulation
      .mockReturnValueOnce(firstSimulation)
      .mockReturnValueOnce(secondSimulation);

    const { rerender } = renderHook<CoinPhysicsSnapshot | null, TossSimulationTestProps>(
      ({ input, pendingTossKey }: TossSimulationTestProps) =>
        usePhysicalTossSimulation({
          pendingTossKey,
          input,
          onSettled
        }),
      {
        initialProps: {
          input: firstInput,
          pendingTossKey: 'A'
        } satisfies TossSimulationTestProps
      }
    );

    await finishPhysicsInit();
    runNextAnimationFrame(16);

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenLastCalledWith(firstFaces);

    rerender({
      input: null,
      pendingTossKey: null
    });

    rerender({
      input: secondInput,
      pendingTossKey: 'A'
    });

    await finishPhysicsInit();
    runNextAnimationFrame(32);

    expect(onSettled).toHaveBeenCalledTimes(2);
    expect(onSettled).toHaveBeenLastCalledWith(secondFaces);
  });

  it('reports an active physics init failure through the error callback', async () => {
    const input = createKeyboardPhysicalTossInput({
      currentThrow: 1,
      perturbationSeed: 0x55555555
    });
    const error = new Error('rapier init failed');
    const onSettled = vi.fn<(settledFaces: [CoinFace, CoinFace, CoinFace]) => void>();
    const onError = vi.fn<(simulationError: unknown) => void>();

    physicsMock.initCoinPhysics.mockRejectedValue(error);

    renderHook(() =>
      usePhysicalTossSimulation({
        pendingTossKey: 'keyboard:error',
        input,
        onSettled,
        onError
      })
    );

    await finishPhysicsInit();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onSettled).not.toHaveBeenCalled();
    expect(animationFrames).toHaveLength(0);
  });

  it('reports a simulation creation failure through the error callback', async () => {
    const input = createKeyboardPhysicalTossInput({
      currentThrow: 1,
      perturbationSeed: 0x66666666
    });
    const error = new Error('simulation create failed');
    const onSettled = vi.fn<(settledFaces: [CoinFace, CoinFace, CoinFace]) => void>();
    const onError = vi.fn<(simulationError: unknown) => void>();

    physicsMock.createCoinPhysicsSimulation.mockImplementation(() => {
      throw error;
    });

    renderHook(() =>
      usePhysicalTossSimulation({
        pendingTossKey: 'keyboard:create-error',
        input,
        onSettled,
        onError
      })
    );

    await finishPhysicsInit();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onSettled).not.toHaveBeenCalled();
    expect(animationFrames).toHaveLength(0);
  });

  it('reports a simulation step failure through the error callback', async () => {
    const input = createKeyboardPhysicalTossInput({
      currentThrow: 1,
      perturbationSeed: 0x77777777
    });
    const error = new Error('simulation step failed');
    const dispose = vi.fn();
    const simulation = createSimulation(vi.fn(() => {
      throw error;
    }), dispose);
    const onSettled = vi.fn<(settledFaces: [CoinFace, CoinFace, CoinFace]) => void>();
    const onError = vi.fn<(simulationError: unknown) => void>();

    physicsMock.createCoinPhysicsSimulation.mockReturnValue(simulation);

    const { result } = renderHook(() =>
      usePhysicalTossSimulation({
        pendingTossKey: 'keyboard:step-error',
        input,
        onSettled,
        onError
      })
    );

    await finishPhysicsInit();
    runNextAnimationFrame(16);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onSettled).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(animationFrames).toHaveLength(0);
    expect(result.current).toBeNull();
  });
});
