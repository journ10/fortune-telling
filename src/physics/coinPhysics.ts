import * as RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { CoinFace } from '../domain/types';
import { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS } from './coinGeometry';
import {
  createPointerPhysicalTossInput,
  type PhysicalCoinInitialState,
  type PhysicalTossInput
} from './physicalTossInput';

export const COIN_PHYSICS_ENGINE = 'rapier3d-compat';

const WORLD_TIMESTEP = 1 / 60;
const SETTLED_AFTER_SECONDS = 2.2;
const FORCE_SETTLE_AFTER_SECONDS = 4.25;
const LINEAR_SLEEP_SPEED = 0.13;
const ANGULAR_SLEEP_SPEED = 0.55;
const SETTLED_FACE_NORMAL_Y = 0.99;
const READABLE_AFTER_SECONDS = 5.5;
const READABLE_FACE_NORMAL_Y = 0.72;
const EDGE_DESTABILIZE_AFTER_SECONDS = 1.15;
const EDGE_DESTABILIZE_MAX_CENTER_Y = TABLETOP_COIN_RADIUS * 1.16;
const EDGE_DESTABILIZE_IMPULSE = 0.08;
const GAUSSIAN_MAX_SIGMA = 2.4;
const MICRO_PERTURBATION_END_SECONDS = 1.65;
const MICRO_PERTURBATION_BASE_IMPULSE = 0.00042;
const TABLETOP_COLLIDER_FLOOR_CLEARANCE = 0.004;
const TABLETOP_COLLIDER_MAX_PENETRATION = 0.018;
const TABLETOP_CORRECTION_LINEAR_DAMPING = 0.94;
const TABLETOP_CORRECTION_ANGULAR_DAMPING = 0.985;
export const COIN_PHYSICS_COLLIDER_SKIN = 0.012;
export const COIN_PHYSICS_COLLIDER_RADIUS = TABLETOP_COIN_RADIUS + COIN_PHYSICS_COLLIDER_SKIN;
export const COIN_PHYSICS_COLLIDER_HALF_HEIGHT =
  TABLETOP_COIN_THICKNESS / 2 + COIN_PHYSICS_COLLIDER_SKIN;
export const COIN_PHYSICS_FRICTION_BASE = 1.05;
export const COIN_PHYSICS_FRICTION_VARIATION = 0.04;
export const COIN_PHYSICS_RESTITUTION_BASE = 0.28;
export const COIN_PHYSICS_RESTITUTION_VARIATION = 0.015;
const VISUAL_FROM_PHYSICS_ROTATION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.PI / 2, 0, 0)
);

export interface SeededRandom {
  (): number;
}

export interface CoinMaterialProfile {
  friction: number;
  restitution: number;
}

interface MicroPerturbation {
  axis: THREE.Vector3;
  frequency: number;
  impulse: number;
  phase: number;
}

export type CoinTossMode = 'drop' | 'chamber';
export type CoinPhysicsPhase = 'drop' | 'contained' | 'released' | 'settled';

export interface TossDriveState {
  elapsedSeconds: number;
  energy: number;
  release: boolean;
}

export interface CoinPhysicsOptions {
  mode?: CoinTossMode;
  drive?: TossDriveState;
}

export interface SimulatedCoinSnapshot {
  position: THREE.Vector3;
  physicsRotation: THREE.Quaternion;
  visualRotation: THREE.Quaternion;
}

export type CoinPhysicsSettledReason = 'strict' | 'timeout-readable';

export interface CoinPhysicsSnapshot {
  coins: SimulatedCoinSnapshot[];
  elapsed: number;
  faces: [CoinFace, CoinFace, CoinFace] | null;
  phase: CoinPhysicsPhase;
  settled: boolean;
  settledReason: CoinPhysicsSettledReason | null;
}

export interface CoinPhysicsSimulation {
  dispose: () => void;
  releaseChamber?: (drive: TossDriveState) => CoinPhysicsSnapshot;
  snapshot: () => CoinPhysicsSnapshot;
  step: (deltaSeconds: number) => CoinPhysicsSnapshot;
  updateChamberDrive?: (drive: TossDriveState) => void;
}

let rapierInitPromise: Promise<void> | null = null;

export function initCoinPhysics(): Promise<void> {
  rapierInitPromise ??= RAPIER.init();
  return rapierInitPromise;
}

