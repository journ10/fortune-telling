import { useEffect, useRef, useState } from 'react';
import {
  createCoinPhysicsSimulation,
  initCoinPhysics,
  type CoinPhysicsSimulation,
  type CoinPhysicsSnapshot
} from '../physics/coinPhysics';
import type { PhysicalTossInput } from '../physics/physicalTossInput';
import type { CoinFace } from '../domain/types';

const MIN_DELTA_SECONDS = 1 / 120;
const MAX_DELTA_SECONDS = 0.08;

type PendingTossKey = string | number | null | undefined;

export interface PhysicalTossSimulationParams {
  pendingTossKey: PendingTossKey;
  input: PhysicalTossInput | null | undefined;
  onSettled: (faces: [CoinFace, CoinFace, CoinFace]) => void;
}

function clampDeltaSeconds(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds)) {
    return MIN_DELTA_SECONDS;
  }

  return Math.min(Math.max(deltaSeconds, MIN_DELTA_SECONDS), MAX_DELTA_SECONDS);
}

export function usePhysicalTossSimulation({
  pendingTossKey,
  input,
  onSettled
}: PhysicalTossSimulationParams): CoinPhysicsSnapshot | null {
  const [snapshot, setSnapshot] = useState<CoinPhysicsSnapshot | null>(null);
  const onSettledRef = useRef(onSettled);
  const settledKeyRef = useRef<PendingTossKey>(null);

  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    let isActive = true;
    let animationFrame: number | null = null;
    let lastFrameTimestamp: number | null = null;
    let simulation: CoinPhysicsSimulation | null = null;

    const cancelLoop = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };

    const disposeSimulation = () => {
      cancelLoop();
      simulation?.dispose();
      simulation = null;
    };

    if (pendingTossKey === null || pendingTossKey === undefined || !input) {
      setSnapshot(null);

      return disposeSimulation;
    }

    setSnapshot(null);

    const stepFrame = (timestamp: number) => {
      if (!isActive || !simulation) {
        return;
      }

      const deltaSeconds =
        lastFrameTimestamp === null
          ? MIN_DELTA_SECONDS
          : clampDeltaSeconds((timestamp - lastFrameTimestamp) / 1000);

      lastFrameTimestamp = timestamp;

      const nextSnapshot = simulation.step(deltaSeconds);
      setSnapshot(nextSnapshot);

      if (
        nextSnapshot.settled &&
        nextSnapshot.faces &&
        settledKeyRef.current !== pendingTossKey
      ) {
        settledKeyRef.current = pendingTossKey;
        onSettledRef.current(nextSnapshot.faces);
        disposeSimulation();
        return;
      }

      animationFrame = window.requestAnimationFrame(stepFrame);
    };

    initCoinPhysics()
      .then(() => {
        if (!isActive) {
          return;
        }

        simulation = createCoinPhysicsSimulation(input);
        animationFrame = window.requestAnimationFrame(stepFrame);
      })
      .catch(() => {
        if (isActive) {
          setSnapshot(null);
        }
      });

    return () => {
      isActive = false;
      disposeSimulation();
    };
  }, [input, pendingTossKey]);

  return snapshot;
}
