// Coin views: Three.js meshes whose poses are synced from physics body
// snapshots. Render never writes results back — it only follows physics.

import * as THREE from 'three';
import {
  COIN_FACE_OFFSET,
  TABLETOP_COIN_THICKNESS,
  createCoinBodyGeometry,
  createCoinFaceGeometry
} from '../physics/coinGeometry';
import type { QuaternionTuple, Vec3Tuple } from '../physics/physicalTossInput';
import {
  createCoinCapMaterial,
  createCoinEdgeMaterial,
  createCoinFaceMaterial,
  disposePbrMaterial
} from './materials';

export interface CoinView {
  group: THREE.Group;
  setPose: (position: Vec3Tuple, rotation: QuaternionTuple) => void;
  dispose: () => void;
}

const FACE_LIFT = TABLETOP_COIN_THICKNESS / 2 + COIN_FACE_OFFSET + 0.0012;

/**
 * Build one coin. Geometry is rotated so the coin's face normal aligns
 * with the physics body's local +Y axis: identity rotation means heads
 * up, matching the faceReader convention exactly.
 */
function createCoinGroup(): { group: THREE.Group; dispose: () => void } {
  const bodyGeometry = createCoinBodyGeometry();
  bodyGeometry.rotateX(-Math.PI / 2);

  const capMaterial = createCoinCapMaterial();
  const edgeMaterial = createCoinEdgeMaterial();
  const headsMaterial = createCoinFaceMaterial('heads');
  const tailsMaterial = createCoinFaceMaterial('tails');

  const body = new THREE.Mesh(bodyGeometry, [capMaterial, edgeMaterial]);
  body.castShadow = true;
  body.receiveShadow = true;

  const headsGeometry = createCoinFaceGeometry();
  headsGeometry.rotateX(-Math.PI / 2);
  const headsFace = new THREE.Mesh(headsGeometry, headsMaterial);
  headsFace.position.y = FACE_LIFT;

  const tailsGeometry = createCoinFaceGeometry();
  tailsGeometry.rotateX(Math.PI / 2);
  const tailsFace = new THREE.Mesh(tailsGeometry, tailsMaterial);
  tailsFace.position.y = -FACE_LIFT;

  const group = new THREE.Group();
  group.add(body, headsFace, tailsFace);

  return {
    group,
    dispose: () => {
      bodyGeometry.dispose();
      headsGeometry.dispose();
      tailsGeometry.dispose();
      [capMaterial, edgeMaterial, headsMaterial, tailsMaterial].forEach(disposePbrMaterial);
    }
  };
}

export function createCoinViews(scene: THREE.Scene, count = 3): CoinView[] {
  return Array.from({ length: count }, () => {
    const { group, dispose } = createCoinGroup();
    scene.add(group);

    return {
      group,
      setPose: (position, rotation) => {
        group.position.set(position[0], position[1], position[2]);
        group.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
      },
      dispose: () => {
        scene.remove(group);
        dispose();
      }
    };
  });
}

/** Resting pose for the coins while no toss is in flight. */
export function idleCoinPose(
  index: number,
  elapsedSeconds: number,
  motionScale = 1
): {
  position: Vec3Tuple;
  rotation: QuaternionTuple;
} {
  const angle = (index / 3) * Math.PI * 2 - Math.PI / 2;
  const radius = 0.92;
  const wobble = Math.sin(elapsedSeconds * 0.6 + index * 2.1) * 0.012 * motionScale;

  return {
    position: [Math.cos(angle) * radius, TABLETOP_COIN_THICKNESS / 2 + 0.002, Math.sin(angle) * radius * 0.72],
    rotation: [0, Math.sin(wobble) * 0.02, 0, Math.cos(wobble) * 1]
  };
}

/**
 * Shaking pose while charging: coins tremble around their idle spots with
 * an amplitude driven by chamber energy. Purely visual; the toss itself
 * starts from mapper-produced physical states on release.
 */
export function chargingCoinPose(
  index: number,
  elapsedSeconds: number,
  energy: number,
  motionScale = 1
): { position: Vec3Tuple; rotation: QuaternionTuple } {
  const idle = idleCoinPose(index, elapsedSeconds, motionScale);
  const amplitude = (0.05 + energy * 0.16) * motionScale;
  const phase = elapsedSeconds * (14 + energy * 18) + index * 2.4;

  const x = idle.position[0] + Math.sin(phase) * amplitude;
  const y = idle.position[1] + Math.abs(Math.sin(phase * 1.31)) * amplitude * 0.8;
  const z = idle.position[2] + Math.cos(phase * 0.87) * amplitude * 0.6;
  const tilt = Math.sin(phase * 1.13) * (0.12 + energy * 0.4) * motionScale;

  return {
    position: [x, y, z],
    rotation: [Math.sin(tilt) * 0.35, 0, Math.cos(phase * 0.5) * 0.2, Math.cos(tilt)]
  };
}
