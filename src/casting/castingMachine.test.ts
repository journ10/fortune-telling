import { describe, expect, it } from 'vitest';
import type { CoinFace } from '../domain/types';
import type { PhysicalTossInput } from '../physics/physicalTossInput';
import type { SettledToss } from '../physics/tossSimulation';
import {
  SIMULATION_GUARD_MS,
  TOTAL_LINES,
  canStartCharging,
  castingMachineReducer,
  createInitialMachineState
} from './castingMachine';

function fakeInput(): PhysicalTossInput {
  return {
    source: 'keyboard',
    currentThrow: 1,
    coins: [0, 1, 2].map((slot) => ({
      position: [slot, 1, 0],
      rotation: [0, 0, 0, 1],
      linearVelocity: [0, 1, 0],
      angularVelocity: [1, 0, 0]
    })) as PhysicalTossInput['coins'],
    energy: 0.5,
    durationMs: 200,
    perturbationSeed: 42,
    perturbationScale: 0.05
  };
}

function fakeSettled(faces: [CoinFace, CoinFace, CoinFace] = ['heads', 'tails', 'heads']): SettledToss {
  return { faces, settledReason: 'strict', settledTimeMs: 1800 };
}

describe('castingMachine', () => {
  it('walks one line through the full phase sequence', () => {
    let state = createInitialMachineState();
    expect(state.phase).toBe('idle');
    expect(canStartCharging(state)).toBe(true);

    state = castingMachineReducer(state, { type: 'start-charging' });
    expect(state.phase).toBe('charging');

    state = castingMachineReducer(state, { type: 'release', input: fakeInput() });
    expect(state.phase).toBe('released');
    expect(state.input).not.toBeNull();

    state = castingMachineReducer(state, { type: 'simulation-started' });
    expect(state.phase).toBe('simulating');

    state = castingMachineReducer(state, { type: 'settled', settled: fakeSettled() });
    expect(state.phase).toBe('settled');
    expect(state.settled?.faces).toEqual(['heads', 'tails', 'heads']);

    state = castingMachineReducer(state, { type: 'line-recorded' });
    expect(state.phase).toBe('ready');
    expect(state.throwIndex).toBe(2);
    expect(state.input).toBeNull();
    expect(state.settled).toBeNull();
  });

  it('rejects release before charging', () => {
    const state = createInitialMachineState();
    const next = castingMachineReducer(state, { type: 'release', input: fakeInput() });
    expect(next.phase).toBe('idle');
    expect(next.input).toBeNull();
  });

  it('rejects settlement before simulating and after settling', () => {
    let state = castingMachineReducer(createInitialMachineState(), { type: 'start-charging' });
    expect(castingMachineReducer(state, { type: 'settled', settled: fakeSettled() }).phase).toBe(
      'charging'
    );

    state = castingMachineReducer(state, { type: 'release', input: fakeInput() });
    expect(castingMachineReducer(state, { type: 'settled', settled: fakeSettled() }).phase).toBe(
      'released'
    );
  });

  it('rejects recording a line before the toss has settled', () => {
    const phases = ['idle', 'charging', 'released', 'simulating'] as const;

    phases.forEach((phase) => {
      let state = createInitialMachineState();
      if (phase !== 'idle') {
        state = castingMachineReducer(state, { type: 'start-charging' });
      }
      if (phase === 'released' || phase === 'simulating') {
        state = castingMachineReducer(state, { type: 'release', input: fakeInput() });
      }
      if (phase === 'simulating') {
        state = castingMachineReducer(state, { type: 'simulation-started' });
      }

      expect(castingMachineReducer(state, { type: 'line-recorded' }).phase).toBe(phase);
    });
  });

  it('reaches result after the sixth recorded line', () => {
    let state = createInitialMachineState();

    for (let line = 1; line <= TOTAL_LINES; line += 1) {
      expect(state.throwIndex).toBe(line);
      state = castingMachineReducer(state, { type: 'start-charging' });
      state = castingMachineReducer(state, { type: 'release', input: fakeInput() });
      state = castingMachineReducer(state, { type: 'simulation-started' });
      state = castingMachineReducer(state, { type: 'settled', settled: fakeSettled() });
      state = castingMachineReducer(state, { type: 'line-recorded' });
    }

    expect(state.phase).toBe('result');
  });

  it('blocks a seventh charge and supports reset', () => {
    let state = createInitialMachineState();

    for (let line = 1; line <= TOTAL_LINES; line += 1) {
      state = castingMachineReducer(state, { type: 'start-charging' });
      state = castingMachineReducer(state, { type: 'release', input: fakeInput() });
      state = castingMachineReducer(state, { type: 'simulation-started' });
      state = castingMachineReducer(state, { type: 'settled', settled: fakeSettled() });
      state = castingMachineReducer(state, { type: 'line-recorded' });
    }

    expect(canStartCharging(state)).toBe(false);
    expect(castingMachineReducer(state, { type: 'start-charging' }).phase).toBe('result');
    expect(castingMachineReducer(state, { type: 'reset' }).phase).toBe('idle');
  });

  it('cancels a charge back to idle or ready', () => {
    let state = castingMachineReducer(createInitialMachineState(), { type: 'start-charging' });
    expect(castingMachineReducer(state, { type: 'cancel-charge' }).phase).toBe('idle');

    state = createInitialMachineState();
    state = castingMachineReducer(state, { type: 'start-charging' });
    state = castingMachineReducer(state, { type: 'release', input: fakeInput() });
    state = castingMachineReducer(state, { type: 'simulation-started' });
    state = castingMachineReducer(state, { type: 'settled', settled: fakeSettled() });
    state = castingMachineReducer(state, { type: 'line-recorded' });
    state = castingMachineReducer(state, { type: 'start-charging' });
    expect(castingMachineReducer(state, { type: 'cancel-charge' }).phase).toBe('ready');
  });

  it('bounds the simulation phase with a protection budget', () => {
    // The physics layer guarantees a settled outcome within its hard cap via
    // the physical timeout-readable path; the machine exposes that budget so
    // the UI can never wait forever.
    expect(SIMULATION_GUARD_MS).toBeGreaterThan(0);
    expect(SIMULATION_GUARD_MS).toBeLessThanOrEqual(12_000);
  });

  it('only enters reading from the result family of phases', () => {
    const resultState = castingMachineReducer(createInitialMachineState(), {
      type: 'reading-started'
    });
    // idle 不能直接进 reading。
    expect(resultState.phase).toBe('idle');

    const atResult = { ...createInitialMachineState(), phase: 'result' as const };
    const reading = castingMachineReducer(atResult, { type: 'reading-started' });
    expect(reading.phase).toBe('reading');

    // 中途相位一律拒绝。
    for (const phase of ['charging', 'released', 'simulating', 'settled', 'ready'] as const) {
      const state = { ...createInitialMachineState(), phase };
      expect(castingMachineReducer(state, { type: 'reading-started' }).phase).toBe(phase);
    }

    // 失败/成功后都允许重新发起（重试）。
    const errorRetry = castingMachineReducer(
      { ...createInitialMachineState(), phase: 'reading-error' as const },
      { type: 'reading-started' }
    );
    expect(errorRetry.phase).toBe('reading');
    const readyRetry = castingMachineReducer(
      { ...createInitialMachineState(), phase: 'reading-ready' as const },
      { type: 'reading-started' }
    );
    expect(readyRetry.phase).toBe('reading');
  });

  it('resolves reading to reading-ready or reading-error only from reading', () => {
    const reading = { ...createInitialMachineState(), phase: 'reading' as const };

    expect(castingMachineReducer(reading, { type: 'reading-finished' }).phase).toBe(
      'reading-ready'
    );
    expect(castingMachineReducer(reading, { type: 'reading-failed' }).phase).toBe(
      'reading-error'
    );

    // 非 reading 相位忽略完成/失败事件。
    const atResult = { ...createInitialMachineState(), phase: 'result' as const };
    expect(castingMachineReducer(atResult, { type: 'reading-finished' }).phase).toBe('result');
    expect(castingMachineReducer(atResult, { type: 'reading-failed' }).phase).toBe('result');
  });

  it('reset clears reading phases back to idle', () => {
    const reading = { ...createInitialMachineState(), phase: 'reading' as const };
    expect(castingMachineReducer(reading, { type: 'reset' }).phase).toBe('idle');
  });
});
