import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import * as THREE from 'three';
import type { CoinFace, CoinToss } from '../domain/types';

interface TabletopSceneProps {
  currentThrow: number;
  pendingToss: CoinToss | null;
  resultAvailable: boolean;
  onOpenResult: () => void;
  onTossRequest: () => void;
  onTossSettled: () => void;
}

const FALLBACK_FACES: CoinFace[] = ['heads', 'tails', 'heads'];
const SETTLE_DELAY_MS = 1700;
const SETTLED_HOLD_MS = 520;
const SETTLE_CALLBACK_DELAY_MS = SETTLE_DELAY_MS + SETTLED_HOLD_MS;
const SCENE_WIDTH = 720;
const SCENE_HEIGHT = 480;
const COIN_RADIUS = 0.62;
const COIN_THICKNESS = 0.12;
const COIN_REST_Y = COIN_THICKNESS / 2 + 0.018;
const FACE_TEXTURE_SIZE = 512;

interface CoinAnimationPlan {
  hoverX: number;
  hoverY: number;
  hoverZ: number;
  landingX: number;
  landingZ: number;
  curveX: number;
  curveZ: number;
  slideX: number;
  slideZ: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  bounceHeight: number;
  finalRotationX: number;
  finalRotationZ: number;
  phase: number;
}

const visuallyHiddenStyle: CSSProperties = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px'
};

