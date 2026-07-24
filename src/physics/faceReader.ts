// Headless face reading: rigid-body quaternion -> coin face.
//
// This is the ONLY way a simulation result becomes heads/tails.
// No random face generation, no pre-generated targets: the visible face
// is derived from the coin body's final orientation. A coin lies flat
// when its local +Y axis (the face normal) points straight up or down.

import type { CoinFace } from '../domain/types';
import type { QuaternionTuple, Vec3Tuple } from './physicalTossInput';

export const SETTLED_FACE_NORMAL_Y = 0.99;
export const READABLE_FACE_NORMAL_Y = 0.72;

function normalizeQuaternion(quaternion: QuaternionTuple): QuaternionTuple {
  const [x, y, z, w] = quaternion;
  const length = Math.hypot(x, y, z, w);

  if (length < 1e-9) {
    return [0, 0, 0, 1];
  }

  return [x / length, y / length, z / length, w / length];
}

/**
 * Direction of the coin face normal (local +Y axis) after applying the
 * body rotation, in world space. Pure math, no three.js dependency.
 */
export function faceNormalFromQuaternion(rotation: QuaternionTuple): Vec3Tuple {
  const [x, y, z, w] = normalizeQuaternion(rotation);

  // Second basis vector of the rotation matrix (R * (0, 1, 0)).
  return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
}

export function faceNormalYFromQuaternion(rotation: QuaternionTuple): number {
  const [x, , z] = normalizeQuaternion(rotation);

  return 1 - 2 * (x * x + z * z);
}

/** The single source of truth for faces: sign of the settled face normal. */
export function readCoinFace(rotation: QuaternionTuple): CoinFace {
  return faceNormalFromQuaternion(rotation)[1] >= 0 ? 'heads' : 'tails';
}

/** Face normal close enough to up/down to count as cleanly settled flat. */
export function isSettledFaceRotation(rotation: QuaternionTuple): boolean {
  return Math.abs(faceNormalYFromQuaternion(rotation)) >= SETTLED_FACE_NORMAL_Y;
}

/** Face normal close enough to up/down to be read without ambiguity. */
export function isReadableFaceRotation(rotation: QuaternionTuple): boolean {
  return Math.abs(faceNormalYFromQuaternion(rotation)) >= READABLE_FACE_NORMAL_Y;
}
