export type PhysicalTossSource = 'pointer' | 'motion' | 'keyboard';
export type Vec3Tuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];

export interface PhysicalCoinInitialState {
  position: Vec3Tuple;
  rotation: QuaternionTuple;
  linearVelocity: Vec3Tuple;
  angularVelocity: Vec3Tuple;
}

export interface PhysicalTossInput {
  source: PhysicalTossSource;
  currentThrow: number;
  coins: [PhysicalCoinInitialState, PhysicalCoinInitialState, PhysicalCoinInitialState];
  energy: number;
  durationMs: number;
  perturbationSeed: number;
  perturbationScale: number;
}

export interface PointerTossSample {
  x: number;
  y: number;
  timestamp: number;
}

export interface PointerTossInputParams {
  currentThrow: number;
  samples: readonly PointerTossSample[];
  sceneWidth: number;
  sceneHeight: number;
  perturbationSeed: number;
}

export interface MotionTossSummary {
  currentThrow: number;
  durationMs: number;
  energy: number;
  digest: number;
  peakCount: number;
  dominantAcceleration: Vec3Tuple;
  rotationBias: Vec3Tuple;
  perturbationSeed: number;
}

export interface KeyboardTossInputParams {
  currentThrow: number;
  perturbationSeed: number;
}

const MIN_POINTER_ENERGY = 0.32;
const MIN_KEYBOARD_ENERGY = 0.38;
const MAX_ENERGY = 1.45;
const POINTER_SCENE_X_RANGE = 4.8;
const POINTER_SCENE_Z_RANGE = 3.1;
const POINTER_TRAJECTORY_SAMPLE_LIMIT = 64;
const DEFAULT_COIN_ORIGIN: Vec3Tuple = [0, 0, -0.16];

