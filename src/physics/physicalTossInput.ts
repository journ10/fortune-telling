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

function normalizeVector(vector: Vec3Tuple, fallback: Vec3Tuple): Vec3Tuple {
  const length = Math.hypot(vector[0], vector[1], vector[2]);

  if (length < 0.0001) {
    return fallback;
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
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

function createCoinStates(
  source: PhysicalTossSource,
  currentThrow: number,
  energy: number,
  durationMs: number,
  direction: Vec3Tuple,
  spinBias: Vec3Tuple,
  perturbationSeed: number,
  perturbationScale: number
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
    const spread = 0.24 + energy * 0.12;
    const angularVelocity: Vec3Tuple = [
      spinBias[0] * (0.018 + energy * 0.012) + slot * (2.2 + energy) + jitter() * 6,
      spinBias[1] * (0.012 + energy * 0.01) + (random() - 0.5) * 5.5,
      spinBias[2] * (0.018 + energy * 0.012) + (random() - 0.5) * 7.5
    ];

    return {
      position: [
        slot * spread + jitter(),
        verticalLift + entry * 0.035 + jitter() * 0.4,
        -0.16 + slot * 0.04 + jitter()
      ],
      rotation: [
        (random() - 0.5) * 0.42,
        random() * Math.PI * 2,
        (random() - 0.5) * 0.42 + slot * 0.21,
        1
      ],
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
  const samples = params.samples.slice(-6);
  const first = samples[0];
  const last = samples[samples.length - 1] ?? first;
  const previous = samples[Math.max(0, samples.length - 2)] ?? first;
  const durationMs = Math.max(1, (last?.timestamp ?? 0) - (first?.timestamp ?? 0));
  const deltaMs = Math.max(1, (last?.timestamp ?? 0) - (previous?.timestamp ?? 0));
  const velocityX = ((last?.x ?? 0) - (previous?.x ?? 0)) / deltaMs;
  const velocityY = ((last?.y ?? 0) - (previous?.y ?? 0)) / deltaMs;
  const pathX = ((last?.x ?? 0) - (first?.x ?? 0)) / Math.max(params.sceneWidth, 1);
  const pathY = ((last?.y ?? 0) - (first?.y ?? 0)) / Math.max(params.sceneHeight, 1);
  const speed = Math.hypot(velocityX, velocityY);
  const energy = clamp(speed * 0.72 + durationMs / 1800, MIN_POINTER_ENERGY, MAX_ENERGY);
  const direction = normalizeVector([pathX, 0, pathY], [velocityX, 0, velocityY || -1]);
  const spinBias: Vec3Tuple = [velocityY * 850, velocityX * 560, (velocityX - velocityY) * 420];
  const perturbationScale = clamp(0.035 + speed * 0.018, 0.035, 0.09);

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
      params.perturbationSeed,
      perturbationScale
    ),
    energy,
    durationMs,
    perturbationSeed: params.perturbationSeed >>> 0,
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
