// @vitest-environment node
// M5 回归：程序化铜钱姿态（idle / charging）任何时刻不得穿桌面。

import { describe, expect, it } from 'vitest';
import { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS } from '../physics/coinDimensions';
import { faceNormalYFromQuaternion } from '../physics/faceReader';
import type { QuaternionTuple, Vec3Tuple } from '../physics/physicalTossInput';
import { chargingCoinPose, idleCoinPose } from './coinView';

function bottomY(pose: { position: Vec3Tuple; rotation: QuaternionTuple }): number {
  const normalY = Math.abs(faceNormalYFromQuaternion(pose.rotation));
  const verticalExtent =
    (TABLETOP_COIN_THICKNESS / 2) * normalY +
    TABLETOP_COIN_RADIUS * Math.sqrt(Math.max(0, 1 - normalY * normalY));
  return pose.position[1] - verticalExtent;
}

describe('coin poses never clip through the tabletop', () => {
  it('charging pose keeps every coin bottom at or above the table for all t and energy', () => {
    for (const energy of [0, 0.25, 0.5, 0.75, 1]) {
      for (let step = 0; step < 600; step += 1) {
        const t = step * 0.016;
        for (const index of [0, 1, 2]) {
          const pose = chargingCoinPose(index, t, energy);
          expect(bottomY(pose)).toBeGreaterThanOrEqual(0);
          // x/z 抖动不得把铜钱甩出投掷可视区（±2.4）。
          expect(Math.abs(pose.position[0])).toBeLessThan(2.4);
          expect(Math.abs(pose.position[2])).toBeLessThan(2.4);
        }
      }
    }
  });

  it('charging pose respects the clamp even under reduced motion scale', () => {
    for (const motionScale of [0, 0.25]) {
      for (let step = 0; step < 300; step += 1) {
        const t = step * 0.016;
        for (const index of [0, 1, 2]) {
          const pose = chargingCoinPose(index, t, 1, motionScale);
          expect(bottomY(pose)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('idle pose keeps coins flat on the table surface', () => {
    for (let step = 0; step < 600; step += 1) {
      const t = step * 0.016;
      for (const index of [0, 1, 2]) {
        const pose = idleCoinPose(index, t);
        expect(bottomY(pose)).toBeGreaterThanOrEqual(0);
        expect(pose.position[1]).toBeGreaterThanOrEqual(TABLETOP_COIN_THICKNESS / 2);
      }
    }
  });
});
