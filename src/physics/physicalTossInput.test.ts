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
