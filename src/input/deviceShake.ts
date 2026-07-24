// Mobile shake input ("shake, then become still to release").
//
// Wraps the low-level device shake detector and turns a completed shake
// into a PhysicalTossInput through the shared motion mapper — the exact
// same contract and physics pipeline as pointer and keyboard input.
// The tracker never touches coin faces.
//
// Degradation contract: when sensors are unsupported, permission is
// denied, or sampling breaks, callers fall back to the touch chamber;
// casting is never blocked.

import {
  createMotionPhysicalTossInput,
  type PhysicalTossInput
} from '../physics/physicalTossInput';
import {
  SHAKE_STOP_THRESHOLD,
  createDeviceMotionTossDetector,
  type DeviceMotionSample,
  type DeviceMotionTossSummary
} from './deviceShakeDetector';

export type MotionPermissionState =
  | 'unsupported'
  | 'prompt'
  | 'requesting'
  | 'granted'
  | 'denied';

type MotionEventConstructorWithPermission = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'prompt'>;
};

/** Detect whether motion sensors exist and whether they need a permission prompt (iOS). */
export function detectMotionSupport(): 'unsupported' | 'needs-permission' | 'available' {
  if (typeof DeviceMotionEvent === 'undefined') {
    return 'unsupported';
  }

  const constructor = DeviceMotionEvent as unknown as MotionEventConstructorWithPermission;

  return typeof constructor.requestPermission === 'function' ? 'needs-permission' : 'available';
}

