import { describe, expect, it } from 'vitest';
import type { CoinFace } from '../domain/types';
import type { PhysicalTossInput } from '../physics/physicalTossInput';
import type { SettledToss } from '../physics/tossSimulation';
import {
  castingSessionReducer,
  createCastingSessionState,
  type CastingSessionState
} from './castingSession';

function fakeInput(throwIndex: number): PhysicalTossInput {
  return {
    source: 'pointer',
    currentThrow: throwIndex,
    coins: [0, 1, 2].map((slot) => ({
      position: [slot, 1, 0],
      rotation: [0, 0, 0, 1],
      linearVelocity: [0, 1, 0],
      angularVelocity: [1, 0, 0]
    })) as PhysicalTossInput['coins'],
    energy: 0.4 + throwIndex * 0.05,
    durationMs: 200,
    perturbationSeed: 1000 + throwIndex,
    perturbationScale: 0.05
  };
}

function fakeSettled(faces: [CoinFace, CoinFace, CoinFace]): SettledToss {
  return { faces, settledReason: 'strict', settledTimeMs: 1800 };
}

function castLine(
  state: CastingSessionState,
  faces: [CoinFace, CoinFace, CoinFace]
): CastingSessionState {
  const throwIndex = state.machine.throwIndex;
  let next = castingSessionReducer(state, { type: 'start-charging' });
  next = castingSessionReducer(next, { type: 'release', input: fakeInput(throwIndex) });
  next = castingSessionReducer(next, { type: 'simulation-started' });
  next = castingSessionReducer(next, { type: 'settled', settled: fakeSettled(faces) });
  return castingSessionReducer(next, { type: 'line-recorded' });
}

const SIX_LINES: Array<[CoinFace, CoinFace, CoinFace]> = [
  ['heads', 'heads', 'tails'],
  ['heads', 'tails', 'tails'],
  ['tails', 'tails', 'tails'],
  ['heads', 'heads', 'heads'],
  ['heads', 'tails', 'heads'],
  ['tails', 'heads', 'heads']
];

