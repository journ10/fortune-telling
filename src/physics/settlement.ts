// Headless settlement rules for the coin toss simulation.
//
// Two physical outcomes, never a generated one:
// - `strict`: every coin has LANDED (center height at tabletop level),
//   is slow (linear & angular velocity below thresholds) AND every face
//   normal is essentially vertical. Never settles mid-air.
// - `timeout-readable`: the strict window elapsed but every coin has a
//   readable face orientation, so we read the current body rotations.
//
// A coin standing on edge is NOT readable. It receives a tiny physical
// destabilizing torque until it tips over naturally; the face is then
// read from the body it lands on. No random face fallback exists here.

import {
  READABLE_FACE_NORMAL_Y,
  SETTLED_FACE_NORMAL_Y,
  faceNormalFromQuaternion,
  isReadableFaceRotation,
  isSettledFaceRotation
} from './faceReader';

export { READABLE_FACE_NORMAL_Y, SETTLED_FACE_NORMAL_Y };
import type { QuaternionTuple, Vec3Tuple } from './physicalTossInput';
import { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS } from './coinDimensions';

export type SettledReason = 'strict' | 'timeout-readable';

export interface CoinSettlementSample {
  positionY: number;
  rotation: QuaternionTuple;
  linearVelocity: Vec3Tuple;
  angularVelocity: Vec3Tuple;
}

export type SettlementDecision =
  | { status: 'pending' }
  | { status: 'settled'; reason: SettledReason };

export const SETTLEMENT_TIMESTEP = 1 / 60;
/** Coins cannot settle before this; a real toss needs flight time. */
export const MIN_SETTLE_SECONDS = 1.2;
/** Past this, a fully readable layout resolves as `timeout-readable`. */
export const TIMEOUT_READABLE_SECONDS = 3.0;
/** Absolute protection cap: read whatever the bodies show and stop. */
export const HARD_CAP_SECONDS = 12;
export const LINEAR_SLEEP_SPEED = 0.13;
export const ANGULAR_SLEEP_SPEED = 0.55;
/**
 * strict 落定的高度上限：铜钱必须已接触桌面。
 * 平躺中心高约 thickness/2（0.018），叠在另一枚上约 0.054，
 * 0.126 容忍叠放/斜靠，同时排除一切空中状态。
 */
export const SETTLED_MAX_HEIGHT = TABLETOP_COIN_THICKNESS * 3.5;
/** Edge destabilization starts only after coins have landed. */
export const EDGE_INSTABILITY_AFTER_SECONDS = 1.15;
/** Coins above this height are still airborne; never destabilize them. */
export const EDGE_INSTABILITY_MAX_HEIGHT = TABLETOP_COIN_RADIUS * 1.16;
const EDGE_TORQUE_STRENGTH = 0.025;

function speedOf(vector: Vec3Tuple): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

export function evaluateSettlement(
  samples: readonly CoinSettlementSample[],
  elapsedSeconds: number
): SettlementDecision {
  if (elapsedSeconds < MIN_SETTLE_SECONDS) {
    return { status: 'pending' };
  }

  const allFlat = samples.every((sample) => isSettledFaceRotation(sample.rotation));
  const allSlow = samples.every(
    (sample) =>
      speedOf(sample.linearVelocity) <= LINEAR_SLEEP_SPEED &&
      speedOf(sample.angularVelocity) <= ANGULAR_SLEEP_SPEED
  );
  // 空中绝不定格：strict 要求每枚铜钱都已接触桌面（含叠放/斜靠）。
  const allLanded = samples.every((sample) => sample.positionY <= SETTLED_MAX_HEIGHT);

  if (allFlat && allSlow && allLanded) {
    return { status: 'settled', reason: 'strict' };
  }

  if (
    elapsedSeconds >= TIMEOUT_READABLE_SECONDS &&
    samples.every((sample) => isReadableFaceRotation(sample.rotation))
  ) {
    return { status: 'settled', reason: 'timeout-readable' };
  }

  if (elapsedSeconds >= HARD_CAP_SECONDS) {
    // Max protection path: still read body orientations, never invent faces.
    return { status: 'settled', reason: 'timeout-readable' };
  }

  return { status: 'pending' };
}

/**
 * Tiny torque that nudges a landed, non-flat coin toward the nearest
 * face-down orientation. Purely physical: it only tips the body over;
 * which face it lands on emerges from the simulation.
 */
export function edgeDestabilizationTorque(
  sample: CoinSettlementSample,
  elapsedSeconds: number
): Vec3Tuple | null {
  if (elapsedSeconds < EDGE_INSTABILITY_AFTER_SECONDS) {
    return null;
  }

  if (sample.positionY > EDGE_INSTABILITY_MAX_HEIGHT) {
    return null;
  }

  const normal = faceNormalFromQuaternion(sample.rotation);
  const normalY = normal[1];

  if (Math.abs(normalY) >= SETTLED_FACE_NORMAL_Y) {
    return null;
  }

  const targetSign = normalY >= 0 ? 1 : -1;
  // normal x (0, targetSign, 0)
  const axis: Vec3Tuple = [-normal[2] * targetSign, 0, normal[0] * targetSign];
  const axisLength = Math.hypot(axis[0], axis[1], axis[2]);

  if (axisLength < 0.01) {
    return null;
  }

  const strength = (EDGE_TORQUE_STRENGTH * (1 - Math.abs(normalY))) / axisLength;

  return [axis[0] * strength, axis[1] * strength, axis[2] * strength];
}

export const settlementThresholds = {
  settledFaceNormalY: SETTLED_FACE_NORMAL_Y,
  readableFaceNormalY: READABLE_FACE_NORMAL_Y
};
