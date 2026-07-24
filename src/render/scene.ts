// Tabletop scene: renderer, camera, lights, and the table itself.
// The scene only renders; it never learns about casting results.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createTableMaterial, disposePbrMaterial } from './materials';

export interface TabletopSceneHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  render: () => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

const CAMERA_BASE_POSITION = new THREE.Vector3(0, 3.6, 6.1);
const CAMERA_TARGET = new THREE.Vector3(0, -0.05, 0);

/**
 * Narrow viewports need the camera further back so the toss area
 * (coins spread ±2.4 on x) is never cropped left/right. 390px-wide
 * portrait gets ~1.9x distance; landscape stays at 1x.
 */
export function cameraDistanceScale(aspect: number): number {
  return Math.min(2.1, Math.max(1, 1.35 / Math.max(aspect, 0.3)));
}

export function createTabletopScene(canvas: HTMLCanvasElement): TabletopSceneHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15100b);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  camera.position.copy(CAMERA_BASE_POSITION);
  camera.lookAt(CAMERA_TARGET);

  // Procedural environment for metal reflections (no HDRI asset in M2).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const envMap = pmrem.fromScene(roomEnvironment, 0.04).texture;
  scene.environment = envMap;
  pmrem.dispose();
  roomEnvironment.dispose();

  const ambient = new THREE.AmbientLight(0xfff1de, 0.32);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffeed6, 1.7);
  keyLight.position.set(2.6, 4.8, 3.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 14;
  keyLight.shadow.camera.left = -5;
  keyLight.shadow.camera.right = 5;
  keyLight.shadow.camera.top = 5;
  keyLight.shadow.camera.bottom = -5;
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xcfdcec, 0.5);
  fillLight.position.set(-3.2, 2.4, -2.2);
  scene.add(fillLight);

  const table = new THREE.Mesh(new THREE.BoxGeometry(18, 0.24, 12), createTableMaterial());
  table.position.y = -0.12;
  table.receiveShadow = true;
  scene.add(table);

  const handle: TabletopSceneHandle = {
    scene,
    camera,
    render: () => {
      renderer.render(scene, camera);
    },
    resize: (width, height) => {
      const safeWidth = Math.max(1, width);
      const safeHeight = Math.max(1, height);
      camera.aspect = safeWidth / safeHeight;
      camera.position.copy(CAMERA_BASE_POSITION).multiplyScalar(cameraDistanceScale(camera.aspect));
      camera.lookAt(CAMERA_TARGET);
      camera.updateProjectionMatrix();
      renderer.setSize(safeWidth, safeHeight, false);
    },
    dispose: () => {
      envMap.dispose();
      table.geometry.dispose();
      disposePbrMaterial(table.material as THREE.MeshStandardMaterial);
      renderer.dispose();
    }
  };

  return handle;
}
