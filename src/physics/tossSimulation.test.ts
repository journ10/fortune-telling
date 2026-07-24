// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { CoinFace } from '../domain/types';
import {
  faceNormalFromQuaternion,
  faceNormalYFromQuaternion,
  readCoinFace
} from './faceReader';
import {
  createKeyboardPhysicalTossInput,
  createPointerPhysicalTossInput,
  type PhysicalTossInput,
  type QuaternionTuple,
  type Vec3Tuple
} from './physicalTossInput';
import {
  ANGULAR_SLEEP_SPEED,
  LINEAR_SLEEP_SPEED,
  MIN_SETTLE_SECONDS,
  READABLE_FACE_NORMAL_Y,
  SETTLED_FACE_NORMAL_Y,
  SETTLED_MAX_HEIGHT,
  TIMEOUT_READABLE_SECONDS,
  evaluateSettlement,
  type CoinSettlementSample
} from './settlement';
import {
  COIN_TOSS_SIMULATION_ENGINE,
  createCoinTossSimulation,
  initTossPhysics,
  type SettledToss
} from './tossSimulation';

function axisAngleQuaternion(
  axis: [number, number, number],
  angle: number
): QuaternionTuple {
  const half = angle / 2;
  const sin = Math.sin(half);
  return [axis[0] * sin, axis[1] * sin, axis[2] * sin, Math.cos(half)];
}

/** Coins resting essentially flat just above the table, no motion. */
function createGentleDropInput(perturbationSeed: number): PhysicalTossInput {
  return {
    source: 'keyboard',
    currentThrow: 1,
    coins: [-1, 0, 1].map((slot) => ({
      position: [slot * 1.4, 0.06, 0],
      rotation: [0, 0, 0, 1],
      linearVelocity: [0, 0, 0],
      angularVelocity: [0, 0, 0]
    })) as PhysicalTossInput['coins'],
    energy: 0.2,
    durationMs: 120,
    perturbationSeed,
    perturbationScale: 0.035
  };
}

/** Readable tilt (normalY = 0.8) but far from flat, tossed high so it is airborne at the strict deadline. */
function createReadableButMovingInput(perturbationSeed: number): PhysicalTossInput {
  const tilt = axisAngleQuaternion([1, 0, 0], Math.acos(0.8));

  return {
    source: 'pointer',
    currentThrow: 2,
    coins: [-1, 0, 1].map((slot) => ({
      position: [slot * 1.3, 0.82, 0],
      rotation: tilt,
      linearVelocity: [0, 30, 0],
      angularVelocity: [0, 8, 0]
    })) as PhysicalTossInput['coins'],
    energy: 0.9,
    durationMs: 220,
    perturbationSeed,
    perturbationScale: 0.035
  };
}

/** One coin balanced on its edge; the other two rest flat. */
function createEdgeStandingInput(perturbationSeed: number): PhysicalTossInput {
  const onEdge = axisAngleQuaternion([1, 0, 0], Math.PI / 2);

  return {
    source: 'keyboard',
    currentThrow: 3,
    coins: [
      {
        position: [-1.4, 0.06, 0],
        rotation: [0, 0, 0, 1],
        linearVelocity: [0, 0, 0],
        angularVelocity: [0, 0, 0]
      },
      {
        position: [0, 0.53, 0],
        rotation: onEdge,
        linearVelocity: [0, 0, 0],
        angularVelocity: [0, 0, 0]
      },
      {
        position: [1.4, 0.06, 0],
        rotation: [0, 0, 0, 1],
        linearVelocity: [0, 0, 0],
        angularVelocity: [0, 0, 0]
      }
    ],
    energy: 0.2,
    durationMs: 120,
    perturbationSeed,
    perturbationScale: 0.035
  };
}

function createPointerInput(perturbationSeed: number): PhysicalTossInput {
  return createPointerPhysicalTossInput({
    currentThrow: 1,
    sceneWidth: 720,
    sceneHeight: 480,
    perturbationSeed,
    samples: [
      { x: 200, y: 260, timestamp: 0 },
      { x: 260, y: 220, timestamp: 90 },
      { x: 350, y: 170, timestamp: 180 }
    ]
  });
}

