import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export interface LightingSetup {
  ambient: THREE.AmbientLight;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  rimLight: THREE.PointLight;
  envMap: THREE.Texture | null;
}

/**
 * 加载 HDRI 环境贴图并创建博物馆级灯光组。
 * 使用暖色调三点布光 + HDRI 反射环境。
 */
export async function createLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  hdriPath?: string
): Promise<LightingSetup> {
  const envMap = hdriPath ? await loadHDRI(renderer, hdriPath) : null;

  if (envMap) {
    scene.environment = envMap;
    scene.background = new THREE.Color(0x1a1510);
  }

  const ambient = new THREE.AmbientLight(0xfff4e6, 0.25);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff0dd, 1.6);
  keyLight.position.set(2.5, 4.5, 3.0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 12;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xddeeff, 0.45);
  fillLight.position.set(-3.0, 2.5, -2.0);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xffaa66, 0.6, 10);
  rimLight.position.set(0, 1.2, -2.5);
  scene.add(rimLight);

  return { ambient, keyLight, fillLight, rimLight, envMap };
}

async function loadHDRI(
  renderer: THREE.WebGLRenderer,
  path: string
): Promise<THREE.Texture | null> {
  const loader = new RGBELoader();
  loader.setPath('/textures/');

  try {
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(path, resolve, undefined, reject);
    });
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    console.warn(`HDRI 加载失败: ${path}`);
    return null;
  }
}

/**
 * 无 HDRI 时的降级灯光方案（纯程序化，适合开发期）。
 * 使用 RoomEnvironment 生成程序化环境贴图，确保金属材质有反射。
 */
export function createFallbackLighting(
  scene: THREE.Scene,
  renderer?: THREE.WebGLRenderer
): LightingSetup {
  let envMap: THREE.Texture | null = null;
  if (renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    envMap = pmremGenerator.fromScene(roomEnv).texture;
    scene.environment = envMap;
    pmremGenerator.dispose();
    roomEnv.dispose();
  }

  const ambient = new THREE.AmbientLight(0xfff4e6, 0.3);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff0dd, 1.8);
  keyLight.position.set(2.5, 4.5, 3.0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 12;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc8d8ec, 0.5);
  fillLight.position.set(-3.0, 2.5, -2.0);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xffaa66, 0.35, 10);
  rimLight.position.set(0, 1.2, -2.5);
  scene.add(rimLight);

  return { ambient, keyLight, fillLight, rimLight, envMap };
}
