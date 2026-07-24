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

// ---------------------------------------------------------------------------
// Rattle simulation (M5): physics-driven charging. While the user holds and
// shakes, three coins rattle on the tabletop inside an invisible fence;
// pointer shake velocity maps to horizontal impulses. Purely visual/haptic:
// release still mints a fresh PhysicalTossInput, so the evidence chain,
// reproducibility, and distribution stats are untouched.
// ---------------------------------------------------------------------------

export interface RattleAgitation {
  /** 水平扰动方向（世界系 x/z，无需归一化）；近零时用慢速旋转方向兜底。 */
  x: number;
  z: number;
  /** 0..1 摇动能量。 */
  energy: number;
}

export interface RattleSimulation {
  step: (deltaSeconds: number, agitation: RattleAgitation) => CoinTossSimulationSnapshot;
  snapshot: () => CoinTossSimulationSnapshot;
  dispose: () => void;
}

/** 围栏内边界（不含墙厚）：铜钱始终留在桌面可视范围内。 */
export const RATTLE_FENCE_X = 1.8;
export const RATTLE_FENCE_Z = 1.2;
const RATTLE_WALL_HALF_HEIGHT = 0.3;
const RATTLE_WALL_THICKNESS = 0.06;
const RATTLE_HORIZONTAL_IMPULSE = 0.05;
const RATTLE_VERTICAL_IMPULSE = 0.34;
// 每个子步的跳起概率（energy=1 时约 11 次/秒），形成随机真实的蹦跳。
const RATTLE_HOP_CHANCE = 0.16;
// 摇钱阻尼低于投掷落桌阻尼（2.2/3.2）：让铜钱持续跳动，输入停止后自然平静。
const RATTLE_LINEAR_DAMPING = 0.9;
const RATTLE_ANGULAR_DAMPING = 1.6;
/** 任何情况下铜钱中心不得越过的高度（物理兜底，防能量堆积飞出）。 */
const RATTLE_MAX_COIN_HEIGHT = 0.6;

