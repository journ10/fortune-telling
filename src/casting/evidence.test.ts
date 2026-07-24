// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { CoinFace } from '../domain/types';
import {
  createKeyboardPhysicalTossInput,
  type PhysicalTossInput
} from '../physics/physicalTossInput';
import {
  createCoinTossSimulation,
  initTossPhysics,
  type SettledToss
} from '../physics/tossSimulation';
import { createCastingEvidence } from './evidence';

function fakeInput(source: PhysicalTossInput['source'] = 'pointer'): PhysicalTossInput {
  return {
    source,
    currentThrow: 1,
    coins: [0, 1, 2].map((slot) => ({
      position: [slot, 1, 0],
      rotation: [0, 0, 0, 1],
      linearVelocity: [0, 1, 0],
      angularVelocity: [1, 0, 0]
    })) as PhysicalTossInput['coins'],
    energy: 0.66,
    durationMs: 240,
    perturbationSeed: 1234,
    perturbationScale: 0.05
  };
}

function fakeSettled(faces: [CoinFace, CoinFace, CoinFace]): SettledToss {
  return { faces, settledReason: 'strict', settledTimeMs: 1450 };
}

describe('createCastingEvidence', () => {
  it('scores faces through the shared domain rules', () => {
    const cases: Array<{
      faces: [CoinFace, CoinFace, CoinFace];
      score: 6 | 7 | 8 | 9;
      lineName: string;
      isMoving: boolean;
    }> = [
      { faces: ['tails', 'tails', 'tails'], score: 6, lineName: 'old-yin', isMoving: true },
      { faces: ['heads', 'tails', 'tails'], score: 7, lineName: 'young-yang', isMoving: false },
      { faces: ['heads', 'heads', 'tails'], score: 8, lineName: 'young-yin', isMoving: false },
      { faces: ['heads', 'heads', 'heads'], score: 9, lineName: 'old-yang', isMoving: true }
    ];

    cases.forEach(({ faces, score, lineName, isMoving }, index) => {
      const evidence = createCastingEvidence(index + 1, fakeInput(), fakeSettled(faces));

      expect(evidence.throwIndex).toBe(index + 1);
      expect(evidence.faces).toEqual(faces);
      expect(evidence.score).toBe(score);
      expect(evidence.lineName).toBe(lineName);
      expect(evidence.isMoving).toBe(isMoving);
    });
  });

  it('carries the input source, summary, and settlement facts', () => {
    const input = fakeInput('motion');
    const settled = fakeSettled(['heads', 'tails', 'heads']);
    const evidence = createCastingEvidence(3, input, settled);

    expect(evidence.inputSource).toBe('motion');
    expect(evidence.inputSummary).toEqual({
      energy: input.energy,
      durationMs: input.durationMs,
      perturbationScale: input.perturbationScale
    });
    expect(evidence.settledReason).toBe('strict');
    expect(evidence.settledTimeMs).toBe(1450);
  });

  describe('integration with the physical simulation', () => {
    beforeAll(async () => {
      await initTossPhysics();
    });

    it('builds evidence from an actually simulated toss', () => {
      const input = createKeyboardPhysicalTossInput({
        currentThrow: 2,
        perturbationSeed: 0xabcdef01
      });
      const simulation = createCoinTossSimulation(input);
      const settled = simulation.runToSettlement();
      simulation.dispose();

      const evidence = createCastingEvidence(2, input, settled);
      const expectedScore = settled.faces.reduce(
        (total, face) => total + (face === 'heads' ? 3 : 2),
        0
      );

      expect(evidence.faces).toEqual(settled.faces);
      expect(evidence.score).toBe(expectedScore);
      expect(evidence.settledReason).toBe(settled.settledReason);
      expect(evidence.settledTimeMs).toBe(settled.settledTimeMs);
      expect(evidence.inputSource).toBe('keyboard');
    });
  });
});
