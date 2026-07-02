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
  initCoinPhysics
} from './coinPhysics';
import { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS } from './coinGeometry';

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

function stepUntilSettled(currentThrow: number, requestId: number, tossSeed = 0x5eed1234) {
  const simulation = createCoinPhysicsSimulation(currentThrow, requestId, tossSeed);
  let snapshot = simulation.snapshot();

  for (let step = 0; step < 720 && !snapshot.settled; step += 1) {
    snapshot = simulation.step(1 / 60);
  }

  simulation.dispose();
  return snapshot;
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

  it('creates three simulated coin bodies whose results come from final physics rotations', async () => {
    await initCoinPhysics();
    const snapshot = stepUntilSettled(4, 9);

    expect(snapshot.coins).toHaveLength(3);
    expect(snapshot.faces).toHaveLength(3);
    snapshot.faces?.forEach((face, index) => {
      expect(face).toBe(coinFaceFromPhysicsRotation(snapshot.coins[index].physicsRotation));
    });
  });

  it('uses the supplied toss seed to change the initial physics state', async () => {
    await initCoinPhysics();
    const firstSimulation = createCoinPhysicsSimulation(2, 3, 0x11111111);
    const secondSimulation = createCoinPhysicsSimulation(2, 3, 0x22222222);
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

  it('starts chamber simulations with coins resting flat on the tabletop before shaking', async () => {
    await initCoinPhysics();
    const simulation = createCoinPhysicsSimulation(1, 1, 0x1234, {
      mode: 'chamber',
      drive: { elapsedSeconds: 0, energy: 0, release: false }
    });
    const snapshot = simulation.snapshot();

    expect(snapshot.phase).toBe('contained');
    expect(snapshot.settled).toBe(false);
    snapshot.coins.forEach((coin, index) => {
      expect(coin.position.y).toBeLessThan(TABLETOP_COIN_RADIUS * 0.18);
      expect(Math.abs(physicsFaceNormalY(coin.physicsRotation))).toBeGreaterThanOrEqual(0.99);

      snapshot.coins.slice(index + 1).forEach((otherCoin) => {
        const horizontalDistance = Math.hypot(
          coin.position.x - otherCoin.position.x,
          coin.position.z - otherCoin.position.z
        );

        expect(horizontalDistance).toBeGreaterThanOrEqual(COIN_PHYSICS_COLLIDER_RADIUS * 2);
      });
    });

    simulation.dispose();
  });

  it('keeps chamber-driven coins bounded before release and settles only after release', async () => {
    await initCoinPhysics();
    const simulation = createCoinPhysicsSimulation(1, 1, 0x4567, {
      mode: 'chamber',
      drive: { elapsedSeconds: 0, energy: 0.8, release: false }
    });

    let snapshot = simulation.snapshot();

    for (let step = 0; step < 180; step += 1) {
      simulation.updateChamberDrive?.({
        elapsedSeconds: step / 60,
        energy: 0.85,
        release: false
      });
      snapshot = simulation.step(1 / 60);

      expect(snapshot.phase).toBe('contained');
      expect(snapshot.settled).toBe(false);
      snapshot.coins.forEach((coin) => {
        expect(Number.isFinite(coin.position.x)).toBe(true);
        expect(Number.isFinite(coin.position.y)).toBe(true);
        expect(Number.isFinite(coin.position.z)).toBe(true);
        expect(Math.abs(coin.position.x)).toBeLessThanOrEqual(1.94);
        expect(Math.abs(coin.position.z)).toBeLessThanOrEqual(1.32);
        expect(coin.position.y).toBeLessThanOrEqual(1.28);
      });
    }

    simulation.releaseChamber?.({ elapsedSeconds: 3.1, energy: 0.85, release: true });

    for (let step = 0; step < 1500 && !snapshot.settled; step += 1) {
      snapshot = simulation.step(1 / 60);
    }

    expect(snapshot.phase).toBe('settled');
    expect(snapshot.faces).toHaveLength(3);
    snapshot.faces?.forEach((face, index) => {
      expect(face).toBe(coinFaceFromPhysicsRotation(snapshot.coins[index].physicsRotation));
    });

    simulation.dispose();
  });

  it('keeps chamber-driven coin colliders above the tabletop during shaking and release', async () => {
    await initCoinPhysics();

    for (let tossSeed = 1; tossSeed <= 18; tossSeed += 1) {
      const simulation = createCoinPhysicsSimulation(1, 1, tossSeed * 0x1f123bb5, {
        mode: 'chamber',
        drive: { elapsedSeconds: 0, energy: 0.9, release: false }
      });
      let snapshot = simulation.snapshot();

      for (let step = 0; step < 240; step += 1) {
        simulation.updateChamberDrive?.({
          elapsedSeconds: step / 60,
          energy: 0.92,
          release: false
        });
        snapshot = simulation.step(1 / 60);

        snapshot.coins.forEach((coin, index) => {
          expect(
            coinColliderBottomY(coin.position, coin.physicsRotation),
            `seed ${tossSeed} coin ${index} contained step ${step}`
          ).toBeGreaterThanOrEqual(-0.02);
        });
      }

      simulation.releaseChamber?.({ elapsedSeconds: 4.1, energy: 0.92, release: true });

      for (let step = 0; step < 360 && !snapshot.settled; step += 1) {
        snapshot = simulation.step(1 / 60);

        snapshot.coins.forEach((coin, index) => {
          expect(
            coinColliderBottomY(coin.position, coin.physicsRotation),
            `seed ${tossSeed} coin ${index} released step ${step}`
          ).toBeGreaterThanOrEqual(-0.02);
        });
      }

      simulation.dispose();
    }
  });

  it('does not settle while a coin is still visibly tilted off the tabletop', async () => {
    await initCoinPhysics();

    for (let currentThrow = 1; currentThrow <= 6; currentThrow += 1) {
      for (let requestId = 1; requestId <= 8; requestId += 1) {
        const snapshot = stepUntilSettled(currentThrow, requestId);

        expect(snapshot.settled, `throw ${currentThrow}, request ${requestId}`).toBe(true);
        snapshot.coins.forEach((coin) => {
          expect(
            Math.abs(physicsFaceNormalY(coin.physicsRotation)),
            `throw ${currentThrow}, request ${requestId}`
          ).toBeGreaterThanOrEqual(0.99);
        });
      }
    }
  });
});