interface PointerTrajectoryProfile {
  digest: number;
  totalDistance: number;
  turnEnergy: number;
  accelerationEnergy: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function mixDigest(seed: number, value: number): number {
  let mixed = (seed ^ (value >>> 0)) >>> 0;

  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function quantize(value: number, scale: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * scale);
}

function normalizeVector(vector: Vec3Tuple, fallback: Vec3Tuple): Vec3Tuple {
  const length = Math.hypot(vector[0], vector[1], vector[2]);

  if (length < 0.0001) {
    return fallback;
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function normalizeQuaternion(quaternion: QuaternionTuple): QuaternionTuple {
  const length = Math.hypot(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);

  if (length < 0.0001) {
    return [0, 0, 0, 1];
  }

  return [
    quaternion[0] / length,
    quaternion[1] / length,
    quaternion[2] / length,
    quaternion[3] / length
  ];
}

function createAxisAngleQuaternion(axis: Vec3Tuple, angle: number): QuaternionTuple {
  const halfAngle = angle / 2;
  const sinHalfAngle = Math.sin(halfAngle);

  return [
    axis[0] * sinHalfAngle,
    axis[1] * sinHalfAngle,
    axis[2] * sinHalfAngle,
    Math.cos(halfAngle)
  ];
}

function multiplyQuaternions(left: QuaternionTuple, right: QuaternionTuple): QuaternionTuple {
  const [leftX, leftY, leftZ, leftW] = left;
  const [rightX, rightY, rightZ, rightW] = right;

  return [
    leftW * rightX + leftX * rightW + leftY * rightZ - leftZ * rightY,
    leftW * rightY - leftX * rightZ + leftY * rightW + leftZ * rightX,
    leftW * rightZ + leftX * rightY - leftY * rightX + leftZ * rightW,
    leftW * rightW - leftX * rightX - leftY * rightY - leftZ * rightZ
  ];
}

function createInitialCoinRotation(random: () => number, slot: number): QuaternionTuple {
  const faceFlip = random() >= 0.5 ? 0 : Math.PI;
  const yaw = random() * Math.PI * 2;
  const tiltX = (random() - 0.5) * 0.42;
  const tiltZ = (random() - 0.5) * 0.42 + slot * 0.21;
  const yawRotation = createAxisAngleQuaternion([0, 1, 0], yaw);
  const faceRotation = createAxisAngleQuaternion([1, 0, 0], faceFlip + tiltX);
  const tiltRotation = createAxisAngleQuaternion([0, 0, 1], tiltZ);

  return normalizeQuaternion(
    multiplyQuaternions(multiplyQuaternions(yawRotation, faceRotation), tiltRotation)
  );
}

function ensureMinimumAngularVelocity(vector: Vec3Tuple): Vec3Tuple {
  const minimumAngularSpeed = 2.05;
  const length = Math.hypot(vector[0], vector[1], vector[2]);

  if (length >= minimumAngularSpeed) {
    return vector;
  }

  const direction = normalizeVector(vector, [1, 0, 0]);

  return [
    direction[0] * minimumAngularSpeed,
    direction[1] * minimumAngularSpeed,
    direction[2] * minimumAngularSpeed
  ];
}

function pointerSampleToSceneOrigin(
  sample: PointerTossSample | undefined,
  sceneWidth: number,
  sceneHeight: number
): Vec3Tuple {
  const safeWidth = Math.max(sceneWidth, 1);
  const safeHeight = Math.max(sceneHeight, 1);
  const normalizedX = clamp((sample?.x ?? safeWidth / 2) / safeWidth, 0, 1);
  const normalizedY = clamp((sample?.y ?? safeHeight / 2) / safeHeight, 0, 1);

  return [
    (normalizedX - 0.5) * POINTER_SCENE_X_RANGE,
    0,
    (normalizedY - 0.5) * POINTER_SCENE_Z_RANGE
  ];
}

function createPointerTrajectoryProfile(
  samples: readonly PointerTossSample[],
  sceneWidth: number,
  sceneHeight: number
): PointerTrajectoryProfile {
  const safeWidth = Math.max(sceneWidth, 1);
  const safeHeight = Math.max(sceneHeight, 1);
  let digest = 0x811c9dc5;
  let totalDistance = 0;
  let turnEnergy = 0;
  let accelerationEnergy = 0;
  let previousVelocityX = 0;
  let previousVelocityY = 0;
  let previousSpeed = 0;
  let hasPreviousVelocity = false;

  samples.forEach((sample, index) => {
    digest = mixDigest(digest, quantize(sample.x / safeWidth, 100000));
    digest = mixDigest(digest, quantize(sample.y / safeHeight, 100000));
    digest = mixDigest(digest, quantize(sample.timestamp, 10));

    if (index === 0) {
      return;
    }

    const previous = samples[index - 1];
    const deltaMs = Math.max(1, sample.timestamp - previous.timestamp);
    const deltaX = (sample.x - previous.x) / safeWidth;
    const deltaY = (sample.y - previous.y) / safeHeight;
    const distance = Math.hypot(deltaX, deltaY);
    const velocityX = deltaX / deltaMs;
    const velocityY = deltaY / deltaMs;
    const speed = Math.hypot(velocityX, velocityY);

    totalDistance += distance;
    digest = mixDigest(digest, quantize(deltaX, 100000));
    digest = mixDigest(digest, quantize(deltaY, 100000));
    digest = mixDigest(digest, quantize(deltaMs, 10));

    if (hasPreviousVelocity) {
      const cross = previousVelocityX * velocityY - previousVelocityY * velocityX;
      const dot = previousVelocityX * velocityX + previousVelocityY * velocityY;
      const turn = Math.abs(Math.atan2(cross, dot));

      turnEnergy += turn * Math.min(speed * 1000, 4);
      accelerationEnergy += Math.abs(speed - previousSpeed) * 1000;
      digest = mixDigest(digest, quantize(turn, 10000));
      digest = mixDigest(digest, quantize(speed - previousSpeed, 1000000));
    }

    previousVelocityX = velocityX;
    previousVelocityY = velocityY;
    previousSpeed = speed;
    hasPreviousVelocity = true;
  });

  return {
    digest,
    totalDistance,
    turnEnergy,
    accelerationEnergy
  };
}

function createCoinStates(
  source: PhysicalTossSource,
  currentThrow: number,
  energy: number,
  durationMs: number,
  direction: Vec3Tuple,
  spinBias: Vec3Tuple,
  perturbationSeed: number,
  perturbationScale: number,
  origin: Vec3Tuple = DEFAULT_COIN_ORIGIN
): [PhysicalCoinInitialState, PhysicalCoinInitialState, PhysicalCoinInitialState] {
  const random = createSeededRandom(
    perturbationSeed ^
      Math.imul(currentThrow + 29, 0x9e3779b1) ^
      Math.imul(source.length + 7, 0x85ebca6b)
  );
  const safeDirection = normalizeVector(direction, [0, 0, -1]);

  return [0, 1, 2].map((entry) => {
    const slot = entry - 1;
    const jitter = () => (random() - 0.5) * perturbationScale;
    const verticalLift = 0.72 + energy * 0.52 + random() * 0.08;
    const spread = source === 'pointer' ? 1.12 + energy * 0.08 : 0.24 + energy * 0.12;
    const positionJitterScale = source === 'pointer' ? 0.35 : 1;
    const rawAngularVelocityX =
      spinBias[0] * (0.018 + energy * 0.012) + slot * (2.2 + energy) + jitter() * 6;
    const pointerAngularVelocityX =
      (random() >= 0.5 ? 1 : -1) * Math.max(Math.abs(rawAngularVelocityX), 0.75 + energy * 2);
    const rotation = createInitialCoinRotation(random, slot);
    const angularVelocity: Vec3Tuple = [
      source === 'pointer' ? pointerAngularVelocityX : rawAngularVelocityX,
      spinBias[1] * (0.012 + energy * 0.01) + (random() - 0.5) * 5.5,
      spinBias[2] * (0.018 + energy * 0.012) + (random() - 0.5) * 7.5
    ];

    return {
      position: [
        origin[0] + slot * spread + jitter() * positionJitterScale,
        verticalLift + entry * 0.035 + jitter() * 0.4,
        origin[2] + slot * 0.04 + jitter() * positionJitterScale
      ],
      rotation,
      linearVelocity: [
        safeDirection[0] * (0.74 + energy * 1.28) + slot * 0.12 + jitter(),
        1.04 + energy * 1.72 + random() * 0.16,
        safeDirection[2] * (0.74 + energy * 1.28) + jitter()
      ],
      angularVelocity: ensureMinimumAngularVelocity(angularVelocity)
    };
  }) as [PhysicalCoinInitialState, PhysicalCoinInitialState, PhysicalCoinInitialState];
}

export function createPointerPhysicalTossInput(params: PointerTossInputParams): PhysicalTossInput {
  const trajectorySamples = params.samples.slice(-POINTER_TRAJECTORY_SAMPLE_LIMIT);
  const samples = trajectorySamples.slice(-6);
  const first = samples[0];
  const last = samples[samples.length - 1] ?? first;
  const previous = samples[Math.max(0, samples.length - 2)] ?? first;
  const trajectoryProfile = createPointerTrajectoryProfile(
    trajectorySamples,
    params.sceneWidth,
    params.sceneHeight
  );
  const durationMs = Math.max(1, (last?.timestamp ?? 0) - (first?.timestamp ?? 0));
  const deltaMs = Math.max(1, (last?.timestamp ?? 0) - (previous?.timestamp ?? 0));
  const velocityX = ((last?.x ?? 0) - (previous?.x ?? 0)) / deltaMs;
  const velocityY = ((last?.y ?? 0) - (previous?.y ?? 0)) / deltaMs;
  const pathX = ((last?.x ?? 0) - (first?.x ?? 0)) / Math.max(params.sceneWidth, 1);
  const pathY = ((last?.y ?? 0) - (first?.y ?? 0)) / Math.max(params.sceneHeight, 1);
  const speed = Math.hypot(velocityX, velocityY);
  const shakeEnergy =
    trajectoryProfile.totalDistance * 0.34 +
    trajectoryProfile.turnEnergy * 0.014 +
    trajectoryProfile.accelerationEnergy * 0.026;
  const energy = clamp(
    speed * 0.72 + durationMs / 1800 + shakeEnergy,
    MIN_POINTER_ENERGY,
    MAX_ENERGY
  );
  const direction = normalizeVector([pathX, 0, pathY], [velocityX, 0, velocityY || -1]);
  const spinBias: Vec3Tuple = [
    velocityY * 850 + trajectoryProfile.turnEnergy * 48,
    velocityX * 560 + trajectoryProfile.accelerationEnergy * 32,
    (velocityX - velocityY) * 420 + trajectoryProfile.totalDistance * 120
  ];
  const perturbationScale = clamp(
    0.035 + speed * 0.018 + shakeEnergy * 0.012,
    0.035,
    0.09
  );
  const origin = pointerSampleToSceneOrigin(last, params.sceneWidth, params.sceneHeight);
  const perturbationSeed = (params.perturbationSeed ^ trajectoryProfile.digest) >>> 0;

  return {
    source: 'pointer',
    currentThrow: params.currentThrow,
    coins: createCoinStates(
      'pointer',
      params.currentThrow,
      energy,
      durationMs,
      direction,
      spinBias,
      perturbationSeed,
      perturbationScale,
      origin
    ),
    energy,
    durationMs,
    perturbationSeed,
    perturbationScale
  };
}

export function createMotionPhysicalTossInput(summary: MotionTossSummary): PhysicalTossInput {
  const energy = clamp(summary.energy / 2.2 + summary.peakCount * 0.035, 0.34, MAX_ENERGY);
  const direction = normalizeVector(
    [summary.dominantAcceleration[0], 0, summary.dominantAcceleration[1]],
    [0, 0, -1]
  );
  const perturbationScale = clamp(0.035 + (summary.digest % 17) / 1000, 0.035, 0.075);

  return {
    source: 'motion',
    currentThrow: summary.currentThrow,
    coins: createCoinStates(
      'motion',
      summary.currentThrow,
      energy,
      summary.durationMs,
      direction,
      summary.rotationBias,
      summary.perturbationSeed ^ summary.digest,
      perturbationScale
    ),
    energy,
    durationMs: summary.durationMs,
    perturbationSeed: (summary.perturbationSeed ^ summary.digest) >>> 0,
    perturbationScale
  };
}

export function createKeyboardPhysicalTossInput(params: KeyboardTossInputParams): PhysicalTossInput {
  const energy = MIN_KEYBOARD_ENERGY;

  return {
    source: 'keyboard',
    currentThrow: params.currentThrow,
    coins: createCoinStates(
      'keyboard',
      params.currentThrow,
      energy,
      180,
      [0.12, 0, -1],
      [160, 90, 240],
      params.perturbationSeed,
      0.045
    ),
    energy,
    durationMs: 180,
    perturbationSeed: params.perturbationSeed >>> 0,
    perturbationScale: 0.045
  };
}