export function createSeededRandom(seed: number): SeededRandom {
  let value = seed >>> 0;

  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function randomGaussianOffset(
  random: SeededRandom,
  maxMagnitude: number,
  maxSigma = GAUSSIAN_MAX_SIGMA
): number {
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
  const boundedGaussian = Math.min(Math.max(gaussian, -maxSigma), maxSigma);

  return (boundedGaussian / maxSigma) * maxMagnitude;
}

export function createCoinMaterialProfile(random: SeededRandom): CoinMaterialProfile {
  return {
    friction:
      COIN_PHYSICS_FRICTION_BASE +
      randomGaussianOffset(random, COIN_PHYSICS_FRICTION_VARIATION),
    restitution:
      COIN_PHYSICS_RESTITUTION_BASE +
      randomGaussianOffset(random, COIN_PHYSICS_RESTITUTION_VARIATION)
  };
}

function mixCoinPhysicsSeed(currentThrow: number, requestId: number, tossSeed: number): number {
  let seed = 0x6d2b79f5;

  [currentThrow, requestId, tossSeed].forEach((component, index) => {
    seed ^= Math.imul((component >>> 0) + index * 0x9e3779b9, 0x85ebca6b);
    seed = Math.imul(seed ^ (seed >>> 16), 0xc2b2ae35) >>> 0;
    seed = (seed << 13) | (seed >>> 19);
  });

  return seed >>> 0;
}

function createMicroPerturbation(random: SeededRandom, index: number): MicroPerturbation {
  const axis = new THREE.Vector3(
    randomGaussianOffset(random, 1),
    randomGaussianOffset(random, 0.4),
    randomGaussianOffset(random, 1)
  );

  if (axis.lengthSq() < 0.0001) {
    axis.set(index - 1 || 0.35, 0.2, 0.7);
  }

  axis.normalize();

  return {
    axis,
    frequency: 18 + random() * 12,
    impulse: MICRO_PERTURBATION_BASE_IMPULSE * (0.75 + random() * 0.5),
    phase: random() * Math.PI * 2
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function quaternionFromRapier(rotation: RAPIER.Rotation): THREE.Quaternion {
  return new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
}

function quaternionFromTuple(tuple: PhysicalCoinInitialState['rotation']): THREE.Quaternion {
  return new THREE.Quaternion(tuple[0], tuple[1], tuple[2], tuple[3]).normalize();
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

function coinSnapshotsFromPhysicalTossInput(input: PhysicalTossInput): SimulatedCoinSnapshot[] {
  return input.coins.map((coin) => {
    const physicsRotation = quaternionFromTuple(coin.rotation);

    return {
      position: new THREE.Vector3(...coin.position),
      physicsRotation,
      visualRotation: visualRotationFromPhysicsRotation(physicsRotation)
    };
  });
}

function physicsFaceNormalY(rotation: THREE.Quaternion): number {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).y;
}

function isSettledFaceRotation(rotation: THREE.Quaternion): boolean {
  return Math.abs(physicsFaceNormalY(rotation)) >= SETTLED_FACE_NORMAL_Y;
}

function isReadableFaceRotation(rotation: THREE.Quaternion): boolean {
  return Math.abs(physicsFaceNormalY(rotation)) >= READABLE_FACE_NORMAL_Y;
}

function readFacesFromBodies(bodies: readonly RAPIER.RigidBody[]): [CoinFace, CoinFace, CoinFace] {
  return bodies.map((body) =>
    coinFaceFromPhysicsRotation(quaternionFromRapier(body.rotation()))
  ) as [CoinFace, CoinFace, CoinFace];
}

function coinColliderVerticalExtent(rotation: THREE.Quaternion): number {
  const axisY = Math.abs(physicsFaceNormalY(rotation));

  return (
    COIN_PHYSICS_COLLIDER_HALF_HEIGHT * axisY +
    COIN_PHYSICS_COLLIDER_RADIUS * Math.sqrt(Math.max(0, 1 - axisY * axisY))
  );
}

function keepCoinsAboveTable(bodies: readonly RAPIER.RigidBody[]): void {
  bodies.forEach((body) => {
    const translation = body.translation();
    const rotation = quaternionFromRapier(body.rotation());
    const bottomY = translation.y - coinColliderVerticalExtent(rotation);

    if (bottomY >= -TABLETOP_COLLIDER_MAX_PENETRATION) {
      return;
    }

    body.setTranslation(
      {
        x: translation.x,
        y: translation.y - bottomY + TABLETOP_COLLIDER_FLOOR_CLEARANCE,
        z: translation.z
      },
      true
    );

    const linearVelocity = body.linvel();
    body.setLinvel(
      {
        x: linearVelocity.x * TABLETOP_CORRECTION_LINEAR_DAMPING,
        y: Math.max(0, linearVelocity.y),
        z: linearVelocity.z * TABLETOP_CORRECTION_LINEAR_DAMPING
      },
      true
    );

    const angularVelocity = body.angvel();
    body.setAngvel(
      {
        x: angularVelocity.x * TABLETOP_CORRECTION_ANGULAR_DAMPING,
        y: angularVelocity.y * TABLETOP_CORRECTION_ANGULAR_DAMPING,
        z: angularVelocity.z * TABLETOP_CORRECTION_ANGULAR_DAMPING
      },
      true
    );
  });
}

function destabilizeCoinsStandingOnEdge(
  bodies: readonly RAPIER.RigidBody[],
  elapsed: number
): void {
  if (elapsed < EDGE_DESTABILIZE_AFTER_SECONDS) {
    return;
  }

  bodies.forEach((body) => {
    if (body.translation().y > EDGE_DESTABILIZE_MAX_CENTER_Y) {
      return;
    }

    const rotation = quaternionFromRapier(body.rotation());
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    const normalY = Math.abs(normal.y);

    if (normalY >= SETTLED_FACE_NORMAL_Y) {
      return;
    }

    const target = normal.y >= 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
    const torqueAxis = normal.cross(target);

    if (torqueAxis.lengthSq() < 0.0001) {
      return;
    }

    torqueAxis.normalize().multiplyScalar(EDGE_DESTABILIZE_IMPULSE * (1 - normalY));
    body.applyTorqueImpulse(
      {
        x: torqueAxis.x,
        y: torqueAxis.y,
        z: torqueAxis.z
      },
      true
    );
  });
}

function applyMicroPerturbations(
  bodies: readonly RAPIER.RigidBody[],
  perturbations: readonly MicroPerturbation[],
  elapsed: number
): void {
  if (elapsed > MICRO_PERTURBATION_END_SECONDS) {
    return;
  }

  const envelope = 1 - elapsed / MICRO_PERTURBATION_END_SECONDS;

  bodies.forEach((body, index) => {
    const perturbation = perturbations[index];
    const wave = Math.sin(elapsed * perturbation.frequency + perturbation.phase);
    const impulse = perturbation.impulse * wave * envelope;

    body.applyTorqueImpulse(
      {
        x: perturbation.axis.x * impulse,
        y: perturbation.axis.y * impulse,
        z: perturbation.axis.z * impulse
      },
      true
    );
  });
}

function createLegacyPhysicalTossInput(
  currentThrow: number,
  requestId: number,
  tossSeed: number,
  options: CoinPhysicsOptions
): PhysicalTossInput {
  const energy = clamp(options.drive?.energy ?? 0.58, 0.18, 1.2);
  const startX = 240 + ((requestId % 5) - 2) * 16;
  const startY = 292 + ((currentThrow % 3) - 1) * 12;
  const travelX = 96 + energy * 126;
  const travelY = 54 + energy * 72;

  return createPointerPhysicalTossInput({
    currentThrow,
    sceneWidth: 720,
    sceneHeight: 480,
    perturbationSeed: mixCoinPhysicsSeed(currentThrow, requestId, tossSeed),
    samples: [
      { x: startX, y: startY, timestamp: 0 },
      { x: startX + travelX * 0.45, y: startY - travelY * 0.35, timestamp: 90 },
      { x: startX + travelX, y: startY - travelY, timestamp: 180 }
    ]
  });
}

function createPhysicalCoinPhysicsSimulation(input: PhysicalTossInput): CoinPhysicsSimulation {
  const random = createSeededRandom(
    input.perturbationSeed ^
      Math.imul(input.currentThrow + 31, 0x85ebca6b) ^
      Math.imul(Math.round(input.energy * 1000), 0xc2b2ae35)
  );
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.maxCcdSubsteps = 3;
  world.integrationParameters.numSolverIterations = 8;
  const table = RAPIER.ColliderDesc.cuboid(6.5, 0.04, 4.5)
    .setTranslation(0, -0.04, 0)
    .setFriction(0.92 + randomGaussianOffset(random, input.perturbationScale * 0.22))
    .setRestitution(0.1);
  world.createCollider(table);

  const microPerturbations: MicroPerturbation[] = [];
  const bodies = input.coins.map((coin, index) => {
    const materialProfile = createCoinMaterialProfile(random);
    microPerturbations[index] = createMicroPerturbation(random, index);
    const rotation = quaternionFromTuple(coin.rotation);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(coin.position[0], coin.position[1], coin.position[2])
        .setRotation({
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          w: rotation.w
        })
        .setLinvel(coin.linearVelocity[0], coin.linearVelocity[1], coin.linearVelocity[2])
        .setAngvel({
          x: coin.angularVelocity[0],
          y: coin.angularVelocity[1],
          z: coin.angularVelocity[2]
        })
        .setLinearDamping(0.2)
        .setAngularDamping(0.16)
        .setCcdEnabled(true)
    );

    world.createCollider(
      RAPIER.ColliderDesc.cylinder(COIN_PHYSICS_COLLIDER_HALF_HEIGHT, COIN_PHYSICS_COLLIDER_RADIUS)
        .setFriction(materialProfile.friction)
        .setRestitution(materialProfile.restitution)
        .setDensity(6.2),
      body
    );

    return body;
  });

  let elapsed = 0;
  let accumulator = 0;
  let settledFaces: [CoinFace, CoinFace, CoinFace] | null = null;
  let settledReason: CoinPhysicsSettledReason | null = null;

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
      phase: settledFaces ? 'settled' : 'released',
      settled: settledFaces !== null,
      settledReason
    };
  };

  const detectSettledFaces = (): [CoinFace, CoinFace, CoinFace] | null => {
    if (elapsed < SETTLED_AFTER_SECONDS) {
      return null;
    }

    const rotations = bodies.map((body) => quaternionFromRapier(body.rotation()));
    const hasStrictFace = rotations.every(isSettledFaceRotation);
    const hasReadableFace = rotations.every(isReadableFaceRotation);
    const moving = bodies.some((body) => {
      const linear = body.linvel();
      const angular = body.angvel();
      const linearSpeed = Math.hypot(linear.x, linear.y, linear.z);
      const angularSpeed = Math.hypot(angular.x, angular.y, angular.z);

      return linearSpeed > LINEAR_SLEEP_SPEED || angularSpeed > ANGULAR_SLEEP_SPEED;
    });

    if (hasStrictFace && (!moving || elapsed >= FORCE_SETTLE_AFTER_SECONDS)) {
      settledReason = 'strict';
      return readFacesFromBodies(bodies);
    }

    if (elapsed >= READABLE_AFTER_SECONDS && hasReadableFace) {
      settledReason = 'timeout-readable';
      return readFacesFromBodies(bodies);
    }

    return null;
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
        keepCoinsAboveTable(bodies);
        applyMicroPerturbations(bodies, microPerturbations, elapsed);
        destabilizeCoinsStandingOnEdge(bodies, elapsed);
        elapsed += WORLD_TIMESTEP;
        accumulator -= WORLD_TIMESTEP;
        settledFaces = detectSettledFaces();
      }

      return readSnapshot();
    }
  };
}