function run(input: PhysicalTossInput): {
  settled: SettledToss;
  finalRotations: QuaternionTuple[];
  finalLinearSpeeds: number[];
  finalAngularSpeeds: number[];
} {
  const simulation = createCoinTossSimulation(input);
  const settled = simulation.runToSettlement();
  const snapshot = simulation.snapshot();
  const result = {
    settled,
    finalRotations: snapshot.coins.map((coin) => coin.rotation),
    finalLinearSpeeds: snapshot.coins.map((coin) => Math.hypot(...coin.linearVelocity)),
    finalAngularSpeeds: snapshot.coins.map((coin) => Math.hypot(...coin.angularVelocity))
  };
  simulation.dispose();
  return result;
}

describe('faceReader', () => {
  it('reads heads/tails from the settled face normal only', () => {
    expect(readCoinFace([0, 0, 0, 1])).toBe('heads');
    expect(readCoinFace(axisAngleQuaternion([1, 0, 0], Math.PI))).toBe('tails');
    expect(faceNormalFromQuaternion([0, 0, 0, 1])).toEqual([0, 1, 0]);
    const rotated = faceNormalFromQuaternion(axisAngleQuaternion([1, 0, 0], Math.PI / 2));
    expect(rotated[0]).toBeCloseTo(0, 10);
    expect(rotated[1]).toBeCloseTo(0, 10);
    expect(Math.abs(rotated[2])).toBeCloseTo(1, 10);
  });
});

