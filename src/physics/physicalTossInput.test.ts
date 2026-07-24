import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TABLETOP_COIN_RADIUS } from './coinGeometry';
import { coinFaceFromPhysicsRotation } from './coinPhysics';
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

  it('anchors pointer coin starts at the release location', () => {
    const leftTop = createPointerPhysicalTossInput({
      currentThrow: 3,
      samples: [
        { x: 60, y: 80, timestamp: 0 },
        { x: 100, y: 100, timestamp: 100 },
        { x: 140, y: 120, timestamp: 200 }
      ],
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0xabcdef12
    });
    const rightBottom = createPointerPhysicalTossInput({
      currentThrow: 3,
      samples: [
        { x: 560, y: 360, timestamp: 0 },
        { x: 600, y: 380, timestamp: 100 },
        { x: 640, y: 400, timestamp: 200 }
      ],
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0xabcdef12
    });
    const averagePosition = (axis: 0 | 2, input: typeof leftTop) =>
      input.coins.reduce((total, coin) => total + coin.position[axis], 0) / input.coins.length;

    expect(averagePosition(0, rightBottom) - averagePosition(0, leftTop)).toBeGreaterThan(3);
    expect(averagePosition(2, rightBottom) - averagePosition(2, leftTop)).toBeGreaterThan(1.5);
  });

  it('keeps energetic pointer releases below the hard energy cap so gesture differences remain visible', () => {
    const fastArc = createPointerPhysicalTossInput({
      currentThrow: 2,
      samples: [
        { x: 180, y: 310, timestamp: 0 },
        { x: 270, y: 250, timestamp: 80 },
        { x: 410, y: 185, timestamp: 145 },
        { x: 540, y: 130, timestamp: 205 }
      ],
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x1234abcd
    });
    const sharperArc = createPointerPhysicalTossInput({
      currentThrow: 2,
      samples: [
        { x: 180, y: 310, timestamp: 0 },
        { x: 300, y: 190, timestamp: 70 },
        { x: 250, y: 335, timestamp: 120 },
        { x: 565, y: 105, timestamp: 205 }
      ],
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x1234abcd
    });

    expect(fastArc.energy).toBeGreaterThan(0.45);
    expect(sharperArc.energy).toBeGreaterThan(fastArc.energy);
    expect(fastArc.energy).toBeLessThan(1.45);
    expect(sharperArc.energy).toBeLessThan(1.45);
  });

  it('starts pointer toss coins from the visible heads-up tabletop state', () => {
    const input = createPointerPhysicalTossInput({
      currentThrow: 1,
      samples: [
        { x: 280, y: 260, timestamp: 0 },
        { x: 340, y: 220, timestamp: 90 },
        { x: 420, y: 170, timestamp: 180 }
      ],
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x99887766
    });

    expect(
      input.coins.map((coin) =>
        coinFaceFromPhysicsRotation(
          new THREE.Quaternion(
            coin.rotation[0],
            coin.rotation[1],
            coin.rotation[2],
            coin.rotation[3]
          ).normalize()
        )
      )
    ).toEqual(['heads', 'heads', 'heads']);
  });

  it('gives pointer tosses enough flip speed to leave the visible heads-up start state', () => {
    const input = createPointerPhysicalTossInput({
      currentThrow: 1,
      samples: [
        { x: 280, y: 260, timestamp: 0 },
        { x: 340, y: 220, timestamp: 90 },
        { x: 420, y: 170, timestamp: 180 }
      ],
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x1122aabb
    });

    input.coins.forEach((coin) => {
      expect(Math.abs(coin.angularVelocity[0])).toBeGreaterThanOrEqual(8);
    });
  });

  it('uses pointer shake trajectory to perturb initial coin rotations', () => {
    const calmArc = createPointerPhysicalTossInput({
      currentThrow: 4,
      samples: [
        { x: 220, y: 240, timestamp: 0 },
        { x: 300, y: 220, timestamp: 90 },
        { x: 380, y: 200, timestamp: 180 },
        { x: 460, y: 180, timestamp: 270 }
      ],
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x33445566
    });
    const shakenArc = createPointerPhysicalTossInput({
      currentThrow: 4,
      samples: [
        { x: 220, y: 240, timestamp: 0 },
        { x: 315, y: 150, timestamp: 70 },
        { x: 260, y: 300, timestamp: 125 },
        { x: 410, y: 120, timestamp: 190 },
        { x: 360, y: 265, timestamp: 235 },
        { x: 460, y: 180, timestamp: 270 }
      ],
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x33445566
    });
    const roundedRotations = (input: typeof calmArc) =>
      input.coins.map((coin) => coin.rotation.map((value) => value.toFixed(6)).join(','));

    expect(roundedRotations(shakenArc)).not.toEqual(roundedRotations(calmArc));
  });

  it('keeps pointer coin starts separated enough to avoid initial interpenetration', () => {
    const input = createPointerPhysicalTossInput({
      currentThrow: 2,
      samples: [
        { x: 280, y: 260, timestamp: 0 },
        { x: 330, y: 220, timestamp: 90 },
        { x: 420, y: 210, timestamp: 180 }
      ],
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x10293847
    });

    input.coins.forEach((coin, index) => {
      input.coins.slice(index + 1).forEach((otherCoin) => {
        const planarDistance = Math.hypot(
          coin.position[0] - otherCoin.position[0],
          coin.position[2] - otherCoin.position[2]
        );

        expect(planarDistance).toBeGreaterThan(TABLETOP_COIN_RADIUS * 2.05);
      });
    });
  });

  it('keeps pointer initial faces visible while still varying initial rotations', () => {
    const roundedRotations = new Set<string>();

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
        const rotation = new THREE.Quaternion(
          coin.rotation[0],
          coin.rotation[1],
          coin.rotation[2],
          coin.rotation[3]
        ).normalize();

        expect(coinFaceFromPhysicsRotation(rotation)).toBe('heads');
        roundedRotations.add(coin.rotation.map((value) => value.toFixed(5)).join(','));
      });
    }

    expect(roundedRotations.size).toBeGreaterThan(120);
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