function createLegacyChamberCompatibilitySimulation(
  currentThrow: number,
  requestId: number,
  tossSeed: number,
  options: CoinPhysicsOptions
): CoinPhysicsSimulation {
  let latestDrive = options.drive ?? { elapsedSeconds: 0, energy: 0, release: false };
  let delegate: CoinPhysicsSimulation | null = null;

  const containedSnapshot = (): CoinPhysicsSnapshot => {
    const input = createLegacyPhysicalTossInput(currentThrow, requestId, tossSeed, {
      ...options,
      drive: latestDrive
    });

    return {
      coins: coinSnapshotsFromPhysicalTossInput(input),
      elapsed: latestDrive.elapsedSeconds,
      faces: null,
      phase: 'contained',
      settled: false,
      settledReason: null
    };
  };

  return {
    dispose: () => {
      delegate?.dispose();
    },
    releaseChamber: (drive: TossDriveState) => {
      if (delegate) {
        return delegate.snapshot();
      }

      latestDrive = drive;
      delegate = createPhysicalCoinPhysicsSimulation(
        createLegacyPhysicalTossInput(currentThrow, requestId, tossSeed, {
          ...options,
          drive
        })
      );

      return delegate.snapshot();
    },
    snapshot: () => {
      return delegate?.snapshot() ?? containedSnapshot();
    },
    step: (deltaSeconds: number) => {
      return delegate?.step(deltaSeconds) ?? containedSnapshot();
    },
    updateChamberDrive: (drive: TossDriveState) => {
      latestDrive = drive;
    }
  };
}

export function createCoinPhysicsSimulation(input: PhysicalTossInput): CoinPhysicsSimulation;
// Temporary compatibility for pre-migration tabletop chamber callers.
// Remove when UI callers move fully to PhysicalTossInput.
export function createCoinPhysicsSimulation(
  currentThrow: number,
  requestId: number,
  tossSeed?: number,
  options?: CoinPhysicsOptions
): CoinPhysicsSimulation;
export function createCoinPhysicsSimulation(
  inputOrCurrentThrow: PhysicalTossInput | number,
  requestId = 0,
  tossSeed = 0,
  options: CoinPhysicsOptions = {}
): CoinPhysicsSimulation {
  if (typeof inputOrCurrentThrow === 'number') {
    if (options.mode === 'chamber') {
      return createLegacyChamberCompatibilitySimulation(
        inputOrCurrentThrow,
        requestId,
        tossSeed,
        options
      );
    }

    return createPhysicalCoinPhysicsSimulation(
      createLegacyPhysicalTossInput(inputOrCurrentThrow, requestId, tossSeed, options)
    );
  }

  return createPhysicalCoinPhysicsSimulation(inputOrCurrentThrow);
}