export function createRattleSimulation(seed = 1): RattleSimulation {
  const rapier = rapierModule;
  if (!rapier) {
    throw new Error('initTossPhysics() must resolve before createRattleSimulation');
  }

  const random = createSeededRandom(seed >>> 0);
  const world = new rapier.World({ x: 0, y: -GRAVITY, z: 0 });
  world.integrationParameters.maxCcdSubsteps = 3;
  world.integrationParameters.numSolverIterations = 8;

  world.createCollider(
    rapier.ColliderDesc.cuboid(TABLE_HALF_X, TABLE_THICKNESS, TABLE_HALF_Z)
      .setTranslation(0, -TABLE_THICKNESS, 0)
      .setFriction(TABLE_FRICTION_BASE)
      .setRestitution(TABLE_RESTITUTION)
  );

  // 隐形浅围栏：四面墙，防止剧烈摇动把铜钱摇飞。
  const walls: Array<{ x: number; z: number; hx: number; hz: number }> = [
    { x: RATTLE_FENCE_X + RATTLE_WALL_THICKNESS, z: 0, hx: RATTLE_WALL_THICKNESS, hz: RATTLE_FENCE_Z + RATTLE_WALL_THICKNESS * 2 },
    { x: -RATTLE_FENCE_X - RATTLE_WALL_THICKNESS, z: 0, hx: RATTLE_WALL_THICKNESS, hz: RATTLE_FENCE_Z + RATTLE_WALL_THICKNESS * 2 },
    { x: 0, z: RATTLE_FENCE_Z + RATTLE_WALL_THICKNESS, hx: RATTLE_FENCE_X, hz: RATTLE_WALL_THICKNESS },
    { x: 0, z: -RATTLE_FENCE_Z - RATTLE_WALL_THICKNESS, hx: RATTLE_FENCE_X, hz: RATTLE_WALL_THICKNESS }
  ];
  walls.forEach((wall) => {
    world.createCollider(
      rapier.ColliderDesc.cuboid(wall.hx, RATTLE_WALL_HALF_HEIGHT, wall.hz)
        .setTranslation(wall.x, RATTLE_WALL_HALF_HEIGHT, wall.z)
        .setFriction(0.3)
        .setRestitution(0.35)
    );
  });

  // 起始姿态与 idleCoinPose 一致（半径 0.92，z 压扁 0.72），保证视觉连续。
  const bodies = [0, 1, 2].map((index) => {
    const angle = (index / 3) * Math.PI * 2 - Math.PI / 2;
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(
          Math.cos(angle) * 0.92,
          TABLETOP_COIN_THICKNESS / 2 + 0.002,
          Math.sin(angle) * 0.92 * 0.72
        )
        .setRotation({ x: 0, y: 0, z: 0, w: 1 })
        .setLinearDamping(AIRBORNE_DAMPING)
        .setAngularDamping(AIRBORNE_DAMPING)
        .setCcdEnabled(true)
    );

    world.createCollider(
      rapier.ColliderDesc.cylinder(COLLIDER_HALF_HEIGHT, COLLIDER_RADIUS)
        .setFriction(COIN_FRICTION_BASE)
        .setRestitution(COIN_RESTITUTION_BASE)
        .setDensity(8.5),
      body
    );

    return body;
  });

  let elapsed = 0;
  let accumulator = 0;

  const snapshot = (): CoinTossSimulationSnapshot => ({
    coins: bodies.map((body) => ({
      position: vec3FromRapier(body.translation()),
      rotation: quaternionFromRapier(body.rotation()),
      linearVelocity: vec3FromRapier(body.linvel()),
      angularVelocity: vec3FromRapier(body.angvel())
    })) as CoinTossSimulationSnapshot['coins'],
    elapsedSeconds: elapsed,
    settledToss: null
  });

  const applyAgitation = (agitation: RattleAgitation): void => {
    const energy = Math.min(1, Math.max(0, agitation.energy));
    if (energy <= 0.001) {
      return;
    }

    const magnitude = Math.hypot(agitation.x, agitation.z);
    // 方向近零（键盘/摇晃自动扰动）时用随时间慢转的方向，三枚错相。
    const fallbackAngle = elapsed * 2.3 + seed * 0.017;
    const dirX = magnitude > 0.05 ? agitation.x / magnitude : Math.cos(fallbackAngle);
    const dirZ = magnitude > 0.05 ? agitation.z / magnitude : Math.sin(fallbackAngle);

    bodies.forEach((body, index) => {
      // 方向由用户摇动输入自然反转；per-coin jitter 避免三枚完全同步。
      const jitter = 0.7 + random() * 0.6;
      body.applyImpulse(
        {
          x: dirX * RATTLE_HORIZONTAL_IMPULSE * energy * jitter,
          y: 0,
          z: dirZ * RATTLE_HORIZONTAL_IMPULSE * energy * jitter
        },
        true
      );

      // 贴地时按概率给跳起冲量（持续小冲量会被重力抵消，且防止空中能量堆积）。
      const bottomY =
        body.translation().y - colliderVerticalExtent(quaternionFromRapier(body.rotation()));
      if (bottomY < 0.05 && random() < energy * RATTLE_HOP_CHANCE) {
        body.applyImpulse(
          {
            x: (random() - 0.5) * 0.06,
            y: RATTLE_VERTICAL_IMPULSE * energy * (0.6 + random() * 0.8),
            z: (random() - 0.5) * 0.06
          },
          true
        );
        // 跳起时给一点翻滚力矩，视觉上更像真钱在钱筒里颠。
        body.applyTorqueImpulse(
          {
            x: (random() - 0.5) * 0.02 * energy,
            y: (random() - 0.5) * 0.01 * energy,
            z: (random() - 0.5) * 0.02 * energy
          },
          true
        );
      }
    });
  };

  function updateRattleDamping(bodies: readonly RAPIER.RigidBody[]): void {
  bodies.forEach((body) => {
    const bottomY =
      body.translation().y - colliderVerticalExtent(quaternionFromRapier(body.rotation()));
    const onTable = bottomY <= TABLE_CONTACT_BOTTOM_CLEARANCE;
    body.setLinearDamping(onTable ? RATTLE_LINEAR_DAMPING : AIRBORNE_DAMPING);
    body.setAngularDamping(onTable ? RATTLE_ANGULAR_DAMPING : AIRBORNE_DAMPING);
  });
}

/** 物理兜底：围栏失效时也绝不穿桌/飞出。 */
  const clampCoins = (): void => {
    bodies.forEach((body) => {
      const translation = body.translation();
      const clampedX = Math.max(-RATTLE_FENCE_X, Math.min(RATTLE_FENCE_X, translation.x));
      const clampedZ = Math.max(-RATTLE_FENCE_Z, Math.min(RATTLE_FENCE_Z, translation.z));
      const clampedY = Math.min(RATTLE_MAX_COIN_HEIGHT, translation.y);

      if (clampedX !== translation.x || clampedZ !== translation.z || clampedY !== translation.y) {
        body.setTranslation({ x: clampedX, y: clampedY, z: clampedZ }, true);
        const velocity = body.linvel();
        body.setLinvel(
          {
            x: clampedX !== translation.x ? 0 : velocity.x,
            y: clampedY !== translation.y ? Math.min(0, velocity.y) : velocity.y,
            z: clampedZ !== translation.z ? 0 : velocity.z
          },
          true
        );
      }
    });
  };

  return {
    step: (deltaSeconds: number, agitation: RattleAgitation) => {
      accumulator += Math.min(deltaSeconds, MAX_STEP_DELTA_SECONDS);

      while (accumulator >= SETTLEMENT_TIMESTEP) {
        updateRattleDamping(bodies);
        applyAgitation(agitation);
        world.timestep = SETTLEMENT_TIMESTEP;
        world.step();
        keepCoinsAboveTable(bodies);
        clampCoins();
        elapsed += SETTLEMENT_TIMESTEP;
        accumulator -= SETTLEMENT_TIMESTEP;
      }

      return snapshot();
    },
    snapshot,
    dispose: () => {
      world.free();
    }
  };
}
