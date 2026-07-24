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

// ---------------------------------------------------------------------------
// Agitation response curve (M5): raw chamber energy is linear and heavily
// viewport-normalized — 实测自然手腕摇晃（450-600 px/s）只累积到 0.11-0.14，
// 夸张甩动（1800 px/s）也只有 0.48。直接线性驱动摇钱会感觉"太肉"。
// 响应曲线按自然摇晃标定：小输入开根号放大 + 微地板，大输入封顶。
// ---------------------------------------------------------------------------

/**
 * 标定依据（1440px 视口正弦摇晃实测）：
 *   200 px/s → raw 0.06 → 响应 0.43（明确反馈）
 *   450 px/s → raw 0.11 → 响应 0.54（自然摇晃明显蹦跳）
 *   900 px/s → raw 0.23 → 响应 0.73
 *   1400 px/s → raw 0.38 → 响应 0.90
 *   1800 px/s → raw 0.48 → 响应 1.00（夸张甩动封顶）
 */
export function agitationResponseEnergy(rawEnergy: number): number {
  if (rawEnergy < 0.01) {
    return 0;
  }
  return Math.min(1, 0.12 + Math.sqrt(rawEnergy * 1.6));
}

export interface ChamberAgitation {
  /** 世界系水平方向（屏幕 x→世界 x，屏幕 y→世界 z），未归一化。 */
  x: number;
  z: number;
  /** 经响应曲线标定后的 0..1 驱动能量。 */
  energy: number;
}

/** 从滚动采样窗口推导摇钱驱动：方向取最近两个采样的指针速度，能量过响应曲线。 */
export function agitationFromChamber(
  state: PointerChamberState,
  sceneWidth: number,
  sceneHeight: number,
  now: number
): ChamberAgitation {
  const samples = state.samples;
  const last = samples[samples.length - 1];
  const previous = samples[samples.length - 2];

  let x = 0;
  let z = 0;
  if (last && previous) {
    const dt = Math.max(1, last.timestamp - previous.timestamp) / 1000;
    x = ((last.x - previous.x) / Math.max(sceneWidth, 1)) / dt;
    z = ((last.y - previous.y) / Math.max(sceneHeight, 1)) / dt;
  }

  return {
    x,
    z,
    energy: agitationResponseEnergy(summarizeChamberEnergy(state, sceneWidth, sceneHeight, now).energy)
  };
}
