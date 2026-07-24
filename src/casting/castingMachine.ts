// Casting flow state machine (redesign doc section 4.3) — the single
// source of truth for the casting flow.
//
//   idle → charging → released → simulating → settled
//     → (record-line) → ready        (lines 1-5)
//     → (record-line) → result       (line 6)
//
// Hard rules enforced here:
// - A toss can only be released from `charging` (one deliberate action
//   per line; there is no one-click six-line generation).
// - Settlement is only accepted from `simulating`.
// - Scoring (record-line) is only possible from `settled` — never before.
// - `simulating` has a maximum protection budget (SIMULATION_GUARD_MS);
//   the physics layer always resolves within its hard cap through the
//   physical timeout-readable path, so the flow can never get stuck.

import type { PhysicalTossInput } from '../physics/physicalTossInput';
import type { SettledToss } from '../physics/tossSimulation';

export type CastingPhase =
  | 'idle'
  | 'charging'
  | 'released'
  | 'simulating'
  | 'settled'
  | 'ready'
  | 'result';

export const TOTAL_LINES = 6;

/** Max wall-clock budget for one toss before the physical timeout path must have resolved it. */
export const SIMULATION_GUARD_MS = 12_000;

export interface CastingMachineState {
  phase: CastingPhase;
  /** 1-based index of the line currently being cast. */
  throwIndex: number;
  /** The physical input of the in-flight toss (released/simulating/settled). */
  input: PhysicalTossInput | null;
  /** The settled outcome of the in-flight toss (settled phase only). */
  settled: SettledToss | null;
}

export type CastingMachineEvent =
  | { type: 'start-charging' }
  | { type: 'cancel-charge' }
  | { type: 'release'; input: PhysicalTossInput }
  | { type: 'simulation-started' }
  | { type: 'settled'; settled: SettledToss }
  | { type: 'line-recorded' }
  | { type: 'reset' };

export function createInitialMachineState(): CastingMachineState {
  return { phase: 'idle', throwIndex: 1, input: null, settled: null };
}

export function canStartCharging(state: CastingMachineState): boolean {
  return state.phase === 'idle' || state.phase === 'ready';
}

export function castingMachineReducer(
  state: CastingMachineState,
  event: CastingMachineEvent
): CastingMachineState {
  switch (event.type) {
    case 'start-charging':
      if (!canStartCharging(state)) {
        return state;
      }
      return { ...state, phase: 'charging', input: null, settled: null };

    case 'cancel-charge':
      if (state.phase !== 'charging') {
        return state;
      }
      return {
        ...state,
        phase: state.throwIndex <= 1 ? 'idle' : 'ready',
        input: null,
        settled: null
      };

    case 'release':
      if (state.phase !== 'charging') {
        return state;
      }
      return { ...state, phase: 'released', input: event.input, settled: null };

    case 'simulation-started':
      if (state.phase !== 'released') {
        return state;
      }
      return { ...state, phase: 'simulating' };

    case 'settled':
      if (state.phase !== 'simulating') {
        return state;
      }
      return { ...state, phase: 'settled', settled: event.settled };

    case 'line-recorded': {
      if (state.phase !== 'settled') {
        return state;
      }
      const isFinalLine = state.throwIndex >= TOTAL_LINES;
      return {
        phase: isFinalLine ? 'result' : 'ready',
        throwIndex: isFinalLine ? state.throwIndex : state.throwIndex + 1,
        input: null,
        settled: null
      };
    }

    case 'reset':
      return createInitialMachineState();
  }
}