describe('createCoinTossSimulation', () => {
  beforeAll(async () => {
    await initTossPhysics();
  });

  it('uses Rapier as the physics engine', () => {
    expect(COIN_TOSS_SIMULATION_ENGINE).toBe('rapier3d-compat');
  });

  it('starts from the supplied physical input state exactly', () => {
    const input = createPointerInput(0x51f15eed);
    const simulation = createCoinTossSimulation(input);
    const snapshot = simulation.snapshot();

    expect(snapshot.settledToss).toBeNull();
    snapshot.coins.forEach((coin, index) => {
      coin.position.forEach((component, componentIndex) => {
        expect(component).toBeCloseTo(input.coins[index].position[componentIndex], 6);
      });
      coin.linearVelocity.forEach((component, componentIndex) => {
        expect(component).toBeCloseTo(input.coins[index].linearVelocity[componentIndex], 6);
      });
      coin.angularVelocity.forEach((component, componentIndex) => {
        expect(component).toBeCloseTo(input.coins[index].angularVelocity[componentIndex], 6);
      });
      coin.rotation.forEach((component, componentIndex) => {
        expect(component).toBeCloseTo(input.coins[index].rotation[componentIndex], 6);
      });
    });

    simulation.dispose();
  });

  it('keeps the perturbation seed confined to physical variables', () => {
    // Same input, different seeds: the initial body state must be identical.
    // The seed may only perturb materials / tabletop tilt during simulation.
    const input = createPointerInput(0xaaaa0001);
    const first = createCoinTossSimulation({ ...input, perturbationSeed: 0xaaaa0001 });
    const second = createCoinTossSimulation({ ...input, perturbationSeed: 0xbbbb0002 });

    expect(first.snapshot().coins).toEqual(second.snapshot().coins);

    first.dispose();
    second.dispose();
  });

  it('produces a different initial state for a different input', () => {
    const first = createCoinTossSimulation(createPointerInput(0x11111111));
    const second = createCoinTossSimulation(createPointerInput(0x22222222));

    expect(first.snapshot().coins).not.toEqual(second.snapshot().coins);

    first.dispose();
    second.dispose();
  });

  it('is reproducible for the same input and perturbation seed', () => {
    const input = createPointerInput(0x5eed1234);
    const first = run(input);
    const second = run(input);

    expect(second.settled).toEqual(first.settled);
    second.finalRotations.forEach((rotation, index) => {
      rotation.forEach((component, componentIndex) => {
        expect(component).toBeCloseTo(first.finalRotations[index][componentIndex], 10);
      });
    });
  });

  it('reads faces from final rigid-body rotations', () => {
    const { settled, finalRotations } = run(createPointerInput(0x7777abcd));

    settled.faces.forEach((face, index) => {
      expect(face).toBe(readCoinFace(finalRotations[index]));
    });
  });

  it('settles strict only when velocity and orientation thresholds hold', () => {
    const { settled, finalRotations, finalLinearSpeeds, finalAngularSpeeds } = run(
      createGentleDropInput(0xdecaf001)
    );

    expect(settled.settledReason).toBe('strict');
    expect(settled.settledTimeMs).toBeGreaterThanOrEqual(MIN_SETTLE_SECONDS * 1000);
    finalRotations.forEach((rotation) => {
      expect(Math.abs(faceNormalYFromQuaternion(rotation))).toBeGreaterThanOrEqual(
        SETTLED_FACE_NORMAL_Y
      );
    });
    finalLinearSpeeds.forEach((speed) => {
      expect(speed).toBeLessThanOrEqual(LINEAR_SLEEP_SPEED);
    });
    finalAngularSpeeds.forEach((speed) => {
      expect(speed).toBeLessThanOrEqual(ANGULAR_SLEEP_SPEED);
    });
  });

  it('resolves readable-but-moving coins as timeout-readable from body rotations', () => {
    const { settled, finalRotations } = run(createReadableButMovingInput(0x9090abcd));

    expect(settled.settledReason).toBe('timeout-readable');
    expect(settled.settledTimeMs).toBeGreaterThanOrEqual(TIMEOUT_READABLE_SECONDS * 1000);
    expect(settled.settledTimeMs).toBeLessThan((TIMEOUT_READABLE_SECONDS + 0.2) * 1000);
    finalRotations.forEach((rotation, index) => {
      const normalY = Math.abs(faceNormalYFromQuaternion(rotation));
      expect(normalY).toBeGreaterThanOrEqual(READABLE_FACE_NORMAL_Y);
      // Faces come from the rotations themselves, never from a generator.
      expect(settled.faces[index]).toBe(readCoinFace(rotation));
    });
  });

  it('tips an edge-standing coin over physically until it becomes readable', () => {
    const { settled, finalRotations } = run(createEdgeStandingInput(0xed9e0001));

    expect(['strict', 'timeout-readable']).toContain(settled.settledReason);
    finalRotations.forEach((rotation, index) => {
      expect(Math.abs(faceNormalYFromQuaternion(rotation))).toBeGreaterThanOrEqual(
        READABLE_FACE_NORMAL_Y
      );
      expect(settled.faces[index]).toBe(readCoinFace(rotation));
    });
  });

  it('settles keyboard toss inputs through the same physical pipeline', () => {
    const input = createKeyboardPhysicalTossInput({
      currentThrow: 4,
      perturbationSeed: 0x4b5942
    });
    const { settled, finalRotations } = run(input);

    expect(settled.faces).toHaveLength(3);
    settled.faces.forEach((face: CoinFace, index: number) => {
      expect(face).toBe(readCoinFace(finalRotations[index]));
    });
  });

  it('never strict-settles while any coin is still airborne (M5 regression)', () => {
    const airborne: CoinSettlementSample[] = [0, 1, 2].map((index) => ({
      positionY: 0.4 + index * 0.1,
      rotation: [0, 0, 0, 1] as QuaternionTuple,
      linearVelocity: [0, 0, 0] as Vec3Tuple,
      angularVelocity: [0, 0, 0] as Vec3Tuple
    }));

    // 慢速 + 平放法线 + 已过最短落定时间，但全部悬空 → 必须 pending。
    expect(evaluateSettlement(airborne, MIN_SETTLE_SECONDS + 0.5).status).toBe('pending');
    expect(evaluateSettlement(airborne, TIMEOUT_READABLE_SECONDS - 0.1).status).toBe('pending');

    // 同样本贴地后 → strict。
    const landed = airborne.map((sample) => ({ ...sample, positionY: 0.03 }));
    expect(evaluateSettlement(landed, MIN_SETTLE_SECONDS + 0.5)).toEqual({
      status: 'settled',
      reason: 'strict'
    });
  });

  it('reads faces only after every coin has reached the tabletop (M5 regression)', () => {
    // 逐帧步进的正常投掷：faces 被读取的时刻，所有铜钱必须已落在桌面上。
    for (const seed of [7, 42, 1337]) {
      const input = createPointerInput(seed);
      const simulation = createCoinTossSimulation(input);
      const settled = simulation.runToSettlement();
      const snapshot = simulation.snapshot();

      expect(settled.settledReason).toBe('strict');
      snapshot.coins.forEach((coin) => {
        expect(coin.position[1]).toBeLessThanOrEqual(SETTLED_MAX_HEIGHT);
      });

      simulation.dispose();
    }
  });
});
