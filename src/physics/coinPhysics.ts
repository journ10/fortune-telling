import * as RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { CoinFace } from '../domain/types';
import { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS } from './coinGeometry';

export const COIN_PHYSICS_ENGINE = 'rapier3d-compat';

const WORLD_TIMESTEP = 1 / 60;
const SETTLED_AFTER_SECONDS = 2.2;
const FORCE_SETTLE_AFTER_SECONDS = 4.25;
const LINEAR_SLEEP_SPEED = 0.13;
const ANGULAR_SLEEP_SPEED = 0.55;
const VISUAL_FROM_PHYSICS_ROTATION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.PI / 2, 0, 0)
);

interface SeededRandom {
  (): number;
}

export interface SimulatedCoinSnapshot {
  position: THREE.Vector3;
  physicsRotation: THREE.Quaternion;
  visualRotation: THREE.Quaternion;
}

export interface CoinPhysicsSnapshot {
  coins: SimulatedCoinSnapshot[];
  elapsed: number;
  faces: [CoinFace, CoinFace, CoinFace] | null;
  settled: boolean;
}

export interface CoinPhysicsSimulation {
  dispose: () => void;
  snapshot: () => CoinPhysicsSnapshot;
  step: (deltaSeconds: number) => CoinPhysicsSnapshot;
}

let rapierInitPromise: Promise<void> | null = null;

export function initCoinPhysics(): Promise<void> {
  rapierInitPromise ??= RAPIER.init();
  return rapierInitPromise;
}

function createSeededRandom(seed: number): SeededRandom {
  let value = seed >>> 0;

  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createRandomQuaternion(random: SeededRandom, index: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      (random() - 0.5) * Math.PI * 1.2,
      random() * Math.PI * 2,
      (random() - 0.5) * Math.PI * 1.2 + index * 0.24
    )
  );
}

function quaternionFromRapier(rotation: RAPIER.Rotation): THREE.Quaternion {
  return new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
}

export function coinFaceFromVisualRotation(rotation: THREE.Quaternion): CoinFace {
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
  return normal.y >= 0 ? 'heads' : 'tails';
}

export function coinFaceFromPhysicsRotation(rotation: THREE.Quaternion): CoinFace {
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  return normal.y >= 0 ? 'heads' : 'tails';
}

export function visualRotationFromPhysicsRotation(rotation: THREE.Quaternion): THREE.Quaternion {
  return rotation.clone().multiply(VISUAL_FROM_PHYSICS_ROTATION);
}

export function createCoinPhysicsSimulation(
  currentThrow: number,
  requestId: number
): CoinPhysicsSimulation {
  const seed = Math.imul(currentThrow + 31, 2654435761) ^ Math.imul(requestId + 97, 2246822519);
  const random = createSeededRandom(seed);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const table = RAPIER.ColliderDesc.cuboid(6.5, 0.04, 4.5)
    .setTranslation(0, -0.04, 0)
    .setFriction(0.92)
    .setRestitution(0.1);
  world.createCollider(table);

  const bodies = [-1, 0, 1].map((slot, index) => {
    const startRotation = createRandomQuaternion(random, index);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(slot * 1.02 + (random() - 0.5) * 0.16, 1.42 + index * 0.1, -0.22)
        .setRotation({
          x: startRotation.x,
          y: startRotation.y,
          z: startRotation.z,
          w: startRotation.w
        })
        .setLinvel(
          (random() - 0.5) * 0.92,
          -0.28 - random() * 0.32,
          0.34 + (random() - 0.5) * 0.72
        )
        .setAngvel({
          x: (random() - 0.5) * 18 + slot * 3.2,
          y: (random() - 0.5) * 14,
          z: (random() - 0.5) * 18
        })
        .setLinearDamping(0.2)
        .setAngularDamping(0.16)
        .setCcdEnabled(true)
    );

    world.createCollider(
      RAPIER.ColliderDesc.cylinder(TABLETOP_COIN_THICKNESS / 2, TABLETOP_COIN_RADIUS)
        .setFriction(1.05)
        .setRestitution(0.28)
        .setDensity(6.2),
      body
    );

    return body;
  });

  let elapsed = 0;
  let accumulator = 0;
  let settledFaces: [CoinFace, CoinFace, CoinFace] | null = null;

  const readSnapshot = (): CoinPhysicsSnapshot => {
    const coins = bodies.map<SimulatedCoinSnapshot>((body) => {
      const translation = body.translation();
      const physicsRotation = quaternionFromRapier(body.rotation());

      return {
        position: new THREE.Vector3(translation.x, translation.y, translation.z),
        physicsRotation,
        visualRotation: visualRotationFromPhysicsRotation(physicsRotation)
      };
    });

    return {
      coins,
      elapsed,
      faces: settledFaces,
      settled: settledFaces !== null
    };
  };

  const detectSettledFaces = (): [CoinFace, CoinFace, CoinFace] | null => {
    if (elapsed < SETTLED_AFTER_SECONDS) {
      return null;
    }

    const moving = bodies.some((body) => {
      const linear = body.linvel();
      const angular = body.angvel();
      const linearSpeed = Math.hypot(linear.x, linear.y, linear.z);
      const angularSpeed = Math.hypot(angular.x, angular.y, angular.z);

      return linearSpeed > LINEAR_SLEEP_SPEED || angularSpeed > ANGULAR_SLEEP_SPEED;
    });

    if (moving && elapsed < FORCE_SETTLE_AFTER_SECONDS) {
      return null;
    }

    return bodies.map((body) =>
      coinFaceFromPhysicsRotation(quaternionFromRapier(body.rotation()))
    ) as [CoinFace, CoinFace, CoinFace];
  };

  return {
    dispose: () => {
      world.free();
    },
    snapshot: readSnapshot,
    step: (deltaSeconds: number) => {
      if (settledFaces) {
        return readSnapshot();
      }

      accumulator += Math.min(deltaSeconds, 0.1);

      while (accumulator >= WORLD_TIMESTEP && !settledFaces) {
        world.timestep = WORLD_TIMESTEP;
        world.step();
        elapsed += WORLD_TIMESTEP;
        accumulator -= WORLD_TIMESTEP;
        settledFaces = detectSettledFaces();
      }

      return readSnapshot();
    }
  };
}
