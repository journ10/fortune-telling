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
const SETTLED_FACE_NORMAL_Y = 0.99;
const EDGE_DESTABILIZE_AFTER_SECONDS = 1.15;
const EDGE_DESTABILIZE_MAX_CENTER_Y = TABLETOP_COIN_RADIUS * 1.16;
const EDGE_DESTABILIZE_IMPULSE = 0.08;
const GAUSSIAN_MAX_SIGMA = 2.4;
const MICRO_PERTURBATION_END_SECONDS = 1.65;
const MICRO_PERTURBATION_BASE_IMPULSE = 0.00042;
const CHAMBER_HALF_WIDTH = 1.74;
const CHAMBER_HALF_DEPTH = 1.12;
const CHAMBER_HALF_HEIGHT = 0.58;
const CHAMBER_BOTTOM_HALF_HEIGHT = 0.035;
const CHAMBER_BOTTOM_COLLIDER_CLEARANCE = 0.012;
const TABLETOP_COLLIDER_FLOOR_CLEARANCE = 0.004;
const TABLETOP_COLLIDER_MAX_PENETRATION = 0.018;
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

export interface CoinPhysicsSnapshot {
  coins: SimulatedCoinSnapshot[];
  elapsed: number;
  faces: [CoinFace, CoinFace, CoinFace] | null;
  phase: CoinPhysicsPhase;
  settled: boolean;
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

function createRandomQuaternion(random: SeededRandom, index: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      randomGaussianOffset(random, Math.PI * 0.6),
      random() * Math.PI * 2,
      randomGaussianOffset(random, Math.PI * 0.6) + index * 0.24
    )
  );
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

function physicsFaceNormalY(rotation: THREE.Quaternion): number {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).y;
}

function isSettledFaceRotation(rotation: THREE.Quaternion): boolean {
  return Math.abs(physicsFaceNormalY(rotation)) >= SETTLED_FACE_NORMAL_Y;
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

    if (linearVelocity.y < 0) {
      body.setLinvel(
        {
          x: linearVelocity.x,
          y: 0,
          z: linearVelocity.z
        },
        true
      );
    }
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

function createChamberPose(drive: TossDriveState, phaseOffset: number): {
  rotation: THREE.Quaternion;
  translation: THREE.Vector3;
} {
  const energy = clamp(drive.energy, 0, 1);
  const elapsed = drive.elapsedSeconds;

  if (energy <= 0.001) {
    return {
      rotation: new THREE.Quaternion(),
      translation: new THREE.Vector3()
    };
  }

  const rotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      Math.sin(elapsed * 4.2 + phaseOffset) * 0.045 * energy,
      Math.sin(elapsed * 2.4 + phaseOffset) * 0.06 * energy,
      Math.cos(elapsed * 3.8 + phaseOffset) * 0.04 * energy
    )
  );
  let bottomMinimumY = Number.POSITIVE_INFINITY;

  [-CHAMBER_HALF_WIDTH, CHAMBER_HALF_WIDTH].forEach((x) => {
    [-CHAMBER_HALF_DEPTH, CHAMBER_HALF_DEPTH].forEach((z) => {
      bottomMinimumY = Math.min(
        bottomMinimumY,
        new THREE.Vector3(x, -CHAMBER_BOTTOM_HALF_HEIGHT * 2, z).applyQuaternion(rotation).y
      );
    });
  });

  const oscillatingLift =
    0.04 + Math.max(0, Math.sin(elapsed * 10.5 + phaseOffset)) * 0.22 * energy;
  const lift = Math.max(
    oscillatingLift,
    CHAMBER_BOTTOM_COLLIDER_CLEARANCE - bottomMinimumY
  );
  const translation = new THREE.Vector3(
    Math.sin(elapsed * 3.1 + phaseOffset) * 0.11 * energy,
    lift,
    Math.cos(elapsed * 2.7 + phaseOffset * 0.7) * 0.09 * energy
  );

  return { rotation, translation };
}

