// PC / touch chamber input: press-and-hold to shake, release to toss.
//
// The chamber only records pointer samples and computes an energy
// estimate for HUD feedback. On release it seals the samples into a
// PhysicalTossInput through the shared mapper — it never touches faces.

import {
  createPointerPhysicalTossInput,
  type PhysicalTossInput,
  type PointerTossSample
} from '../physics/physicalTossInput';

/** Rolling sample window; matches the physical toss interaction design (180-250ms). */
const SAMPLE_WINDOW_MS = 240;
const MAX_SAMPLES = 128;

export interface PointerChamberState {
  charging: boolean;
  pointerId: number | null;
  samples: PointerTossSample[];
}

export interface ChamberEnergySummary {
  /** 0..1 live energy estimate for HUD feedback. */
  energy: number;
  durationMs: number;
}

export function createPointerChamber(): PointerChamberState {
  return { charging: false, pointerId: null, samples: [] };
}

export function beginChamberCharge(
  state: PointerChamberState,
  pointerId: number,
  x: number,
  y: number,
  timestamp: number
): PointerChamberState {
  if (state.charging) {
    return state;
  }

  return {
    charging: true,
    pointerId,
    samples: [{ x, y, timestamp }]
  };
}

export function recordChamberSample(
  state: PointerChamberState,
  pointerId: number,
  x: number,
  y: number,
  timestamp: number
): PointerChamberState {
  if (!state.charging || state.pointerId !== pointerId) {
    return state;
  }

  const samples = [...state.samples, { x, y, timestamp }]
    .filter((sample) => timestamp - sample.timestamp <= SAMPLE_WINDOW_MS)
    .slice(-MAX_SAMPLES);

  return { ...state, samples };
}

/** Live energy estimate for the HUD while shaking. */
export function summarizeChamberEnergy(
  state: PointerChamberState,
  sceneWidth: number,
  sceneHeight: number,
  now: number
): ChamberEnergySummary {
  const samples = state.samples;
  const first = samples[0];

  if (!state.charging || !first || samples.length < 2) {
    return { energy: 0, durationMs: 0 };
  }

  const safeWidth = Math.max(sceneWidth, 1);
  const safeHeight = Math.max(sceneHeight, 1);
  let distance = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    distance += Math.hypot(
      (current.x - previous.x) / safeWidth,
      (current.y - previous.y) / safeHeight
    );
  }

  const windowMs = Math.max(1, samples[samples.length - 1].timestamp - first.timestamp);
  const speed = distance / (windowMs / 1000);

  return {
    energy: Math.min(1, speed * 0.55 + distance * 0.35),
    durationMs: Math.max(0, now - first.timestamp)
  };
}

export interface SealChamberTossParams {
  currentThrow: number;
  sceneWidth: number;
  sceneHeight: number;
  perturbationSeed: number;
  timestamp: number;
}

/**
 * Seal the current charge into a PhysicalTossInput. Returns null when the
 * chamber was not charging (e.g. pointer cancelled) so callers never
 * fabricate a toss from nothing.
 */
export function sealChamberToss(
  state: PointerChamberState,
  pointerId: number,
  params: SealChamberTossParams
): { input: PhysicalTossInput; next: PointerChamberState } | null {
  if (!state.charging || state.pointerId !== pointerId) {
    return null;
  }

  const samples =
    state.samples.length > 0
      ? [...state.samples, { x: state.samples[state.samples.length - 1].x, y: state.samples[state.samples.length - 1].y, timestamp: params.timestamp }]
      : [{ x: 0, y: 0, timestamp: params.timestamp }];

  const input = createPointerPhysicalTossInput({
    currentThrow: params.currentThrow,
    samples,
    sceneWidth: params.sceneWidth,
    sceneHeight: params.sceneHeight,
    perturbationSeed: params.perturbationSeed
  });

  return { input, next: createPointerChamber() };
}

export function cancelChamberCharge(
  state: PointerChamberState,
  pointerId: number
): PointerChamberState {
  if (!state.charging || state.pointerId !== pointerId) {
    return state;
  }

  return createPointerChamber();
}
