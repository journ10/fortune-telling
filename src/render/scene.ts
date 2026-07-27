// Tabletop scene: renderer, camera, lights, and the ritual space itself —
// low lacquer table, woven mat, bamboo coin tube, backdrop wall, dust in
// the light beam. The scene only renders; it never learns about results.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createTableMaterial, disposePbrMaterial } from './materials';
import { createBackdropWall, createCoinTube, createDustMotes, createWovenMat } from './props';

export interface TabletopSceneHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  render: () => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

const CAMERA_BASE_POSITION = new THREE.Vector3(0, 3.3, 6.4);
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
  renderer.toneMappingExposure = 0.88;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0a07);
  // 远景雾深：桌缘与墙面沉进夜色，视觉重心收拢到投掷区
  scene.fog = new THREE.Fog(0x0d0a07, 8, 22);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  camera.position.copy(CAMERA_BASE_POSITION);
  camera.lookAt(CAMERA_TARGET);

  // Procedural environment for metal reflections (no HDRI asset in M2).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const envMap = pmrem.fromScene(roomEnvironment, 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();
  roomEnvironment.dispose();

  // 暖色低调照明：环境光压暗，聚光池收拢视觉，冷补光勾勒钱缘
  const ambient = new THREE.AmbientLight(0xffe2c4, 0.2);
  scene.add(ambient);

  // 聚光池：戏剧化单光源，铜钱是舞台上唯一被照亮的主角。
  // 同时接管阴影（方向光不再投影，省一份 shadow map 开销）。
  // 缓慢微弱的强度呼吸，像一盏真实的灯。
  const SPOT_BASE_INTENSITY = 150;
  const spotLight = new THREE.SpotLight(0xffd9a0, SPOT_BASE_INTENSITY, 24, Math.PI / 5.6, 0.55, 1.8);
  spotLight.position.set(1.5, 6.8, 2.4);
  spotLight.target.position.set(0, 0, 0);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(2048, 2048);
  spotLight.shadow.camera.near = 1;
  spotLight.shadow.camera.far = 16;
  spotLight.shadow.bias = -0.0004;
  scene.add(spotLight, spotLight.target);

  const keyLight = new THREE.DirectionalLight(0xffdfae, 1.1);
  keyLight.position.set(2.6, 4.8, 3.2);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xcfdcec, 0.22);
  fillLight.position.set(-3.2, 2.4, -2.2);
  scene.add(fillLight);

  // 空间：矮桌承载，蒲席定场域，钱筒立于一角，暖墙与雾收纵深
  const table = new THREE.Mesh(new THREE.BoxGeometry(13, 0.24, 9), createTableMaterial());
  table.position.y = -0.12;
  table.receiveShadow = true;

  const mat = createWovenMat();
  const backdrop = createBackdropWall();
  const coinTube = createCoinTube();
  const dust = createDustMotes();

  scene.add(table, mat, backdrop, coinTube, dust.points);

  const clock = new THREE.Clock();

  const handle: TabletopSceneHandle = {
    scene,
    camera,
    render: () => {
      const elapsed = clock.getElapsedTime();
      dust.update(elapsed);
      // 烛光呼吸：双频正弦叠加，±3%，慢到几乎察觉不到
      spotLight.intensity =
        SPOT_BASE_INTENSITY * (1 + 0.03 * Math.sin(elapsed * 6.7) * Math.sin(elapsed * 1.9));
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
      mat.geometry.dispose();
      disposePbrMaterial(table.material as THREE.MeshStandardMaterial);
      (mat.material as THREE.MeshStandardMaterial).map?.dispose();
      (mat.material as THREE.MeshStandardMaterial).bumpMap?.dispose();
      (mat.material as THREE.MeshStandardMaterial).dispose();
      (backdrop.material as THREE.MeshBasicMaterial).map?.dispose();
      backdrop.geometry.dispose();
      (backdrop.material as THREE.MeshBasicMaterial).dispose();
      dust.dispose();
      renderer.dispose();
    }
  };

  return handle;
}