function hasWebGLSupport(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function getTime(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function targetRotationForFace(face: CoinFace): number {
  return face === 'heads' ? -Math.PI / 2 : Math.PI / 2;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function easeInCubic(progress: number): number {
  return progress * progress * progress;
}

function easeOutCubic(progress: number): number {
  const inverted = 1 - progress;
  return 1 - inverted * inverted * inverted;
}

function smootherStep(progress: number): number {
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function hashCoinPlanSeed(currentThrow: number, faces: readonly CoinFace[], index: number): number {
  let seed = Math.imul(currentThrow + 17, 2654435761) ^ Math.imul(index + 5, 2246822519);

  faces.forEach((face, faceIndex) => {
    const faceValue = face === 'heads' ? 0x9e37 : 0x5f35;
    seed ^= Math.imul(faceValue + faceIndex * 97, 3266489917);
    seed = (seed << 13) | (seed >>> 19);
  });

  return seed >>> 0;
}

function createCoinAnimationPlan(
  currentThrow: number,
  faces: readonly CoinFace[],
  index: number,
  face: CoinFace
): CoinAnimationPlan {
  const random = createSeededRandom(hashCoinPlanSeed(currentThrow, faces, index));
  const side = index - 1;
  const direction = random() > 0.5 ? 1 : -1;

  return {
    hoverX: side * 1.28 + (random() - 0.5) * 0.08,
    hoverY: 1.16 + index * 0.08 + random() * 0.08,
    hoverZ: -0.28 + side * 0.08 + (random() - 0.5) * 0.14,
    landingX: side * 0.9 + (random() - 0.5) * 0.42,
    landingZ: (random() - 0.5) * 1.12,
    curveX: direction * (0.28 + random() * 0.34),
    curveZ: (random() - 0.5) * 0.52,
    slideX: direction * (0.1 + random() * 0.18),
    slideZ: (random() - 0.5) * 0.22,
    spinX: 4.6 + random() * 1.8 + index * 0.35,
    spinY: direction * (1.5 + random() * 1.7),
    spinZ: (random() > 0.5 ? 1 : -1) * (1.2 + random() * 1.5),
    bounceHeight: 0.14 + random() * 0.12,
    finalRotationX: targetRotationForFace(face),
    finalRotationZ: (random() - 0.5) * Math.PI * 0.55,
    phase: random() * Math.PI * 2
  };
}

function createPendingTossKey(currentThrow: number, pendingToss: CoinToss | null): string | null {
  if (!pendingToss) {
    return null;
  }

  return `${currentThrow}:${pendingToss.faces.join('-')}:${pendingToss.score}:${pendingToss.line.name}`;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  const texturedMaterial = material as THREE.Material & {
    alphaMap?: THREE.Texture | null;
    bumpMap?: THREE.Texture | null;
    map?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
  };

  texturedMaterial.map?.dispose();
  texturedMaterial.alphaMap?.dispose();
  texturedMaterial.bumpMap?.dispose();
  texturedMaterial.metalnessMap?.dispose();
  texturedMaterial.normalMap?.dispose();
  texturedMaterial.roughnessMap?.dispose();
  material.dispose();
}

function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;

    if (!mesh.isMesh) {
      return;
    }

    mesh.geometry.dispose();
    disposeMaterial(mesh.material);
  });
}

function createTextureFromCanvas(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  return texture;
}

export function createTabletopTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext('2d');

  if (!context || typeof context.fillRect !== 'function') {
    return createTextureFromCanvas(canvas);
  }

  const baseGradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  baseGradient.addColorStop(0, '#293a2e');
  baseGradient.addColorStop(0.38, '#372818');
  baseGradient.addColorStop(0.68, '#1e2f2a');
  baseGradient.addColorStop(1, '#100d09');
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const random = createSeededRandom(0x61c88647);

  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % canvas.width;
    const y = Math.floor(pixel / canvas.width);
    const centerX = (x / canvas.width - 0.5) * 2;
    const centerY = (y / canvas.height - 0.48) * 2;
    const grain = Math.sin(x * 0.055 + Math.sin(y * 0.018) * 5) * 7;
    const noise = (random() - 0.5) * 11;
    const vignette = clamp(Math.sqrt(centerX * centerX + centerY * centerY) - 0.18, 0, 1) * 32;

    data[index] = clamp(data[index] + grain + noise - vignette, 0, 255);
    data[index + 1] = clamp(data[index + 1] + grain * 0.62 + noise - vignette, 0, 255);
    data[index + 2] = clamp(data[index + 2] + grain * 0.34 + noise - vignette * 0.72, 0, 255);
  }

  context.putImageData(imageData, 0, 0);

  for (let row = 0; row < 18; row += 1) {
    const y = row * 58 + random() * 24;
    const lineGradient = context.createLinearGradient(0, y, canvas.width, y + 18);
    lineGradient.addColorStop(0, 'rgba(255, 218, 150, 0)');
    lineGradient.addColorStop(0.5, 'rgba(255, 218, 150, 0.045)');
    lineGradient.addColorStop(1, 'rgba(0, 0, 0, 0.12)');

    context.strokeStyle = lineGradient;
    context.lineWidth = 1 + random() * 2;
    context.beginPath();
    context.moveTo(0, y);

    for (let x = 0; x <= canvas.width; x += 96) {
      context.lineTo(x, y + Math.sin(x * 0.012 + row) * (5 + random() * 6));
    }

    context.stroke();
  }

  for (let mark = 0; mark < 92; mark += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const length = 16 + random() * 95;
    const angle = (random() - 0.5) * 0.55;

    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.strokeStyle =
      random() > 0.25 ? 'rgba(238, 211, 158, 0.055)' : 'rgba(0, 0, 0, 0.14)';
    context.lineWidth = 0.6 + random() * 1.2;
    context.beginPath();
    context.moveTo(-length / 2, 0);
    context.lineTo(length / 2, (random() - 0.5) * 4);
    context.stroke();
    context.restore();
  }

  const centerLight = context.createRadialGradient(512, 430, 60, 512, 430, 520);
  centerLight.addColorStop(0, 'rgba(228, 165, 93, 0.2)');
  centerLight.addColorStop(0.42, 'rgba(75, 105, 79, 0.1)');
  centerLight.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
  context.fillStyle = centerLight;
  context.fillRect(0, 0, canvas.width, canvas.height);

  return createTextureFromCanvas(canvas);
}

