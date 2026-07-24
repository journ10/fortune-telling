// Keyboard fallback input: hold Space/Enter to charge, release to toss.
//
// Hold duration and rhythm only shape the physical input's energy and
// seed; the toss goes through the exact same physics pipeline as pointer
// input. The keyboard path never generates faces directly.

import {
  createKeyboardPhysicalTossInput,
  type PhysicalTossInput
} from '../physics/physicalTossInput';

export const KEYBOARD_TOSS_KEYS = new Set([' ', 'Spacebar', 'Enter']);

export interface KeyboardTossTracker {
  charging: boolean;
  key: string | null;
  startedAt: number | null;
}

export function createKeyboardTossTracker(): KeyboardTossTracker {
  return { charging: false, key: null, startedAt: null };
}

export function isTossKey(key: string): boolean {
  return KEYBOARD_TOSS_KEYS.has(key);
}

export function beginKeyboardCharge(
  tracker: KeyboardTossTracker,
  key: string,
  timestamp: number
): KeyboardTossTracker {
  if (tracker.charging || !isTossKey(key)) {
    return tracker;
  }

  return { charging: true, key, startedAt: timestamp };
}

/** Live energy estimate for the HUD while the key is held. */
export function summarizeKeyboardEnergy(
  tracker: KeyboardTossTracker,
  now: number
): { energy: number; durationMs: number } {
  if (!tracker.charging || tracker.startedAt === null) {
    return { energy: 0, durationMs: 0 };
  }

  const durationMs = Math.max(0, now - tracker.startedAt);

  return { energy: Math.min(1, durationMs / 2400), durationMs };
}

export interface SealKeyboardTossParams {
  currentThrow: number;
  perturbationSeed: number;
  timestamp: number;
}

export function sealKeyboardToss(
  tracker: KeyboardTossTracker,
  key: string,
  params: SealKeyboardTossParams
): { input: PhysicalTossInput; next: KeyboardTossTracker } | null {
  if (!tracker.charging || tracker.key !== key || tracker.startedAt === null) {
    return null;
  }

  const holdMs = Math.max(0, params.timestamp - tracker.startedAt);
  const input = createKeyboardPhysicalTossInput({
    currentThrow: params.currentThrow,
    perturbationSeed: params.perturbationSeed,
    holdMs
  });

  return { input, next: createKeyboardTossTracker() };
}

export function cancelKeyboardCharge(tracker: KeyboardTossTracker): KeyboardTossTracker {
  return createKeyboardTossTracker();
}