/** Run the iOS permission flow. Never throws — denial degrades to touch. */
export async function requestMotionPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  const support = detectMotionSupport();

  if (support === 'unsupported') {
    return 'unsupported';
  }

  if (support === 'available') {
    return 'granted';
  }

  try {
    const constructor = DeviceMotionEvent as unknown as MotionEventConstructorWithPermission;
    const response = await constructor.requestPermission?.();
    return response === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

interface MotionVector {
  x: number;
  y: number;
  z: number;
}

function readAxis(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readVector(vector: DeviceMotionEventAcceleration | null): MotionVector | null {
  if (!vector) {
    return null;
  }

  const x = readAxis(vector.x);
  const y = readAxis(vector.y);
  const z = readAxis(vector.z);

  if (x === null && y === null && z === null) {
    return null;
  }

  return { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
}

function vectorMagnitude(vector: MotionVector): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

/**
 * Convert a devicemotion event into a detector sample. Falls back to
 * gravity-delta acceleration when `acceleration` is missing, and clamps
 * NaN axes so one bad sensor read cannot poison the digest.
 */
export function createSampleFromDeviceMotionEvent(
  event: DeviceMotionEvent,
  previousGravityVector: MotionVector | null
): { nextGravityVector: MotionVector | null; sample: DeviceMotionSample } {
  const acceleration = readVector(event.acceleration);
  const gravityVector = readVector(event.accelerationIncludingGravity);
  const gravityDelta =
    gravityVector && previousGravityVector
      ? {
          x: gravityVector.x - previousGravityVector.x,
          y: gravityVector.y - previousGravityVector.y,
          z: gravityVector.z - previousGravityVector.z
        }
      : null;
  let accelerationMagnitude = acceleration ? vectorMagnitude(acceleration) : 0;

  if (!acceleration && gravityDelta) {
    accelerationMagnitude = vectorMagnitude(gravityDelta);
  }

  return {
    nextGravityVector: gravityVector,
    sample: {
      timestamp: Number.isFinite(event.timeStamp) ? event.timeStamp : Date.now(),
      accelerationMagnitude,
      accelerationVector: acceleration
        ? [acceleration.x, acceleration.y, acceleration.z]
        : gravityDelta
          ? [gravityDelta.x, gravityDelta.y, gravityDelta.z]
          : [0, 0, 0],
      rotationMagnitude: event.rotationRate
        ? Math.hypot(
            readAxis(event.rotationRate.alpha) ?? 0,
            readAxis(event.rotationRate.beta) ?? 0,
            readAxis(event.rotationRate.gamma) ?? 0
          )
        : 0,
      rotationVector: [
        readAxis(event.rotationRate?.alpha) ?? 0,
        readAxis(event.rotationRate?.beta) ?? 0,
        readAxis(event.rotationRate?.gamma) ?? 0
      ]
    }
  };
}

export type DeviceShakePhase = 'idle' | 'charging' | 'armed' | 'released';

export interface DeviceShakeUpdate {
  phase: DeviceShakePhase;
  /** 0..1 live energy for HUD feedback. */
  energyLevel: number;
  /** True once enough energy is accumulated — the UI should hint "be still to toss". */
  readyToRelease: boolean;
  /** Physical input on release; null otherwise. Consumed exactly once. */
  input: PhysicalTossInput | null;
  summary: DeviceMotionTossSummary | null;
}

export interface DeviceShakeContext {
  currentThrow: number;
  perturbationSeed: number;
}

export interface DeviceShakeTrackerOptions {
  /** Minimum accumulated detector energy before a quiet window releases a toss. */
  minReleaseEnergy?: number;
  quietWindowMs?: number;
}

export interface DeviceShakeTracker {
  update: (sample: DeviceMotionSample, context: DeviceShakeContext) => DeviceShakeUpdate;
  /** Back to idle without releasing (e.g. toss consumed, or gesture aborted). */
  reset: () => void;
  phase: () => DeviceShakePhase;
}

const DEFAULT_MIN_RELEASE_ENERGY = 2.5;
const ENERGY_LEVEL_SCALE = 3.2;

/**
 * shake-then-still tracker:
 *   idle → charging (motion above start threshold)
 *        → armed (enough energy; hint "be still to release")
 *        → released (quiet window reached with enough energy)
 *   A quiet window with too little energy discards the gesture back to
 *   idle instead of fabricating a toss.
 */
export function createDeviceShakeTracker(
  options: DeviceShakeTrackerOptions = {}
): DeviceShakeTracker {
  const minReleaseEnergy = options.minReleaseEnergy ?? DEFAULT_MIN_RELEASE_ENERGY;
  const detector = createDeviceMotionTossDetector(
    options.quietWindowMs ? { quietWindowMs: options.quietWindowMs } : {}
  );

  let phase: DeviceShakePhase = 'idle';
  let totalEnergy = 0;

  const buildUpdate = (input: PhysicalTossInput | null, summary: DeviceMotionTossSummary | null): DeviceShakeUpdate => ({
    phase,
    energyLevel: Math.min(1, totalEnergy / ENERGY_LEVEL_SCALE),
    readyToRelease: phase === 'armed' || phase === 'released',
    input,
    summary
  });

  const reset = () => {
    detector.reset();
    phase = 'idle';
    totalEnergy = 0;
  };

  const update = (sample: DeviceMotionSample, context: DeviceShakeContext): DeviceShakeUpdate => {
    const result = detector.update(sample);

    if (result.state === 'shaking') {
      // Mirror the detector: only active samples accumulate energy.
      if (result.energy >= SHAKE_STOP_THRESHOLD) {
        totalEnergy += result.energy;
      }
      phase = totalEnergy >= minReleaseEnergy ? 'armed' : 'charging';
      return buildUpdate(null, null);
    }

    if (result.state === 'released' && result.summary) {
      const { summary } = result;

      if (summary.energy < minReleaseEnergy) {
        // Too weak to be a deliberate toss: discard, do not fabricate.
        reset();
        return buildUpdate(null, null);
      }

      phase = 'released';
      totalEnergy = summary.energy;

      const input = createMotionPhysicalTossInput({
        currentThrow: context.currentThrow,
        durationMs: summary.durationMs,
        energy: summary.energy,
        digest: summary.digest,
        peakCount: summary.peakCount,
        dominantAcceleration: summary.dominantAcceleration,
        rotationBias: summary.rotationBias,
        perturbationSeed: context.perturbationSeed
      });

      return buildUpdate(input, summary);
    }

    return buildUpdate(null, null);
  };

  return { update, reset, phase: () => phase };
}
