export type DeviceMotionTossState = 'idle' | 'shaking' | 'released';

export interface DeviceMotionTossSummary {
  durationMs: number;
  energy: number;
  digest: number;
  peakCount: number;
  dominantAcceleration: [number, number, number];
  rotationBias: [number, number, number];
}

export interface DeviceMotionSample {
  timestamp: number;
  accelerationMagnitude: number;
  rotationMagnitude: number;
  accelerationVector?: [number, number, number];
  rotationVector?: [number, number, number];
}

export interface DeviceMotionTossResult {
  state: DeviceMotionTossState;
  energy: number;
  digest: number;
  summary: DeviceMotionTossSummary | null;
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

function addWeightedVector(
  total: [number, number, number],
  vector: [number, number, number] | undefined,
  weight: number
): [number, number, number] {
  if (!vector) {
    return total;
  }

  return [
    total[0] + vector[0] * weight,
    total[1] + vector[1] * weight,
    total[2] + vector[2] * weight
  ];
}

function normalizeVector(
  vector: [number, number, number],
  fallback: [number, number, number]
): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);

  if (length < 0.0001) {
    return fallback;
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
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
  let startedAt = 0;
  let totalEnergy = 0;
  let peakCount = 0;
  let lastEnergy = 0;
  let accelerationTotal: [number, number, number] = [0, 0, 0];
  let rotationTotal: [number, number, number] = [0, 0, 0];
  let releasedSummary: DeviceMotionTossSummary | null = null;

  const createSummary = (timestamp: number): DeviceMotionTossSummary => ({
    durationMs: timestamp - startedAt,
    energy: totalEnergy,
    digest,
    peakCount,
    dominantAcceleration: normalizeVector(accelerationTotal, [1, 0, 0]),
    rotationBias: rotationTotal
  });

  const createResult = (energy: number): DeviceMotionTossResult => ({
    state,
    energy,
    digest,
    summary: state === 'released' ? releasedSummary : null
  });

  const trackShakingSample = (sample: DeviceMotionSample, energy: number) => {
    totalEnergy += energy;
    accelerationTotal = addWeightedVector(accelerationTotal, sample.accelerationVector, energy);
    rotationTotal = addWeightedVector(rotationTotal, sample.rotationVector, 1);

    if (energy > startThreshold && lastEnergy <= startThreshold) {
      peakCount += 1;
    }

    lastEnergy = energy;
  };

  const reset = () => {
    state = 'idle';
    digest = 0;
    lastActiveTimestamp = 0;
    startedAt = 0;
    totalEnergy = 0;
    peakCount = 0;
    lastEnergy = 0;
    accelerationTotal = [0, 0, 0];
    rotationTotal = [0, 0, 0];
    releasedSummary = null;
  };

  const update = (sample: DeviceMotionSample): DeviceMotionTossResult => {
    const timestamp = finiteMagnitude(sample.timestamp);
    const energy = calculateEnergy(sample);

    if (state === 'released') {
      return createResult(energy);
    }

    if (state === 'idle') {
      if (energy < startThreshold) {
        return createResult(energy);
      }

      state = 'shaking';
      startedAt = timestamp;
      lastActiveTimestamp = timestamp;
      digest = mixSampleDigest(digest, sample, energy);
      trackShakingSample(sample, energy);
      return createResult(energy);
    }

    if (energy >= stopThreshold) {
      digest = mixSampleDigest(digest, sample, energy);
      trackShakingSample(sample, energy);
      lastActiveTimestamp = timestamp;
    } else if (timestamp - lastActiveTimestamp >= quietWindowMs) {
      state = 'released';
      releasedSummary = createSummary(timestamp);
    } else {
      lastEnergy = energy;
    }

    return createResult(energy);
  };

  return { reset, update };
}
