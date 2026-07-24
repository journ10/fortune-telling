// Headless coin toss simulation (M1: physical closed loop).
//
// createCoinTossSimulation(input) builds a Rapier world purely from a
// PhysicalTossInput, steps it until the coins settle, and reports the
// result as a SettledToss. Faces come ONLY from final rigid-body
// orientations via faceReader; the perturbation seed may only touch
// physical variables (materials, table friction, tabletop micro tilt).
//
// This module imports no React, three.js, or DOM APIs and runs in plain
// Node (vitest `node` environment).

import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { CoinFace } from '../domain/types';
import { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS } from './coinDimensions';
import { faceNormalYFromQuaternion, readCoinFace } from './faceReader';
import type { PhysicalTossInput, QuaternionTuple, Vec3Tuple } from './physicalTossInput';
import { createSeededRandom, randomGaussianOffset } from './seededRandom';
import {
  HARD_CAP_SECONDS,
  SETTLEMENT_TIMESTEP,
  edgeDestabilizationTorque,
  evaluateSettlement,
  type CoinSettlementSample,
  type SettledReason
} from './settlement';

export const COIN_TOSS_SIMULATION_ENGINE = 'rapier3d-compat';

export type { SettledReason } from './settlement';

const COLLIDER_SKIN = 0.012;
const COLLIDER_RADIUS = TABLETOP_COIN_RADIUS + COLLIDER_SKIN;
const COLLIDER_HALF_HEIGHT = TABLETOP_COIN_THICKNESS / 2 + COLLIDER_SKIN;
const COIN_FRICTION_BASE = 0.55;
const COIN_RESTITUTION_BASE = 0.65;
const TABLE_FRICTION_BASE = 0.55;
const TABLE_RESTITUTION = 0.1;
const TABLE_HALF_X = 7.5;
const TABLE_HALF_Z = 5.5;
const TABLE_THICKNESS = 0.04;
const GRAVITY = 9.81;
const MAX_GRAVITY_TILT = 0.35;
const FLOOR_CLEARANCE = 0.004;
const MAX_PENETRATION = 0.018;
const PENETRATION_LINEAR_DAMPING = 0.94;
const PENETRATION_ANGULAR_DAMPING = 0.985;
const MAX_STEP_DELTA_SECONDS = 0.1;
/**
 * 接触感知阻尼：铜钱腾空时阻尼极小（飞行/翻滚不受干扰）；
 * 一旦接触桌面，阻尼加大模拟桌面摩擦吸能，让铜钱在物理上停稳，
 * 而不是靠 timeout-readable 在空中定格（M5 bugfix）。
 */
const AIRBORNE_DAMPING = 0.05;
const TABLE_LINEAR_DAMPING = 2.2;
const TABLE_ANGULAR_DAMPING = 3.2;
const TABLE_CONTACT_BOTTOM_CLEARANCE = 0.02;

export interface SettledToss {
  faces: [CoinFace, CoinFace, CoinFace];
  settledReason: SettledReason;
  settledTimeMs: number;
}

export interface CoinTossBodySnapshot {
  position: Vec3Tuple;
  rotation: QuaternionTuple;
  linearVelocity: Vec3Tuple;
  angularVelocity: Vec3Tuple;
}

export interface CoinTossSimulationSnapshot {
  coins: [CoinTossBodySnapshot, CoinTossBodySnapshot, CoinTossBodySnapshot];
  elapsedSeconds: number;
  settledToss: SettledToss | null;
}

export interface CoinTossSimulation {
  step: (deltaSeconds?: number) => CoinTossSimulationSnapshot;
  snapshot: () => CoinTossSimulationSnapshot;
  runToSettlement: (maxSeconds?: number) => SettledToss;
  dispose: () => void;
}

let rapierModule: typeof RAPIER | null = null;
let rapierInitPromise: Promise<void> | null = null;

/**
 * Must resolve before createCoinTossSimulation is called.
 * Rapier（含 WASM）按需动态加载，不进首屏 bundle。
 */
export function initTossPhysics(): Promise<void> {
  rapierInitPromise ??= import('@dimforge/rapier3d-compat').then((module) => {
    rapierModule = module;
    return module.init();
  });
  return rapierInitPromise;
}

