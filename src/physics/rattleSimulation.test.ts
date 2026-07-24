// @vitest-environment node
// Rattle simulation (M5): physics-driven charging. 摇钱是纯视觉/手感层，
// 但必须满足与投掷相同的硬约束：不穿桌、不出围栏、无输入则静置。

import { beforeAll, describe, expect, it } from 'vitest';
import { faceNormalYFromQuaternion } from './faceReader';
import { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS } from './coinDimensions';
import type { QuaternionTuple, Vec3Tuple } from './physicalTossInput';
import {
  RATTLE_FENCE_X,
  RATTLE_FENCE_Z,
  createRattleSimulation,
  initTossPhysics,
  type CoinTossSimulationSnapshot
} from './tossSimulation';

const INITIAL_POSITIONS: Vec3Tuple[] = [0, 1, 2].map((index) => {
  const angle = (index / 3) * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(angle) * 0.92, TABLETOP_COIN_THICKNESS / 2 + 0.002, Math.sin(angle) * 0.92 * 0.72];
});

function coinBottomY(position: Vec3Tuple, rotation: QuaternionTuple): number {
  const normalY = Math.abs(faceNormalYFromQuaternion(rotation));
  const extent =
    (TABLETOP_COIN_THICKNESS / 2) * normalY +
    TABLETOP_COIN_RADIUS * Math.sqrt(Math.max(0, 1 - normalY * normalY));
  return position[1] - extent;
}

function stepSeconds(
  simulation: ReturnType<typeof createRattleSimulation>,
  seconds: number,
  agitation: (t: number) => { x: number; z: number; energy: number }
): CoinTossSimulationSnapshot {
  let snapshot = simulation.snapshot();
  const frames = Math.round(seconds * 60);
  for (let frame = 0; frame < frames; frame += 1) {
    snapshot = simulation.step(1 / 60, agitation(frame / 60));
  }
  return snapshot;
}

describe('createRattleSimulation', () => {
  beforeAll(async () => {
    await initTossPhysics();
  });

  it('starts with three coins resting flat at the idle positions', async () => {
    const simulation = createRattleSimulation(7);
    const snapshot = simulation.snapshot();

    snapshot.coins.forEach((coin, index) => {
      expect(coin.position[0]).toBeCloseTo(INITIAL_POSITIONS[index][0], 6);
      expect(coin.position[2]).toBeCloseTo(INITIAL_POSITIONS[index][2], 6);
      expect(Math.abs(faceNormalYFromQuaternion(coin.rotation))).toBeCloseTo(1, 6);
      expect(Math.hypot(...coin.linearVelocity)).toBe(0);
    });
    simulation.dispose();
  });

  it('stays essentially still without agitation', () => {
    const simulation = createRattleSimulation(11);
    const snapshot = stepSeconds(simulation, 2, () => ({ x: 0, z: 0, energy: 0 }));

    snapshot.coins.forEach((coin, index) => {
      const drift = Math.hypot(
        coin.position[0] - INITIAL_POSITIONS[index][0],
        coin.position[2] - INITIAL_POSITIONS[index][2]
      );
      expect(drift).toBeLessThan(0.01);
      expect(Math.hypot(...coin.linearVelocity)).toBeLessThan(0.05);
    });
    simulation.dispose();
  });

  it('moves coins physically when agitated (position and velocity change)', () => {
    const simulation = createRattleSimulation(23);
    const snapshot = stepSeconds(simulation, 1.5, (t) => ({
      x: Math.sin(t * 9),
      z: Math.cos(t * 7.3),
      energy: 0.8
    }));

    const moved = snapshot.coins.some((coin, index) => {
      const drift = Math.hypot(
        coin.position[0] - INITIAL_POSITIONS[index][0],
        coin.position[2] - INITIAL_POSITIONS[index][2]
      );
      return drift > 0.03 || Math.hypot(...coin.linearVelocity) > 0.05;
    });
    expect(moved).toBe(true);
    simulation.dispose();
  });

  it('keeps coins above the table and inside the fence under maximal agitation', () => {
    const simulation = createRattleSimulation(42);
    let maxY = 0;

    for (let frame = 0; frame < 60 * 10; frame += 1) {
      const t = frame / 60;
      const snapshot = simulation.step(1 / 60, {
        x: Math.sin(t * 9),
        z: Math.cos(t * 7.3),
        energy: 1
      });

      snapshot.coins.forEach((coin) => {
        // 永不穿桌。
        expect(coinBottomY(coin.position, coin.rotation)).toBeGreaterThanOrEqual(-0.005);
        // 永不出围栏（含铜钱半径余量）。
        expect(Math.abs(coin.position[0])).toBeLessThanOrEqual(
          RATTLE_FENCE_X + TABLETOP_COIN_RADIUS + 0.01
        );
        expect(Math.abs(coin.position[2])).toBeLessThanOrEqual(
          RATTLE_FENCE_Z + TABLETOP_COIN_RADIUS + 0.01
        );
        maxY = Math.max(maxY, coin.position[1]);
      });
    }

    // 跳动存在但有界（物理兜底高度 0.6）。
    expect(maxY).toBeGreaterThan(TABLETOP_COIN_THICKNESS);
    expect(maxY).toBeLessThanOrEqual(0.6 + 0.001);
    simulation.dispose();
  });

  it('disposes cleanly and supports repeated create/dispose cycles (cancel/reset)', () => {
    for (const seed of [1, 2, 3]) {
      const simulation = createRattleSimulation(seed);
      stepSeconds(simulation, 0.5, () => ({ x: 1, z: 0.5, energy: 0.6 }));
      expect(() => simulation.dispose()).not.toThrow();
    }
  });
});