describe('castingSession', () => {
  it('accumulates evidence and scores six lines into a result', () => {
    let state = createCastingSessionState();
    state = castingSessionReducer(state, {
      type: 'set-question',
      question: '  今年事业如何？ ',
      questionType: 'career'
    });

    SIX_LINES.forEach((faces) => {
      state = castLine(state, faces);
    });

    expect(state.machine.phase).toBe('result');
    expect(state.tosses).toHaveLength(6);
    expect(state.evidences).toHaveLength(6);
    expect(state.result).not.toBeNull();
    expect(state.result?.question).toBe('今年事业如何？');
    expect(state.result?.questionType).toBe('career');

    // Evidence scores match the domain scoring of the same faces.
    state.evidences.forEach((evidence, index) => {
      expect(evidence.throwIndex).toBe(index + 1);
      expect(evidence.faces).toEqual(SIX_LINES[index]);
      expect(evidence.score).toBe(state.tosses[index].score);
      expect(evidence.lineName).toBe(state.tosses[index].line.name);
      expect(evidence.inputSource).toBe('pointer');
      expect(evidence.settledReason).toBe('strict');
    });

    // 第 3 爻全 tails = 老阴（动），第 4 爻全 heads = 老阳（动）→ 有变卦。
    expect(state.evidences[2].lineName).toBe('old-yin');
    expect(state.evidences[2].isMoving).toBe(true);
    expect(state.evidences[3].lineName).toBe('old-yang');
    expect(state.result?.movingLines.map((line) => line.position)).toEqual([3, 4]);
    expect(state.result?.changedHexagram).not.toBeNull();
  });

  it('works without any question (question is optional)', () => {
    let state = createCastingSessionState();

    SIX_LINES.forEach((faces) => {
      state = castLine(state, faces);
    });

    expect(state.result).not.toBeNull();
    expect(state.result?.question).toBe('');
  });

  it('does not score or expose the current line before settlement', () => {
    let state = createCastingSessionState();
    state = castLine(state, ['heads', 'heads', 'tails']);
    expect(state.tosses).toHaveLength(1);

    // Walk the second line up to simulating: nothing new may be scored.
    let inFlight = castingSessionReducer(state, { type: 'start-charging' });
    inFlight = castingSessionReducer(inFlight, { type: 'release', input: fakeInput(2) });
    inFlight = castingSessionReducer(inFlight, { type: 'simulation-started' });

    expect(inFlight.tosses).toHaveLength(1);
    expect(inFlight.evidences).toHaveLength(1);
    expect(inFlight.machine.settled).toBeNull();

    // record-line before settled is a no-op.
    const blocked = castingSessionReducer(inFlight, { type: 'line-recorded' });
    expect(blocked.tosses).toHaveLength(1);
    expect(blocked.machine.phase).toBe('simulating');
  });

  it('keeps each evidence tied to its own physical input and settled toss', () => {
    let state = createCastingSessionState();
    state = castLine(state, ['heads', 'heads', 'tails']);
    state = castLine(state, ['tails', 'tails', 'tails']);

    expect(state.evidences[0].throwIndex).toBe(1);
    expect(state.evidences[1].throwIndex).toBe(2);
    expect(state.evidences[0].inputSummary.energy).not.toBe(
      state.evidences[1].inputSummary.energy
    );
  });

  it('resets back to a clean idle session', () => {
    let state = createCastingSessionState();
    state = castLine(state, ['heads', 'heads', 'tails']);
    state = castingSessionReducer(state, { type: 'reset' });

    expect(state.machine.phase).toBe('idle');
    expect(state.machine.throwIndex).toBe(1);
    expect(state.tosses).toHaveLength(0);
    expect(state.evidences).toHaveLength(0);
    expect(state.result).toBeNull();
    expect(state.aiReading).toBeNull();
    expect(state.aiError).toBeNull();
  });

  function castAllSix(state: CastingSessionState): CastingSessionState {
    let next = state;
    SIX_LINES.forEach((faces) => {
      next = castLine(next, faces);
    });
    return next;
  }

  it('carries AI reading through the session without touching the traditional result', () => {
    let state = castAllSix(createCastingSessionState());
    expect(state.machine.phase).toBe('result');
    const result = state.result;

    // reading-started 只能从结果链路进入；起卦中是 no-op。
    const midCast = castLine(createCastingSessionState(), ['heads', 'heads', 'tails']);
    expect(castingSessionReducer(midCast, { type: 'reading-started' })).toBe(midCast);

    state = castingSessionReducer(state, { type: 'reading-started' });
    expect(state.machine.phase).toBe('reading');
    expect(state.result).toBe(result);
    expect(state.aiError).toBeNull();

    // 失败：保留传统结果与证据，可重试。
    state = castingSessionReducer(state, { type: 'reading-failed', message: '网络错误' });
    expect(state.machine.phase).toBe('reading-error');
    expect(state.result).toBe(result);
    expect(state.tosses).toHaveLength(6);
    expect(state.aiReading).toBeNull();
    expect(state.aiError).toBe('网络错误');

    state = castingSessionReducer(state, { type: 'reading-started' });
    expect(state.machine.phase).toBe('reading');
    expect(state.aiError).toBeNull();

    // 成功：写入解读，传统结果不变。
    const reading = { headline: 'h', plainText: 'p', advice: ['a'] };
    state = castingSessionReducer(state, { type: 'reading-finished', reading });
    expect(state.machine.phase).toBe('reading-ready');
    expect(state.result).toBe(result);
    expect(state.aiReading).toEqual(reading);
    expect(state.aiError).toBeNull();

    // 非法转换不改变状态。
    expect(castingSessionReducer(state, { type: 'reading-failed', message: 'x' })).toBe(state);
  });

  it('reset clears AI reading state along with the casting', () => {
    let state = castAllSix(createCastingSessionState());
    state = castingSessionReducer(state, { type: 'reading-started' });
    state = castingSessionReducer(state, { type: 'reading-failed', message: '网络错误' });
    state = castingSessionReducer(state, { type: 'reset' });

    expect(state.machine.phase).toBe('idle');
    expect(state.aiReading).toBeNull();
    expect(state.aiError).toBeNull();
  });

  it('rejects question changes once a result exists (including during reading)', () => {
    let state = castAllSix(createCastingSessionState());
    state = castingSessionReducer(state, { type: 'reading-started' });

    const next = castingSessionReducer(state, {
      type: 'set-question',
      question: '换一个问题',
      questionType: 'wealth'
    });
    expect(next).toBe(state);
  });
});