export function createCoinFaceTexture(face: CoinFace, variant: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_TEXTURE_SIZE;
  canvas.height = FACE_TEXTURE_SIZE;
  const context = canvas.getContext('2d');

  if (!context || typeof context.fillRect !== 'function') {
    return createTextureFromCanvas(canvas);
  }

  const random = createSeededRandom(0x9e3779b9 + variant * 137 + (face === 'heads' ? 11 : 73));
  const center = FACE_TEXTURE_SIZE / 2;
  const coinRadius = FACE_TEXTURE_SIZE * 0.45;

  context.clearRect(0, 0, FACE_TEXTURE_SIZE, FACE_TEXTURE_SIZE);

  const copper = context.createRadialGradient(center * 0.72, center * 0.68, 18, center, center, coinRadius);
  if (face === 'heads') {
    copper.addColorStop(0, '#f0bf68');
    copper.addColorStop(0.46, '#b77431');
    copper.addColorStop(0.78, '#72401d');
    copper.addColorStop(1, '#2d1a11');
  } else {
    copper.addColorStop(0, '#a68147');
    copper.addColorStop(0.42, '#686e4a');
    copper.addColorStop(0.72, '#365644');
    copper.addColorStop(1, '#17271f');
  }

  context.fillStyle = copper;
  context.beginPath();
  context.arc(center, center, coinRadius, 0, Math.PI * 2);
  context.fill();

  for (let speck = 0; speck < 260; speck += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * coinRadius * 0.95;
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    const size = 0.7 + random() * 3.1;

    context.fillStyle =
      face === 'heads'
        ? `rgba(${155 + random() * 70}, ${88 + random() * 55}, ${33 + random() * 35}, ${0.08 + random() * 0.18})`
        : random() > 0.45
          ? `rgba(${70 + random() * 55}, ${134 + random() * 70}, ${104 + random() * 62}, ${0.12 + random() * 0.24})`
          : `rgba(${48 + random() * 42}, ${32 + random() * 38}, ${19 + random() * 24}, ${0.12 + random() * 0.22})`;

    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = face === 'heads' ? 'rgba(253, 216, 139, 0.58)' : 'rgba(168, 190, 146, 0.42)';
  context.lineWidth = 18;
  context.beginPath();
  context.arc(center, center, coinRadius * 0.86, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = face === 'heads' ? 'rgba(67, 33, 14, 0.76)' : 'rgba(18, 40, 31, 0.74)';
  context.lineWidth = 9;
  context.beginPath();
  context.arc(center, center, coinRadius * 0.78, 0, Math.PI * 2);
  context.stroke();

  const squareSize = FACE_TEXTURE_SIZE * 0.215;
  context.strokeStyle = face === 'heads' ? 'rgba(255, 225, 153, 0.66)' : 'rgba(128, 166, 119, 0.56)';
  context.lineWidth = 17;
  context.strokeRect(center - squareSize / 2, center - squareSize / 2, squareSize, squareSize);
  context.strokeStyle = face === 'heads' ? 'rgba(72, 34, 13, 0.82)' : 'rgba(15, 34, 28, 0.82)';
  context.lineWidth = 8;
  context.strokeRect(center - squareSize / 2, center - squareSize / 2, squareSize, squareSize);

  if (face === 'heads') {
    context.font = '700 74px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(25, 10, 3, 0.96)';
    context.strokeStyle = 'rgba(255, 230, 154, 0.72)';
    context.lineWidth = 5;

    [
      ['乾', center, center - 132],
      ['隆', center, center + 132],
      ['通', center + 132, center],
      ['宝', center - 132, center]
    ].forEach(([character, x, y]) => {
      context.strokeText(String(character), Number(x), Number(y));
      context.fillText(String(character), Number(x), Number(y));
    });
  } else {
    context.strokeStyle = 'rgba(5, 24, 19, 0.88)';
    context.lineWidth = 17;

    [-64, 64].forEach((offset, column) => {
      context.beginPath();
      context.moveTo(center + offset, center - 118);
      context.bezierCurveTo(
        center + offset + (column === 0 ? -28 : 28),
        center - 72,
        center + offset + (column === 0 ? 24 : -24),
        center + 32,
        center + offset,
        center + 116
      );
      context.stroke();

      context.beginPath();
      context.moveTo(center + offset - 26, center - 38);
      context.lineTo(center + offset + 24, center - 4);
      context.stroke();
    });

    context.strokeStyle = 'rgba(191, 218, 153, 0.62)';
    context.lineWidth = 6;
    context.beginPath();
    context.arc(center, center, coinRadius * 0.55, -0.9, 0.18);
    context.stroke();
    context.beginPath();
    context.arc(center, center, coinRadius * 0.52, 2.15, 3.32);
    context.stroke();
  }

  for (let scratch = 0; scratch < 38; scratch += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * coinRadius * 0.88;
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    const length = 14 + random() * 54;

    context.save();
    context.translate(x, y);
    context.rotate(random() * Math.PI);
    context.strokeStyle = random() > 0.5 ? 'rgba(255, 230, 166, 0.16)' : 'rgba(0, 0, 0, 0.18)';
    context.lineWidth = 1 + random() * 1.5;
    context.beginPath();
    context.moveTo(-length / 2, 0);
    context.lineTo(length / 2, (random() - 0.5) * 5);
    context.stroke();
    context.restore();
  }

  return createTextureFromCanvas(canvas);
}

export function createCoinShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, COIN_RADIUS, 0, Math.PI * 2, false);

  const squareHoleSize = 0.17;
  const squareHole = new THREE.Path();
  squareHole.moveTo(-squareHoleSize, -squareHoleSize);
  squareHole.lineTo(squareHoleSize, -squareHoleSize);
  squareHole.lineTo(squareHoleSize, squareHoleSize);
  squareHole.lineTo(-squareHoleSize, squareHoleSize);
  squareHole.lineTo(-squareHoleSize, -squareHoleSize);
  shape.holes.push(squareHole);

  return shape;
}

