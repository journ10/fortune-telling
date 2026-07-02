import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  COIN_PHYSICS_ENGINE,
  COIN_PHYSICS_FRICTION_BASE,
  COIN_PHYSICS_FRICTION_VARIATION,
  COIN_PHYSICS_RESTITUTION_BASE,
  COIN_PHYSICS_RESTITUTION_VARIATION,
  COIN_PHYSICS_COLLIDER_HALF_HEIGHT,
  COIN_PHYSICS_COLLIDER_RADIUS,
  COIN_PHYSICS_COLLIDER_SKIN,
  coinFaceFromPhysicsRotation,
  coinFaceFromVisualRotation,
  createCoinMaterialProfile,
  createCoinPhysicsSimulation,
  createSeededRandom,
  randomGaussianOffset,
  initCoinPhysics,
  type CoinPhysicsSnapshot
} from './coinPhysics';
import { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS } from './coinGeometry';
import { createPointerPhysicalTossInput, type PhysicalTossInput } from './physicalTossInput';

function createTestPhysicalInput(seed = 0x51f15eed) {
  return createPointerPhysicalTossInput({
    currentThrow: 1,
    sceneWidth: 720,
    sceneHeight: 480,
    perturbationSeed: seed,
    samples: [
      { x: 200, y: 260, timestamp: 0 },
      { x: 260, y: 220, timestamp: 90 },
      { x: 350, y: 170, timestamp: 180 }
    ]
  });
}

function physicsFaceNormalY(rotation: THREE.Quaternion): number {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).y;
}

function coinColliderBottomY(position: THREE.Vector3, rotation: THREE.Quaternion): number {
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  const axisY = Math.abs(axis.y);
  const verticalExtent =
    COIN_PHYSICS_COLLIDER_HALF_HEIGHT * axisY +
    COIN_PHYSICS_COLLIDER_RADIUS * Math.sqrt(Math.max(0, 1 - axisY * axisY));

  return position.y - verticalExtent;
}

function createScenarioPhysicalInput(
  currentThrow: number,
  requestId: number,
  tossSeed = 0x5eed1234
) {
  const xOffset = ((requestId % 5) - 2) * 18;
  const yOffset = ((currentThrow % 3) - 1) * 14;

  return createPointerPhysicalTossInput({
    currentThrow,
    sceneWidth: 720,
    sceneHeight: 480,
    perturbationSeed: tossSeed ^ Math.imul(requestId + 17, 0x9e3779b1),
    samples: [
      { x: 210 + xOffset, y: 290 + yOffset, timestamp: 0 },
      { x: 282 + xOffset, y: 232 + yOffset, timestamp: 90 },
      { x: 386 + xOffset, y: 164 + yOffset, timestamp: 180 }
    ]
  });
}

function stepUntilSettled(input = createScenarioPhysicalInput(1, 1)) {
  const simulation = createCoinPhysicsSimulation(input);
  let snapshot = simulation.snapshot();

  for (let step = 0; step < 1500 && !snapshot.settled; step += 1) {
    snapshot = simulation.step(1 / 60);
  }

  simulation.dispose();
  return snapshot;
}

function expectLegacyContainedCoins(snapshot: CoinPhysicsSnapshot) {
  expect(snapshot.coins).toHaveLength(3);
  snapshot.coins.forEach((coin) => {
    expect(Number.isFinite(coin.position.x)).toBe(true);
    expect(Number.isFinite(coin.position.y)).toBe(true);
    expect(Number.isFinite(coin.position.z)).toBe(true);
    expect(Math.abs(coin.position.x)).toBeLessThanOrEqual(2.2);
    expect(Math.abs(coin.position.z)).toBeLessThanOrEqual(2.2);
  });
}

