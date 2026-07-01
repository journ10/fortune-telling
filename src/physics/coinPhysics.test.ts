import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  COIN_PHYSICS_ENGINE,
  coinFaceFromPhysicsRotation,
  coinFaceFromVisualRotation,
  createCoinPhysicsSimulation,
  initCoinPhysics
} from './coinPhysics';

describe('coinPhysics', () => {
  it('uses Rapier as the coin toss physics engine', () => {
    expect(COIN_PHYSICS_ENGINE).toBe('rapier3d-compat');
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
    const simulation = createCoinPhysicsSimulation(4, 9);
    let snapshot = simulation.snapshot();

    expect(snapshot.coins).toHaveLength(3);
    expect(snapshot.faces).toBeNull();

    for (let step = 0; step < 300 && !snapshot.settled; step += 1) {
      snapshot = simulation.step(1 / 60);
    }

    expect(snapshot.faces).toHaveLength(3);
    snapshot.faces?.forEach((face, index) => {
      expect(face).toBe(coinFaceFromPhysicsRotation(snapshot.coins[index].physicsRotation));
    });

    simulation.dispose();
  });
});
