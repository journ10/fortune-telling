export type DeviceMotionTossState = 'idle' | 'shaking' | 'released';

export interface DeviceMotionSample {
  timestamp: number;
  accelerationMagnitude: number;
  rotationMagnitude: number;
}

export interface DeviceMotionTossResult {
  state: DeviceMotionTossState;
  energy: number;
  digest: number;
}

export interface DeviceMotionTossOptions {
  startThreshold?: number;
  stopThreshold?: number;
  quietWindowMs?: number;
}

export interface DeviceMotionTossDetector {
  reset: () => void;
  update: (sample: DeviceMotionSample) => DeviceMotionTossResult;
}

const DEFAULT_START_THRESHOLD = 1;
const DEFAULT_STOP_THRESHOLD = 0.22;
const DEFAULT_QUIET_WINDOW_MS = 650;
const ACCELERATION_ENERGY_SCALE = 12;
const ROTATION_ENERGY_SCALE = 240;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function finiteMagnitude(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function calculateEnergy(sample: DeviceMotionSample): number {
  const accelerationEnergy = finiteMagnitude(sample.accelerationMagnitude) / ACCELERATION_ENERGY_SCALE;
  const rotationEnergy = finiteMagnitude(sample.rotationMagnitude) / ROTATION_ENERGY_SCALE;

  return accelerationEnergy + rotationEnergy;
}

function mixWord(hash: number, word: number): number {
  let mixed = hash >>> 0;

  mixed ^= word & 0xff;
  mixed = Math.imul(mixed, FNV_PRIME) >>> 0;
  mixed ^= (word >>> 8) & 0xff;
  mixed = Math.imul(mixed, FNV_PRIME) >>> 0;
  mixed ^= (word >>> 16) & 0xff;
  mixed = Math.imul(mixed, FNV_PRIME) >>> 0;
  mixed ^= (word >>> 24) & 0xff;
  mixed = Math.imul(mixed, FNV_PRIME) >>> 0;

  return mixed >>> 0;
}

function mixSampleDigest(currentDigest: number, sample: DeviceMotionSample, energy: number): number {
  let digest = currentDigest === 0 ? FNV_OFFSET : currentDigest;

  digest = mixWord(digest, Math.round(finiteMagnitude(sample.timestamp)));
  digest = mixWord(digest, Math.round(finiteMagnitude(sample.accelerationMagnitude) * 100));
  digest = mixWord(digest, Math.round(finiteMagnitude(sample.rotationMagnitude) * 10));
  digest = mixWord(digest, Math.round(finiteMagnitude(energy) * 1000));

  return digest === 0 ? FNV_OFFSET : digest;
}

export function createDeviceMotionTossDetector(
  options: DeviceMotionTossOptions = {}
): DeviceMotionTossDetector {
  const startThreshold = options.startThreshold ?? DEFAULT_START_THRESHOLD;
  const stopThreshold = options.stopThreshold ?? DEFAULT_STOP_THRESHOLD;
  const quietWindowMs = options.quietWindowMs ?? DEFAULT_QUIET_WINDOW_MS;

  let state: DeviceMotionTossState = 'idle';
  let digest = 0;
  let lastActiveTimestamp = 0;

  const reset = () => {
    state = 'idle';
    digest = 0;
    lastActiveTimestamp = 0;
  };

  const update = (sample: DeviceMotionSample): DeviceMotionTossResult => {
    const timestamp = finiteMagnitude(sample.timestamp);
    const energy = calculateEnergy(sample);

    if (state === 'released') {
      return { state, energy, digest };
    }

    if (state === 'idle') {
      if (energy < startThreshold) {
        return { state, energy, digest };
      }

      state = 'shaking';
      lastActiveTimestamp = timestamp;
      digest = mixSampleDigest(digest, sample, energy);
      return { state, energy, digest };
    }

    digest = mixSampleDigest(digest, sample, energy);

    if (energy >= stopThreshold) {
      lastActiveTimestamp = timestamp;
    } else if (timestamp - lastActiveTimestamp >= quietWindowMs) {
      state = 'released';
    }

    return { state, energy, digest };
  };

  return { reset, update };
}
