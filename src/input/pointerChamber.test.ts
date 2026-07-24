import { describe, expect, it } from 'vitest';
import {
  beginChamberCharge,
  cancelChamberCharge,
  createPointerChamber,
  recordChamberSample,
  sealChamberToss,
  summarizeChamberEnergy
} from './pointerChamber';

function shakeChamber(seed = 0xabc123) {
  let chamber = createPointerChamber();
  chamber = beginChamberCharge(chamber, 7, 300, 260, 0);

  // Vigorously shake inside a 240ms window.
  const points = [
    [330, 240, 40],
    [290, 280, 80],
    [340, 230, 120],
    [300, 270, 160],
    [350, 240, 200],
    [380, 210, 235]
  ] as const;

  points.forEach(([x, y, timestamp]) => {
    chamber = recordChamberSample(chamber, 7, x, y, timestamp);
  });

  return { chamber, seed };
}

describe('pointerChamber', () => {
  it('seals a press-shake-release gesture into a PhysicalTossInput', () => {
    const { chamber, seed } = shakeChamber();
    const sealed = sealChamberToss(chamber, 7, {
      currentThrow: 2,
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: seed,
      timestamp: 250
    });

    expect(sealed).not.toBeNull();
    expect(sealed?.input.source).toBe('pointer');
    expect(sealed?.input.currentThrow).toBe(2);
    expect(sealed?.input.coins).toHaveLength(3);
    expect(sealed?.input.energy).toBeGreaterThan(0.32);
    expect('faces' in (sealed?.input ?? {})).toBe(false);
    expect(sealed?.next.charging).toBe(false);
  });

  it('keeps only the rolling sample window while charging', () => {
    let chamber = createPointerChamber();
    chamber = beginChamberCharge(chamber, 1, 100, 100, 0);

    for (let index = 1; index <= 40; index += 1) {
      chamber = recordChamberSample(chamber, 1, 100 + index, 100, index * 20);
    }

    const timestamps = chamber.samples.map((sample) => sample.timestamp);
    expect(Math.min(...timestamps)).toBeGreaterThanOrEqual(800 - 240);
    expect(chamber.samples.length).toBeLessThanOrEqual(40);
  });

  it('ignores samples and seals from a different pointer id', () => {
    let chamber = createPointerChamber();
    chamber = beginChamberCharge(chamber, 1, 100, 100, 0);

    const unchanged = recordChamberSample(chamber, 2, 200, 200, 50);
    expect(unchanged.samples).toHaveLength(1);

    const sealed = sealChamberToss(chamber, 2, {
      currentThrow: 1,
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 1,
      timestamp: 60
    });
    expect(sealed).toBeNull();
  });

  it('returns null when sealing without an active charge', () => {
    const chamber = createPointerChamber();
    const sealed = sealChamberToss(chamber, 1, {
      currentThrow: 1,
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 1,
      timestamp: 10
    });

    expect(sealed).toBeNull();
  });

  it('grows the HUD energy estimate while shaking and resets on cancel', () => {
    const { chamber } = shakeChamber();
    const summary = summarizeChamberEnergy(chamber, 720, 480, 235);

    expect(summary.energy).toBeGreaterThan(0.2);
    expect(summary.durationMs).toBe(235);

    const cancelled = cancelChamberCharge(chamber, 7);
    expect(cancelled.charging).toBe(false);
    expect(summarizeChamberEnergy(cancelled, 720, 480, 300).energy).toBe(0);
  });

  it('still floors weak releases to a minimal physical toss energy', () => {
    let chamber = createPointerChamber();
    chamber = beginChamberCharge(chamber, 3, 360, 240, 0);
    chamber = recordChamberSample(chamber, 3, 361, 240, 200);

    const sealed = sealChamberToss(chamber, 3, {
      currentThrow: 5,
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 99,
      timestamp: 220
    });

    expect(sealed?.input.energy).toBeGreaterThanOrEqual(0.32);
  });
});