function mixSimulationSeed(input: PhysicalTossInput): number {
  return (
    (input.perturbationSeed ^
      Math.imul(input.currentThrow + 31, 0x85ebca6b) ^
      Math.imul(Math.round(input.energy * 1000), 0xc2b2ae35)) >>>
    0
  );
}

function quaternionFromRapier(rotation: RAPIER.Rotation): QuaternionTuple {
  const length = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w) || 1;
  return [rotation.x / length, rotation.y / length, rotation.z / length, rotation.w / length];
}

function vec3FromRapier(vector: RAPIER.Vector): Vec3Tuple {
  return [vector.x, vector.y, vector.z];
}

function colliderVerticalExtent(rotation: QuaternionTuple): number {
  const axisY = Math.abs(faceNormalYFromQuaternion(rotation));

  return (
    COLLIDER_HALF_HEIGHT * axisY + COLLIDER_RADIUS * Math.sqrt(Math.max(0, 1 - axisY * axisY))
  );
}

/** Guard against collider tunnelling; never touches orientation. */
function keepCoinsAboveTable(bodies: readonly RAPIER.RigidBody[]): void {
  bodies.forEach((body) => {
    const translation = body.translation();
    const bottomY = translation.y - colliderVerticalExtent(quaternionFromRapier(body.rotation()));

    if (bottomY >= -MAX_PENETRATION) {
      return;
    }

    body.setTranslation(
      {
        x: translation.x,
        y: translation.y - bottomY + FLOOR_CLEARANCE,
        z: translation.z
      },
      true
    );

    const linearVelocity = body.linvel();
    body.setLinvel(
      {
        x: linearVelocity.x * PENETRATION_LINEAR_DAMPING,
        y: Math.max(0, linearVelocity.y),
        z: linearVelocity.z * PENETRATION_LINEAR_DAMPING
      },
      true
    );

    const angularVelocity = body.angvel();
    body.setAngvel(
      {
        x: angularVelocity.x * PENETRATION_ANGULAR_DAMPING,
        y: angularVelocity.y * PENETRATION_ANGULAR_DAMPING,
        z: angularVelocity.z * PENETRATION_ANGULAR_DAMPING
      },
      true
    );
  });
}

/**
 * Contact-aware damping: airborne coins keep minimal damping (flight and
 * tumbling untouched); once a coin touches the table, stronger damping
 * absorbs bounce/roll energy so it physically comes to rest.
 */
function updateContactDamping(bodies: readonly RAPIER.RigidBody[]): void {
  bodies.forEach((body) => {
    const bottomY =
      body.translation().y - colliderVerticalExtent(quaternionFromRapier(body.rotation()));
    const onTable = bottomY <= TABLE_CONTACT_BOTTOM_CLEARANCE;
    body.setLinearDamping(onTable ? TABLE_LINEAR_DAMPING : AIRBORNE_DAMPING);
    body.setAngularDamping(onTable ? TABLE_ANGULAR_DAMPING : AIRBORNE_DAMPING);
  });
}

function sampleBodies(bodies: readonly RAPIER.RigidBody[]): CoinSettlementSample[] {
  return bodies.map((body) => ({
    positionY: body.translation().y,
    rotation: quaternionFromRapier(body.rotation()),
    linearVelocity: vec3FromRapier(body.linvel()),
    angularVelocity: vec3FromRapier(body.angvel())
  }));
}

/**
 * Create a headless toss simulation from physical input only.
 * The input's perturbationSeed perturbs friction, restitution, and the
 * tabletop micro tilt — physical variables, never coin faces.
 */
