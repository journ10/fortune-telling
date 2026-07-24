// Per-throw evidence record (redesign doc section 4.4).
//
// Every line of a casting must carry proof of how it was produced:
// what the user did (input source + summary), how the coins settled
// (reason + time), and what the physics read (faces -> score -> line).
// Scoring reuses the domain rules; nothing here generates faces.

import { createCoinToss } from '../domain/coinToss';
import type { CoinFace, LineName, LineScore } from '../domain/types';
import type { PhysicalTossInput, PhysicalTossSource } from '../physics/physicalTossInput';
import type { SettledReason, SettledToss } from '../physics/tossSimulation';

export interface TossInputSummary {
  energy: number;
  durationMs: number;
  perturbationScale: number;
}

export interface CastingEvidence {
  /** 1-based throw index within the six-line casting. */
  throwIndex: number;
  inputSource: PhysicalTossSource;
  inputSummary: TossInputSummary;
  settledReason: SettledReason;
  settledTimeMs: number;
  faces: [CoinFace, CoinFace, CoinFace];
  score: LineScore;
  lineName: LineName;
  isMoving: boolean;
}

/**
 * Combine a settled physical toss with its originating input into the
 * evidence record for one line. Faces are scored through the shared
 * domain rules (createCoinToss), so evidence can never disagree with
 * the casting result.
 */
export function createCastingEvidence(
  throwIndex: number,
  input: PhysicalTossInput,
  settled: SettledToss
): CastingEvidence {
  const toss = createCoinToss(settled.faces);

  return {
    throwIndex,
    inputSource: input.source,
    inputSummary: {
      energy: input.energy,
      durationMs: input.durationMs,
      perturbationScale: input.perturbationScale
    },
    settledReason: settled.settledReason,
    settledTimeMs: settled.settledTimeMs,
    faces: toss.faces,
    score: toss.score,
    lineName: toss.line.name,
    isMoving: toss.line.isMoving
  };
}