describe('coinPhysics', () => {
  it('uses Rapier as the coin toss physics engine', () => {
    expect(COIN_PHYSICS_ENGINE).toBe('rapier3d-compat');
  });

  it('uses a small collider skin to cover visual relief without forbidding overlap broadly', () => {
    expect(COIN_PHYSICS_COLLIDER_RADIUS).toBe(TABLETOP_COIN_RADIUS + COIN_PHYSICS_COLLIDER_SKIN);
    expect(COIN_PHYSICS_COLLIDER_HALF_HEIGHT).toBe(
      TABLETOP_COIN_THICKNESS / 2 + COIN_PHYSICS_COLLIDER_SKIN
    );
    expect(COIN_PHYSICS_COLLIDER_SKIN).toBeGreaterThan(0);
    expect(COIN_PHYSICS_COLLIDER_SKIN).toBeLessThan(TABLETOP_COIN_RADIUS * 0.04);
  });

  it('uses bounded Gaussian offsets from the seeded random stream', () => {
    const random = createSeededRandom(0xdecafbad);

    for (let index = 0; index < 80; index += 1) {
      const offset = randomGaussianOffset(random, 0.42);

      expect(offset).toBeGreaterThanOrEqual(-0.42);
      expect(offset).toBeLessThanOrEqual(0.42);
    }
  });

  it('creates tiny seeded material differences for individual coins', () => {
    const random = createSeededRandom(0x51f15eed);
    const profiles = [0, 1, 2].map(() => createCoinMaterialProfile(random));

    profiles.forEach((profile) => {
      expect(profile.friction).toBeGreaterThanOrEqual(
        COIN_PHYSICS_FRICTION_BASE - COIN_PHYSICS_FRICTION_VARIATION
      );
      expect(profile.friction).toBeLessThanOrEqual(
        COIN_PHYSICS_FRICTION_BASE + COIN_PHYSICS_FRICTION_VARIATION
      );
      expect(profile.restitution).toBeGreaterThanOrEqual(
        COIN_PHYSICS_RESTITUTION_BASE - COIN_PHYSICS_RESTITUTION_VARIATION
      );
      expect(profile.restitution).toBeLessThanOrEqual(
        COIN_PHYSICS_RESTITUTION_BASE + COIN_PHYSICS_RESTITUTION_VARIATION
      );
    });

    expect(new Set(profiles.map((profile) => profile.friction.toFixed(5))).size).toBeGreaterThan(
      1
    );
    expect(
      new Set(profiles.map((profile) => profile.restitution.toFixed(5))).size
    ).toBeGreaterThan(1);
  });

  it('reads the visible face from a settled visual rotation', () => {
    const headsUp = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const tailsUp = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

    expect(coinFaceFromVisualRotation(headsUp)).toBe('heads');
    expect(coinFaceFromVisualRotation(tailsUp)).toBe('tails');
  });

  it('reads the visible face from a settled Rapier body rotation', () => {
    const headsUp = new THREE.Quaternion();
    const tailsUp = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));

    expect(coinFaceFromPhysicsRotation(headsUp)).toBe('heads');
    expect(coinFaceFromPhysicsRotation(tailsUp)).toBe('tails');
  });

  it('creates simulated coin bodies from physical toss input', async () => {
    await initCoinPhysics();
    const input = createTestPhysicalInput();
    const simulation = createCoinPhysicsSimulation(input);
    const snapshot = simulation.snapshot();

    expect(snapshot.coins).toHaveLength(3);
    snapshot.coins.forEach((coin, index) => {
      expect(coin.position.x).toBeCloseTo(input.coins[index].position[0], 5);
      expect(coin.position.y).toBeCloseTo(input.coins[index].position[1], 5);
      expect(coin.position.z).toBeCloseTo(input.coins[index].position[2], 5);
    });

    simulation.dispose();
  });

  it('settles physical toss input and reads faces from body rotations', async () => {
    await initCoinPhysics();
    const simulation = createCoinPhysicsSimulation(createTestPhysicalInput(0x7777abcd));
    let snapshot = simulation.snapshot();

    for (let step = 0; step < 900 && !snapshot.settled; step += 1) {
      snapshot = simulation.step(1 / 60);
    }

    expect(snapshot.settled).toBe(true);
    expect(snapshot.faces).toHaveLength(3);
    snapshot.faces?.forEach((face, index) => {
      expect(face).toBe(coinFaceFromPhysicsRotation(snapshot.coins[index].physicsRotation));
    });

    simulation.dispose();
  });

  it('uses timeout-readable settlement from body rotations instead of generated faces', async () => {
    await initCoinPhysics();
    const input = createPointerPhysicalTossInput({
      currentThrow: 5,
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x9090abcd,
      samples: [
        { x: 320, y: 240, timestamp: 0 },
        { x: 321, y: 240, timestamp: 220 }
      ]
    });
    const simulation = createCoinPhysicsSimulation(input);
    let snapshot = simulation.snapshot();

    for (let step = 0; step < 1200 && !snapshot.settled; step += 1) {
      snapshot = simulation.step(1 / 60);
    }

    expect(snapshot.settled).toBe(true);
    expect(['strict', 'timeout-readable']).toContain(snapshot.settledReason);
    expect(snapshot.faces).toHaveLength(3);
    snapshot.faces?.forEach((face, index) => {
      expect(face).toBe(coinFaceFromPhysicsRotation(snapshot.coins[index].physicsRotation));
    });

    simulation.dispose();
  });

  it('uses timeout-readable settlement while bodies are readable but still moving', async () => {
    await initCoinPhysics();
    const readableTilt = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.acos(0.8), 0, 0)
    );
    const input: PhysicalTossInput = {
      source: 'pointer',
      currentThrow: 5,
      coins: [-1, 0, 1].map((slot) => ({
        position: [slot * 1.3, 0.82, 0],
        rotation: [readableTilt.x, readableTilt.y, readableTilt.z, readableTilt.w],
        linearVelocity: [0, 30, 0],
        angularVelocity: [0, 8, 0]
      })) as PhysicalTossInput['coins'],
      durationMs: 220,
      energy: 0.32,
      perturbationScale: 0.035,
      perturbationSeed: 0x9090abcd
    };
    const simulation = createCoinPhysicsSimulation(input);
    let snapshot = simulation.snapshot();

    for (let step = 0; step < 1200 && !snapshot.settled; step += 1) {
      snapshot = simulation.step(1 / 60);
    }

    const faceNormalYs = snapshot.coins.map((coin) =>
      Math.abs(physicsFaceNormalY(coin.physicsRotation))
    );

    expect(snapshot.settled).toBe(true);
    expect(snapshot.settledReason).toBe('timeout-readable');
    expect(snapshot.elapsed).toBeGreaterThanOrEqual(5.5);
    expect(snapshot.elapsed).toBeLessThan(5.6);
    expect(faceNormalYs.every((normalY) => normalY >= 0.72)).toBe(true);
    expect(faceNormalYs.some((normalY) => normalY < 0.99)).toBe(true);
    expect(snapshot.faces).toHaveLength(3);
    snapshot.faces?.forEach((face, index) => {
      expect(face).toBe(coinFaceFromPhysicsRotation(snapshot.coins[index].physicsRotation));
    });

    simulation.dispose();
  });

  it('creates three simulated coin bodies whose results come from final physics rotations', async () => {
    await initCoinPhysics();
    const snapshot = stepUntilSettled(createScenarioPhysicalInput(4, 9));

    expect(snapshot.coins).toHaveLength(3);
    expect(snapshot.faces).toHaveLength(3);
    snapshot.faces?.forEach((face, index) => {
      expect(face).toBe(coinFaceFromPhysicsRotation(snapshot.coins[index].physicsRotation));
    });
  });

  it('uses the supplied toss seed to change the initial physics state', async () => {
    await initCoinPhysics();
    const firstSimulation = createCoinPhysicsSimulation(
      createScenarioPhysicalInput(2, 3, 0x11111111)
    );
    const secondSimulation = createCoinPhysicsSimulation(
      createScenarioPhysicalInput(2, 3, 0x22222222)
    );
    const firstSnapshot = firstSimulation.snapshot();
    const secondSnapshot = secondSimulation.snapshot();

    expect(
      firstSnapshot.coins.map((coin) => coin.position.toArray().map((value) => value.toFixed(5)))
    ).not.toEqual(
      secondSnapshot.coins.map((coin) => coin.position.toArray().map((value) => value.toFixed(5)))
    );

    firstSimulation.dispose();
    secondSimulation.dispose();
  });

  it('starts physical simulations from supplied input in released phase', async () => {
    await initCoinPhysics();
    const input = createScenarioPhysicalInput(1, 1, 0x1234);
    const simulation = createCoinPhysicsSimulation(input);
    const snapshot = simulation.snapshot();

    expect(snapshot.phase).toBe('released');
    expect(snapshot.settled).toBe(false);
    expect(snapshot.settledReason).toBeNull();
    snapshot.coins.forEach((coin, index) => {
      expect(coin.position.x).toBeCloseTo(input.coins[index].position[0], 5);
      expect(coin.position.y).toBeCloseTo(input.coins[index].position[1], 5);
      expect(coin.position.z).toBeCloseTo(input.coins[index].position[2], 5);
    });

    simulation.dispose();
  });

  it('settles physical tosses without chamber release controls', async () => {
    await initCoinPhysics();
    const simulation = createCoinPhysicsSimulation(createScenarioPhysicalInput(1, 1, 0x4567));

    let snapshot = simulation.snapshot();

    expect(simulation.releaseChamber).toBeUndefined();
    expect(simulation.updateChamberDrive).toBeUndefined();

    for (let step = 0; step < 1500 && !snapshot.settled; step += 1) {
      snapshot = simulation.step(1 / 60);
    }

    expect(snapshot.phase).toBe('settled');
    expect(snapshot.faces).toHaveLength(3);
    expect(snapshot.settledReason).not.toBeNull();
    snapshot.faces?.forEach((face, index) => {
      expect(face).toBe(coinFaceFromPhysicsRotation(snapshot.coins[index].physicsRotation));
    });

    simulation.dispose();
  });

  it('keeps legacy chamber compatibility from settling before release', async () => {
    await initCoinPhysics();
    const simulation = createCoinPhysicsSimulation(1, 7, 0x12345678, {
      mode: 'chamber',
      drive: { elapsedSeconds: 0, energy: 0.8, release: false }
    });
    let snapshot = simulation.snapshot();

    expect(snapshot.phase).toBe('contained');
    expect(snapshot.settled).toBe(false);
    expect(snapshot.faces).toBeNull();
    expectLegacyContainedCoins(snapshot);
    expect(simulation.updateChamberDrive).toBeTypeOf('function');
    expect(simulation.releaseChamber).toBeTypeOf('function');

    for (let step = 0; step < 360; step += 1) {
      simulation.updateChamberDrive?.({
        elapsedSeconds: step / 60,
        energy: 0.86,
        release: false
      });
      snapshot = simulation.step(1 / 60);
      expect(snapshot.phase).toBe('contained');
      expect(snapshot.settled).toBe(false);
      expect(snapshot.faces).toBeNull();
      expectLegacyContainedCoins(snapshot);
    }

    snapshot =
      simulation.releaseChamber?.({ elapsedSeconds: 6, energy: 0.86, release: true }) ??
      snapshot;
    expect(snapshot.phase).toBe('released');

    for (let step = 0; step < 900 && !snapshot.settled; step += 1) {
      snapshot = simulation.step(1 / 60);
    }

    expect(snapshot.settled).toBe(true);
    expect(snapshot.faces).toHaveLength(3);
    snapshot.faces?.forEach((face, index) => {
      expect(face).toBe(coinFaceFromPhysicsRotation(snapshot.coins[index].physicsRotation));
    });

    simulation.dispose();
  });

  it('keeps physical coin colliders above the tabletop while settling', async () => {
    await initCoinPhysics();

    for (let tossSeed = 1; tossSeed <= 18; tossSeed += 1) {
      const simulation = createCoinPhysicsSimulation(
        createScenarioPhysicalInput(1, 1, tossSeed * 0x1f123bb5)
      );
      let snapshot = simulation.snapshot();

      for (let step = 0; step < 720 && !snapshot.settled; step += 1) {
        snapshot = simulation.step(1 / 60);

        snapshot.coins.forEach((coin, index) => {
          expect(
            coinColliderBottomY(coin.position, coin.physicsRotation),
            `seed ${tossSeed} coin ${index} step ${step}`
          ).toBeGreaterThanOrEqual(-0.02);
        });
      }

      simulation.dispose();
    }
  });

  it('does not settle while a coin face is still unreadable from the tabletop', async () => {
    await initCoinPhysics();

    for (let currentThrow = 1; currentThrow <= 6; currentThrow += 1) {
      for (let requestId = 1; requestId <= 8; requestId += 1) {
        const snapshot = stepUntilSettled(createScenarioPhysicalInput(currentThrow, requestId));

        expect(snapshot.settled, `throw ${currentThrow}, request ${requestId}`).toBe(true);
        expect(
          snapshot.settledReason,
          `throw ${currentThrow}, request ${requestId}`
        ).not.toBeNull();

        const minimumReadableNormalY =
          snapshot.settledReason === 'timeout-readable' ? 0.72 : 0.99;

        snapshot.coins.forEach((coin) => {
          expect(
            Math.abs(physicsFaceNormalY(coin.physicsRotation)),
            `throw ${currentThrow}, request ${requestId}`
          ).toBeGreaterThanOrEqual(minimumReadableNormalY);
        });
      }
    }
  });
});