function createCoinBodyGeometry(): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(createCoinShape(), {
    depth: COIN_THICKNESS,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.022,
    bevelThickness: 0.022,
    curveSegments: 96
  });
  geometry.center();

  return geometry;
}

function createCoinFaceGeometry(): THREE.ShapeGeometry {
  const geometry = new THREE.ShapeGeometry(createCoinShape(), 96);
  const positions = geometry.getAttribute('position');
  const uvs: number[] = [];

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);

    uvs.push(x / (COIN_RADIUS * 2) + 0.5, y / (COIN_RADIUS * 2) + 0.5);
  }

  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  return geometry;
}

export function createCoinGroup(variant: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    createCoinBodyGeometry(),
    new THREE.MeshStandardMaterial({
      color: variant % 2 === 0 ? 0xa45f28 : 0x8f5424,
      metalness: 0.74,
      roughness: 0.42
    })
  );
  const heads = new THREE.Mesh(
    createCoinFaceGeometry(),
    new THREE.MeshBasicMaterial({
      depthWrite: false,
      map: createCoinFaceTexture('heads', variant),
      polygonOffset: true,
      polygonOffsetFactor: -10,
      polygonOffsetUnits: -10,
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  const tails = new THREE.Mesh(
    createCoinFaceGeometry(),
    new THREE.MeshBasicMaterial({
      depthWrite: false,
      map: createCoinFaceTexture('tails', variant),
      polygonOffset: true,
      polygonOffsetFactor: -10,
      polygonOffsetUnits: -10,
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );

  heads.position.z = COIN_THICKNESS / 2 + 0.02;
  tails.position.z = -COIN_THICKNESS / 2 - 0.02;
  tails.rotation.y = Math.PI;
  heads.renderOrder = 2;
  tails.renderOrder = 2;

  [body, heads, tails].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  return group;
}

export default function TabletopScene({
  currentThrow,
  pendingToss,
  resultAvailable,
  onOpenResult,
  onTossRequest,
  onTossSettled
}: TabletopSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const coinTargetsRef = useRef<number[]>(FALLBACK_FACES.map(targetRotationForFace));
  const coinPlansRef = useRef<CoinAnimationPlan[]>(
    FALLBACK_FACES.map((face, index) => createCoinAnimationPlan(0, FALLBACK_FACES, index, face))
  );
  const tossStartedAtRef = useRef<number | null>(null);
  const settledTossKeyRef = useRef<string | null>(null);
  const scheduledTossKeyRef = useRef<string | null>(null);
  const onTossSettledRef = useRef(onTossSettled);
  const [isWebGlActive, setIsWebGlActive] = useState(false);
  const throwStatusId = useId();
  const pendingTossKey = createPendingTossKey(currentThrow, pendingToss);

  useEffect(() => {
    onTossSettledRef.current = onTossSettled;
  }, [onTossSettled]);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount || !hasWebGLSupport()) {
      return undefined;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let coinGroups: THREE.Group[] = [];
    let tabletopGeometry: THREE.PlaneGeometry | null = null;
    let tabletopMaterial: THREE.MeshStandardMaterial | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeRenderer: (() => void) | null = null;
    let isWindowResizeFallback = false;
    let animationFrame = 0;

    const cleanupWebGlResources = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      resizeObserver?.disconnect();

      if (isWindowResizeFallback && resizeRenderer) {
        window.removeEventListener('resize', resizeRenderer);
      }

      if (renderer?.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }

      coinGroups.forEach(disposeObject3D);
      coinGroups = [];
      tabletopGeometry?.dispose();

      if (tabletopMaterial) {
        disposeMaterial(tabletopMaterial);
      }

      renderer?.dispose();
    };

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x121611);
      const camera = new THREE.PerspectiveCamera(35, SCENE_WIDTH / SCENE_HEIGHT, 0.1, 100);
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true
      });
      const activeTabletopGeometry = new THREE.PlaneGeometry(13, 9);
      tabletopGeometry = activeTabletopGeometry;
      const tabletopTexture = createTabletopTexture();
      tabletopTexture.wrapS = THREE.RepeatWrapping;
      tabletopTexture.wrapT = THREE.RepeatWrapping;
      tabletopTexture.repeat.set(1.18, 1);
      const activeTabletopMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tabletopTexture,
        metalness: 0.04,
        roughness: 0.92
      });
      tabletopMaterial = activeTabletopMaterial;
      const tabletop = new THREE.Mesh(activeTabletopGeometry, activeTabletopMaterial);
      FALLBACK_FACES.forEach((face, index) => {
        const coin = createCoinGroup(index);
        const plan = coinPlansRef.current[index];

        coinGroups.push(coin);
        coin.position.set(plan?.hoverX ?? (index - 1) * 1.22, plan?.hoverY ?? 1.18, plan?.hoverZ ?? 0);
        coin.rotation.x = targetRotationForFace(face);
        coin.rotation.z = (index - 1) * 0.08;
        scene.add(coin);
      });

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.width = '100%';
      mount.appendChild(renderer.domElement);

      tabletop.receiveShadow = true;
      tabletop.rotation.x = -Math.PI / 2;
      tabletop.position.y = 0;
      scene.add(tabletop);

      scene.add(new THREE.AmbientLight(0xfff1dc, 1.28));

      const keyLight = new THREE.DirectionalLight(0xffd3a2, 3);
      keyLight.position.set(-3.2, 5.1, 3.7);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 12;
      keyLight.shadow.camera.left = -5;
      keyLight.shadow.camera.right = 5;
      keyLight.shadow.camera.top = 5;
      keyLight.shadow.camera.bottom = -5;
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0x9eb9c8, 0.7);
      fillLight.position.set(3.3, 2.4, -2.9);
      scene.add(fillLight);

      const rimLight = new THREE.PointLight(0xfff6df, 1.2, 8);
      rimLight.position.set(2.4, 1.55, -2.8);
      scene.add(rimLight);

      camera.position.set(0, 3.35, 5.05);
      camera.lookAt(0, 0.28, 0);

      resizeRenderer = () => {
        const width = mount.clientWidth || SCENE_WIDTH;
        const height = mount.clientHeight || SCENE_HEIGHT;

        renderer?.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      resizeRenderer();

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resizeRenderer);
        resizeObserver.observe(mount);
      } else {
        isWindowResizeFallback = true;
        window.addEventListener('resize', resizeRenderer);
      }

      const clock = new THREE.Clock();
      const renderFrame = () => {
        const elapsed = clock.getElapsedTime();
        const tossStartedAt = tossStartedAtRef.current;
        const tossProgress =
          tossStartedAt === null ? null : clamp((getTime() - tossStartedAt) / SETTLE_DELAY_MS);

        coinGroups.forEach((coin, index) => {
          const plan = coinPlansRef.current[index];
          const targetRotation = coinTargetsRef.current[index] ?? plan.finalRotationX;

          if (tossProgress !== null) {
            const descentProgress = clamp(tossProgress / 0.72);
            const impactProgress = clamp((tossProgress - 0.72) / 0.28);
            const slideProgress = smootherStep(impactProgress);
            const travelProgress = easeOutCubic(tossProgress);
            const pathCurve = Math.sin(tossProgress * Math.PI);
            const bounce =
              tossProgress < 0.72
                ? 0
                : Math.abs(Math.sin(impactProgress * Math.PI * 3.1)) *
                  plan.bounceHeight *
                  (1 - impactProgress) *
                  (1 - impactProgress);
            const rotationDamping = 1 - smootherStep(tossProgress);
            const impactWobble =
              Math.sin(impactProgress * Math.PI * 5) * 0.2 * (1 - impactProgress);

            coin.position.set(
              lerp(plan.hoverX, plan.landingX, travelProgress) +
                plan.curveX * pathCurve * (1 - tossProgress * 0.34) +
                plan.slideX * slideProgress,
              tossProgress < 0.72
                ? lerp(plan.hoverY, COIN_REST_Y + 0.04, easeInCubic(descentProgress))
                : COIN_REST_Y + bounce,
              lerp(plan.hoverZ, plan.landingZ, travelProgress) +
                plan.curveZ * pathCurve * (1 - tossProgress * 0.26) +
                plan.slideZ * slideProgress
            );
            coin.rotation.set(
              plan.finalRotationX + plan.spinX * Math.PI * 2 * rotationDamping + impactWobble,
              plan.spinY * Math.PI * 2 * rotationDamping,
              plan.finalRotationZ + plan.spinZ * Math.PI * 2 * rotationDamping
            );
          } else {
            coin.position.set(
              plan.hoverX + Math.sin(elapsed * 0.62 + plan.phase) * 0.045,
              plan.hoverY + Math.sin(elapsed * 1.1 + plan.phase) * 0.05,
              plan.hoverZ + Math.cos(elapsed * 0.54 + plan.phase) * 0.04
            );
            coin.rotation.set(
              targetRotation + Math.sin(elapsed * 0.7 + plan.phase) * 0.075,
              Math.sin(elapsed * 0.52 + plan.phase) * 0.08,
              plan.finalRotationZ + Math.sin(elapsed * 0.75 + index) * 0.055
            );
          }
        });

        renderer?.render(scene, camera);
        animationFrame = window.requestAnimationFrame(renderFrame);
      };

      renderFrame();
      setIsWebGlActive(true);

      return cleanupWebGlResources;
    } catch {
      cleanupWebGlResources();
      setIsWebGlActive(false);
      return undefined;
    };
  }, []);

  useEffect(() => {
    if (!pendingTossKey || !pendingToss) {
      tossStartedAtRef.current = null;
      scheduledTossKeyRef.current = null;
      settledTossKeyRef.current = null;
      coinTargetsRef.current = FALLBACK_FACES.map(targetRotationForFace);
      coinPlansRef.current = FALLBACK_FACES.map((face, index) =>
        createCoinAnimationPlan(currentThrow, FALLBACK_FACES, index, face)
      );
      return undefined;
    }

    if (
      scheduledTossKeyRef.current === pendingTossKey ||
      settledTossKeyRef.current === pendingTossKey
    ) {
      return undefined;
    }

    scheduledTossKeyRef.current = pendingTossKey;
    tossStartedAtRef.current = getTime();
    coinTargetsRef.current = pendingToss.faces.map(targetRotationForFace);
    coinPlansRef.current = pendingToss.faces.map((face, index) =>
      createCoinAnimationPlan(currentThrow, pendingToss.faces, index, face)
    );

    const timeoutId = window.setTimeout(() => {
      if (
        scheduledTossKeyRef.current !== pendingTossKey ||
        settledTossKeyRef.current === pendingTossKey
      ) {
        return;
      }

      tossStartedAtRef.current = null;
      scheduledTossKeyRef.current = null;
      settledTossKeyRef.current = pendingTossKey;
      onTossSettledRef.current();
    }, SETTLE_CALLBACK_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);

      if (scheduledTossKeyRef.current === pendingTossKey) {
        scheduledTossKeyRef.current = null;
      }
    };
  }, [pendingTossKey]);

  const fallbackFaces = pendingToss?.faces ?? FALLBACK_FACES;
  const buttonLabel = resultAvailable ? '查看结果' : '投掷铜钱';
  const handleInteraction = () => {
    if (resultAvailable) {
      onOpenResult();
      return;
    }

    onTossRequest();
  };

  return (
    <section
      className="tabletopScene"
      data-webgl-active={isWebGlActive ? 'true' : 'false'}
      aria-label="铜钱桌面"
    >
      <div ref={mountRef} className="tabletopCanvas" aria-hidden="true" />
      <div className="fallbackCoins" aria-hidden="true">
        {fallbackFaces.map((face, index) => (
          <span className="fallbackCoin" data-face={face} key={`${face}-${index}`}>
            {face === 'heads' ? (
              <>
                <span className="fallbackCoinGlyph fallbackCoinGlyphTop">乾</span>
                <span className="fallbackCoinGlyph fallbackCoinGlyphBottom">隆</span>
                <span className="fallbackCoinGlyph fallbackCoinGlyphRight">通</span>
                <span className="fallbackCoinGlyph fallbackCoinGlyphLeft">宝</span>
              </>
            ) : (
              <>
                <span className="fallbackCoinMint fallbackCoinMintLeft" />
                <span className="fallbackCoinMint fallbackCoinMintRight" />
              </>
            )}
          </span>
        ))}
      </div>
      <button
        aria-describedby={throwStatusId}
        aria-label={buttonLabel}
        className="coinInteractionSurface"
        disabled={pendingToss !== null}
        onClick={handleInteraction}
        type="button"
      >
        <span className="sr-only" id={throwStatusId} style={visuallyHiddenStyle}>
          第 {currentThrow} 次投掷
        </span>
      </button>
    </section>
  );
}
