import { describe, expect, it } from 'vitest';
import {
  createKeyboardPhysicalTossInput,
  createMotionPhysicalTossInput,
  createPointerPhysicalTossInput,
  type PointerTossSample
} from './physicalTossInput';

describe('physical toss input mapping', () => {
  it('maps pointer release samples into three distinct coin states', () => {
    const samples: PointerTossSample[] = [
      { x: 120, y: 220, timestamp: 0 },
      { x: 162, y: 194, timestamp: 80 },
      { x: 238, y: 154, timestamp: 170 },
      { x: 310, y: 132, timestamp: 230 }
    ];

    const input = createPointerPhysicalTossInput({
      currentThrow: 2,
      samples,
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x12345678
    });

    expect(input.source).toBe('pointer');
    expect('faces' in input).toBe(false);
    expect(input.coins).toHaveLength(3);
    expect(input.energy).toBeGreaterThan(0.25);
    expect(new Set(input.coins.map((coin) => coin.position.join(','))).size).toBe(3);
    expect(new Set(input.coins.map((coin) => coin.angularVelocity.join(','))).size).toBe(3);
  });

  it('maps weak pointer releases to a minimum physical toss energy', () => {
    const input = createPointerPhysicalTossInput({
      currentThrow: 1,
      samples: [
        { x: 300, y: 220, timestamp: 0 },
        { x: 302, y: 221, timestamp: 180 }
      ],
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x5555aaaa
    });

    expect(input.energy).toBeGreaterThanOrEqual(0.32);
    input.coins.forEach((coin) => {
      expect(Math.hypot(...coin.angularVelocity)).toBeGreaterThan(2);
    });
  });

  it('creates balanced initial face orientations across synthetic pointer inputs', () => {
    const angularSigns = { positive: 0, negative: 0 };

    for (let index = 0; index < 80; index += 1) {
      const input = createPointerPhysicalTossInput({
        currentThrow: (index % 6) + 1,
        sceneWidth: 720,
        sceneHeight: 480,
        perturbationSeed: index * 0x9e3779b1,
        samples: [
          { x: 220 + (index % 9) * 8, y: 260, timestamp: 0 },
          { x: 290 + (index % 7) * 11, y: 220 - (index % 5) * 6, timestamp: 90 },
          { x: 360 + (index % 11) * 9, y: 170 + (index % 3) * 8, timestamp: 190 }
        ]
      });

      input.coins.forEach((coin) => {
        if (coin.angularVelocity[0] >= 0) {
          angularSigns.positive += 1;
        } else {
          angularSigns.negative += 1;
        }
      });
    }

    expect(angularSigns.positive).toBeGreaterThan(40);
    expect(angularSigns.negative).toBeGreaterThan(40);
  });

  it('maps motion summaries into the same physical input contract', () => {
    const input = createMotionPhysicalTossInput({
      currentThrow: 4,
      durationMs: 1360,
      energy: 1.8,
      digest: 0xaabbccdd,
      peakCount: 5,
      dominantAcceleration: [0.6, 0.8, 0.2],
      rotationBias: [120, 80, 45],
      perturbationSeed: 0x77889900
    });

    expect(input.source).toBe('motion');
    expect(input.durationMs).toBe(1360);
    expect(input.energy).toBeGreaterThan(0.5);
    expect('faces' in input).toBe(false);
    expect(input.coins).toHaveLength(3);
  });

  it('creates keyboard tosses through the physical input contract', () => {
    const input = createKeyboardPhysicalTossInput({
      currentThrow: 1,
      perturbationSeed: 0x01020304
    });

    expect(input.source).toBe('keyboard');
    expect(input.coins).toHaveLength(3);
    expect(input.energy).toBeGreaterThanOrEqual(0.38);
  });
});
