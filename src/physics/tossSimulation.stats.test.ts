// Statistical fairness checks for the physical toss pipeline.
//
// Not part of the default `npm test` fast gate — run via `npm run test:stats`.
// Thresholds are wide enough to avoid flakiness (>= ~3 sigma) but tight
// enough to catch a systematic one-face or one-line-value bias.

import { beforeAll, describe, expect, it } from 'vitest';
import { createCoinToss } from '../domain/coinToss';
import type { LineScore } from '../domain/types';
import {
  createKeyboardPhysicalTossInput,
  createMotionPhysicalTossInput,
  createPointerPhysicalTossInput,
  type PhysicalTossInput,
  type PhysicalTossSource
} from './physicalTossInput';
import { createCoinTossSimulation, initTossPhysics } from './tossSimulation';

const TOSSES_PER_SOURCE = 50;

function pointerInput(index: number): PhysicalTossInput {
  const drift = index % 12;
  const curve = index % 5;

  return createPointerPhysicalTossInput({
    currentThrow: (index % 6) + 1,
    sceneWidth: 720,
    sceneHeight: 480,
    perturbationSeed: (0x2400beef + index * 0x45d9f3b) >>> 0,
    samples: [
      { x: 185 + drift * 18, y: 305 - curve * 13, timestamp: 0 },
      { x: 265 + drift * 14, y: 242 - (index % 7) * 9, timestamp: 78 + curve * 3 },
      { x: 355 + drift * 10, y: 178 + (index % 4) * 12, timestamp: 166 + curve * 6 },
      { x: 430 + drift * 6, y: 144 + (index % 6) * 9, timestamp: 224 + curve * 5 }
    ]
  });
}

function motionInput(index: number): PhysicalTossInput {
  return createMotionPhysicalTossInput({
    currentThrow: (index % 6) + 1,
    durationMs: 380 + (index % 9) * 120,
    energy: 0.5 + (index % 7) * 0.28,
    digest: (0x9e3779b9 ^ Math.imul(index + 11, 0x85ebca6b)) >>> 0,
    peakCount: 2 + (index % 6),
    dominantAcceleration: [
      ((index % 5) - 2) * 0.35,
      0.4 + (index % 3) * 0.2,
      ((index % 7) - 3) * 0.22
    ],
    rotationBias: [
      60 + (index % 4) * 45,
      30 + (index % 5) * 35,
      90 + (index % 3) * 60
    ],
    perturbationSeed: (0x51f10000 + index * 0x1f123bb5) >>> 0
  });
}

function keyboardInput(index: number): PhysicalTossInput {
  return createKeyboardPhysicalTossInput({
    currentThrow: (index % 6) + 1,
    perturbationSeed: (0x1234abcd + index * 0x9e3779b1) >>> 0
  });
}

describe('toss simulation statistics', () => {
  beforeAll(async () => {
    await initTossPhysics();
  });

  it('stays near the three-coin distribution across normal inputs', () => {
    const generators: Array<[PhysicalTossSource, (index: number) => PhysicalTossInput]> = [
      ['pointer', pointerInput],
      ['motion', motionInput],
      ['keyboard', keyboardInput]
    ];

    let totalCoins = 0;
    let totalHeads = 0;
    const scoreCounts: Record<LineScore, number> = { 6: 0, 7: 0, 8: 0, 9: 0 };
    const reasonCounts: Record<string, number> = { strict: 0, 'timeout-readable': 0 };
    const perSource: Record<string, { heads: number; coins: number }> = {};
    let totalSettledMs = 0;
    let maxSettledMs = 0;

    generators.forEach(([source, createInput]) => {
      perSource[source] = { heads: 0, coins: 0 };

      for (let index = 0; index < TOSSES_PER_SOURCE; index += 1) {
        const simulation = createCoinTossSimulation(createInput(index));
        const settled = simulation.runToSettlement();
        simulation.dispose();

        const toss = createCoinToss(settled.faces);
        scoreCounts[toss.score] += 1;
        reasonCounts[settled.settledReason] += 1;
        totalSettledMs += settled.settledTimeMs;
        maxSettledMs = Math.max(maxSettledMs, settled.settledTimeMs);

        settled.faces.forEach((face) => {
          if (face === 'heads') {
            totalHeads += 1;
            perSource[source].heads += 1;
          }
          totalCoins += 1;
          perSource[source].coins += 1;
        });
      }
    });

    const totalTosses = TOSSES_PER_SOURCE * generators.length;
    const headsRatio = totalHeads / totalCoins;
    const summary = {
      totalTosses,
      totalCoins,
      headsRatio: headsRatio.toFixed(4),
      scoreRatios: {
        6: (scoreCounts[6] / totalTosses).toFixed(4),
        7: (scoreCounts[7] / totalTosses).toFixed(4),
        8: (scoreCounts[8] / totalTosses).toFixed(4),
        9: (scoreCounts[9] / totalTosses).toFixed(4)
      },
      perSourceHeadsRatio: Object.fromEntries(
        Object.entries(perSource).map(([source, { heads, coins }]) => [
          source,
          (heads / coins).toFixed(4)
        ])
      ),
      reasonCounts,
      meanSettledMs: Math.round(totalSettledMs / totalTosses),
      maxSettledMs
    };
    console.log(`toss statistics: ${JSON.stringify(summary, null, 2)}`);
    const message = JSON.stringify(summary);

    expect(totalCoins, message).toBe(totalTosses * 3);

    // Single-coin fairness: 50% +/- ~3 sigma over the whole batch.
    expect(headsRatio, message).toBeGreaterThan(0.43);
    expect(headsRatio, message).toBeLessThan(0.57);

    // No input source may systematically force one face.
    Object.values(perSource).forEach(({ heads, coins }) => {
      expect(heads / coins, message).toBeGreaterThan(0.36);
      expect(heads / coins, message).toBeLessThan(0.64);
    });

    // Line-value distribution near 12.5 / 37.5 / 37.5 / 12.5.
    expect(scoreCounts[6] / totalTosses, message).toBeGreaterThan(0.04);
    expect(scoreCounts[6] / totalTosses, message).toBeLessThan(0.24);
    expect(scoreCounts[9] / totalTosses, message).toBeGreaterThan(0.04);
    expect(scoreCounts[9] / totalTosses, message).toBeLessThan(0.24);
    expect(scoreCounts[7] / totalTosses, message).toBeGreaterThan(0.25);
    expect(scoreCounts[7] / totalTosses, message).toBeLessThan(0.51);
    expect(scoreCounts[8] / totalTosses, message).toBeGreaterThan(0.25);
    expect(scoreCounts[8] / totalTosses, message).toBeLessThan(0.51);
  }, 120000);
});