export function createCoinTossSimulation(input: PhysicalTossInput): CoinTossSimulation {
  const rapier = rapierModule;
  if (!rapier) {
    throw new Error('initTossPhysics() must resolve before createCoinTossSimulation');
  }

  const random = createSeededRandom(mixSimulationSeed(input));
  const tiltLimit = Math.min(MAX_GRAVITY_TILT, input.perturbationScale * 4);
  const gravity = {
    x: randomGaussianOffset(random, tiltLimit),
    y: -GRAVITY,
    z: randomGaussianOffset(random, tiltLimit)
  };
  const world = new rapier.World(gravity);
  world.integrationParameters.maxCcdSubsteps = 3;
  world.integrationParameters.numSolverIterations = 8;

  world.createCollider(
    rapier.ColliderDesc.cuboid(TABLE_HALF_X, TABLE_THICKNESS, TABLE_HALF_Z)
      .setTranslation(0, -TABLE_THICKNESS, 0)
      .setFriction(
        TABLE_FRICTION_BASE + randomGaussianOffset(random, input.perturbationScale * 0.22)
      )
      .setRestitution(TABLE_RESTITUTION)
  );

  const bodies = input.coins.map((coin) => {
    // Seeded per-coin material variation: a physical perturbation only.
    const friction =
      COIN_FRICTION_BASE + randomGaussianOffset(random, input.perturbationScale * 2.2);
    const restitution =
      COIN_RESTITUTION_BASE + randomGaussianOffset(random, input.perturbationScale * 2.2);
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(coin.position[0], coin.position[1], coin.position[2])
        .setRotation({
          x: coin.rotation[0],
          y: coin.rotation[1],
          z: coin.rotation[2],
          w: coin.rotation[3]
        })
        .setLinvel(coin.linearVelocity[0], coin.linearVelocity[1], coin.linearVelocity[2])
        .setAngvel({
          x: coin.angularVelocity[0],
          y: coin.angularVelocity[1],
          z: coin.angularVelocity[2]
        })
        .setLinearDamping(0.05)
        .setAngularDamping(0.05)
        .setCcdEnabled(true)
    );

    world.createCollider(
      rapier.ColliderDesc.cylinder(COLLIDER_HALF_HEIGHT, COLLIDER_RADIUS)
        .setFriction(Math.max(0.05, friction))
        .setRestitution(Math.min(0.95, Math.max(0, restitution)))
        .setDensity(8.5),
      body
    );

    return body;
  });

  let elapsed = 0;
  let accumulator = 0;
  let settledToss: SettledToss | null = null;

  const snapshotCoins = (): CoinTossSimulationSnapshot['coins'] =>
    bodies.map((body) => ({
      position: vec3FromRapier(body.translation()),
      rotation: quaternionFromRapier(body.rotation()),
      linearVelocity: vec3FromRapier(body.linvel()),
      angularVelocity: vec3FromRapier(body.angvel())
    })) as CoinTossSimulationSnapshot['coins'];

  const snapshot = (): CoinTossSimulationSnapshot => ({
    coins: snapshotCoins(),
    elapsedSeconds: elapsed,
    settledToss
  });

  const detectSettlement = (): void => {
    const samples = sampleBodies(bodies);
    const decision = evaluateSettlement(samples, elapsed);

    if (decision.status !== 'settled') {
      return;
    }

    settledToss = {
      faces: samples.map((sample) => readCoinFace(sample.rotation)) as SettledToss['faces'],
      settledReason: decision.reason,
      settledTimeMs: Math.round(elapsed * 1000)
    };
  };

  const simulation: CoinTossSimulation = {
    step: (deltaSeconds = SETTLEMENT_TIMESTEP) => {
      if (settledToss) {
        return snapshot();
      }

      accumulator += Math.min(deltaSeconds, MAX_STEP_DELTA_SECONDS);

      while (accumulator >= SETTLEMENT_TIMESTEP && !settledToss) {
        updateContactDamping(bodies);
        world.timestep = SETTLEMENT_TIMESTEP;
        world.step();
        keepCoinsAboveTable(bodies);

        sampleBodies(bodies).forEach((sample, index) => {
          const torque = edgeDestabilizationTorque(sample, elapsed);

          if (torque) {
            bodies[index].applyTorqueImpulse(
              { x: torque[0], y: torque[1], z: torque[2] },
              true
            );
          }
        });

        elapsed += SETTLEMENT_TIMESTEP;
        accumulator -= SETTLEMENT_TIMESTEP;
        detectSettlement();
      }

      return snapshot();
    },
    snapshot,
    runToSettlement: (maxSeconds = HARD_CAP_SECONDS + SETTLEMENT_TIMESTEP) => {
      while (!settledToss && elapsed < maxSeconds) {
        simulation.step(SETTLEMENT_TIMESTEP);
      }

      if (!settledToss) {
        throw new Error(
          `Coin toss did not settle within ${maxSeconds}s; increase the cap rather than generating faces.`
        );
      }

      return settledToss;
    },
    dispose: () => {
      world.free();
    }
  };

  return simulation;
}