export function createCoinPhysicsSimulation(
  currentThrow: number,
  requestId: number,
  tossSeed = 0,
  options: CoinPhysicsOptions = {}
): CoinPhysicsSimulation {
  const seed = mixCoinPhysicsSeed(currentThrow, requestId, tossSeed);
  const random = createSeededRandom(seed);
  const chamberMode = options.mode === 'chamber';
  const chamberPhaseOffset = random() * Math.PI * 2;
  let chamberDrive = options.drive ?? { elapsedSeconds: 0, energy: 0, release: false };
  const initialChamberPose = chamberMode
    ? createChamberPose(chamberDrive, chamberPhaseOffset)
    : null;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.maxCcdSubsteps = 3;
  world.integrationParameters.numSolverIterations = 8;
  const table = RAPIER.ColliderDesc.cuboid(6.5, 0.04, 4.5)
    .setTranslation(0, -0.04, 0)
    .setFriction(0.92)
    .setRestitution(0.1);
  world.createCollider(table);

  const chamberBody = chamberMode
    ? world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(
            initialChamberPose?.translation.x ?? 0,
            initialChamberPose?.translation.y ?? 0,
            initialChamberPose?.translation.z ?? 0
          )
          .setRotation({
            x: initialChamberPose?.rotation.x ?? 0,
            y: initialChamberPose?.rotation.y ?? 0,
            z: initialChamberPose?.rotation.z ?? 0,
            w: initialChamberPose?.rotation.w ?? 1
          })
      )
    : null;

  if (chamberBody) {
    const bottom = RAPIER.ColliderDesc.cuboid(
      CHAMBER_HALF_WIDTH,
      CHAMBER_BOTTOM_HALF_HEIGHT,
      CHAMBER_HALF_DEPTH
    )
      .setTranslation(0, -CHAMBER_BOTTOM_HALF_HEIGHT, 0)
      .setFriction(1.2)
      .setRestitution(0.02);
    const top = RAPIER.ColliderDesc.cuboid(CHAMBER_HALF_WIDTH, 0.04, CHAMBER_HALF_DEPTH)
      .setTranslation(0, CHAMBER_HALF_HEIGHT * 2, 0)
      .setFriction(0.8)
      .setRestitution(0.02);
    const sideWall = (x: number, z: number, width: number, depth: number) =>
      RAPIER.ColliderDesc.cuboid(width, CHAMBER_HALF_HEIGHT, depth)
        .setTranslation(x, CHAMBER_HALF_HEIGHT, z)
        .setFriction(0.95)
        .setRestitution(0.02);

    [
      bottom,
      top,
      sideWall(-CHAMBER_HALF_WIDTH, 0, 0.04, CHAMBER_HALF_DEPTH),
      sideWall(CHAMBER_HALF_WIDTH, 0, 0.04, CHAMBER_HALF_DEPTH),
      sideWall(0, -CHAMBER_HALF_DEPTH, CHAMBER_HALF_WIDTH, 0.04),
      sideWall(0, CHAMBER_HALF_DEPTH, CHAMBER_HALF_WIDTH, 0.04)
    ].forEach((collider) => {
      world.createCollider(collider, chamberBody);
    });
  }

  const microPerturbations: MicroPerturbation[] = [];
  const bodies = [-1, 0, 1].map((slot, index) => {
    const chamberLocalPosition = new THREE.Vector3(
      slot * 1.06,
      COIN_PHYSICS_COLLIDER_HALF_HEIGHT + 0.006,
      (index - 1) * 0.08
    );
    const chamberStartPosition =
      chamberMode && initialChamberPose
        ? chamberLocalPosition
            .clone()
            .applyQuaternion(initialChamberPose.rotation)
            .add(initialChamberPose.translation)
        : null;
    const startRotation =
      chamberMode && initialChamberPose
        ? initialChamberPose.rotation.clone()
        : createRandomQuaternion(random, index);
    const materialProfile = createCoinMaterialProfile(random);
    microPerturbations[index] = createMicroPerturbation(random, index);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          chamberStartPosition?.x ?? slot * 1.02 + randomGaussianOffset(random, 0.08),
          chamberStartPosition?.y ?? 1.42 + index * 0.1 + randomGaussianOffset(random, 0.025),
          chamberStartPosition?.z ?? -0.22 + randomGaussianOffset(random, 0.04)
        )
        .setRotation({
          x: startRotation.x,
          y: startRotation.y,
          z: startRotation.z,
          w: startRotation.w
        })
        .setLinvel(
          chamberMode ? 0 : randomGaussianOffset(random, 0.46),
          chamberMode ? 0 : -0.44 + randomGaussianOffset(random, 0.16),
          chamberMode ? 0 : 0.34 + randomGaussianOffset(random, 0.36)
        )
        .setAngvel({
          x: chamberMode ? 0 : slot * 3.2 + randomGaussianOffset(random, 9),
          y: chamberMode ? 0 : randomGaussianOffset(random, 7),
          z: chamberMode ? 0 : randomGaussianOffset(random, 9)
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
  let chamberReleased = !chamberMode;
  let releasedAtElapsed = chamberMode ? Number.POSITIVE_INFINITY : 0;
  let settledFaces: [CoinFace, CoinFace, CoinFace] | null = null;

  const removeChamber = () => {
    if (chamberBody) {
      world.removeRigidBody(chamberBody);
    }
  };

  const updateChamberPose = () => {
    if (!chamberBody || chamberReleased) {
      return;
    }

    const pose = createChamberPose(chamberDrive, chamberPhaseOffset);
    chamberBody.setNextKinematicTranslation({
      x: pose.translation.x,
      y: pose.translation.y,
      z: pose.translation.z
    });
    chamberBody.setNextKinematicRotation({
      x: pose.rotation.x,
      y: pose.rotation.y,
      z: pose.rotation.z,
      w: pose.rotation.w
    });
  };

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
      phase: settledFaces
        ? 'settled'
        : chamberMode && !chamberReleased
          ? 'contained'
          : chamberMode
            ? 'released'
            : 'drop',
      settled: settledFaces !== null
    };
  };

  const detectSettledFaces = (): [CoinFace, CoinFace, CoinFace] | null => {
    if (chamberMode && !chamberReleased) {
      return null;
    }

    const settleElapsed = chamberMode ? elapsed - releasedAtElapsed : elapsed;

    if (settleElapsed < SETTLED_AFTER_SECONDS) {
      return null;
    }

    const hasCoinStandingOnEdge = bodies.some(
      (body) => !isSettledFaceRotation(quaternionFromRapier(body.rotation()))
    );

    const moving = bodies.some((body) => {
      const linear = body.linvel();
      const angular = body.angvel();
      const linearSpeed = Math.hypot(linear.x, linear.y, linear.z);
      const angularSpeed = Math.hypot(angular.x, angular.y, angular.z);

      return linearSpeed > LINEAR_SLEEP_SPEED || angularSpeed > ANGULAR_SLEEP_SPEED;
    });

    if (hasCoinStandingOnEdge) {
      return null;
    }

    if (moving && settleElapsed < FORCE_SETTLE_AFTER_SECONDS) {
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
    releaseChamber: (drive: TossDriveState) => {
      if (!chamberMode || chamberReleased) {
        return readSnapshot();
      }

      chamberDrive = drive;
      chamberReleased = true;
      releasedAtElapsed = elapsed;
      removeChamber();

      const energy = clamp(drive.energy, 0.18, 1);
      bodies.forEach((body, index) => {
        body.applyImpulse(
          {
            x: randomGaussianOffset(random, 0.18 * energy),
            y: 0.48 * energy + randomGaussianOffset(random, 0.12),
            z: randomGaussianOffset(random, 0.2 * energy)
          },
          true
        );
        body.applyTorqueImpulse(
          {
            x: (index - 1) * 0.18 + randomGaussianOffset(random, 0.16),
            y: randomGaussianOffset(random, 0.14),
            z: randomGaussianOffset(random, 0.18)
          },
          true
        );
      });

      return readSnapshot();
    },
    snapshot: readSnapshot,
    step: (deltaSeconds: number) => {
      if (settledFaces) {
        return readSnapshot();
      }

      accumulator += Math.min(deltaSeconds, 0.1);

      while (accumulator >= WORLD_TIMESTEP && !settledFaces) {
        world.timestep = WORLD_TIMESTEP;
        updateChamberPose();
        world.step();
        keepCoinsAboveTable(bodies);
        if (!chamberMode || chamberReleased) {
          applyMicroPerturbations(bodies, microPerturbations, chamberMode ? elapsed - releasedAtElapsed : elapsed);
          destabilizeCoinsStandingOnEdge(bodies, chamberMode ? elapsed - releasedAtElapsed : elapsed);
        }
        elapsed += WORLD_TIMESTEP;
        accumulator -= WORLD_TIMESTEP;
        settledFaces = detectSettledFaces();
      }

      return readSnapshot();
    },
    updateChamberDrive: (drive: TossDriveState) => {
      chamberDrive = drive;
    }
  };
}
