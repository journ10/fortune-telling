import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import * as THREE from 'three';
import coinTextureUrl from '../assets/qing-cash-coin-texture.png';
import type { CoinFace } from '../domain/types';
import {
  createCoinPhysicsSimulation,
  initCoinPhysics,
  type CoinPhysicsSimulation,
  type CoinPhysicsSnapshot
} from '../physics/coinPhysics';
import {
  TABLETOP_COIN_RADIUS,
  TABLETOP_COIN_THICKNESS
} from '../physics/coinGeometry';

interface TabletopSceneProps {
  currentThrow: number;
  pendingTossId: number | null;
  resultAvailable: boolean;
  onOpenResult: () => void;
  onTossRequest: () => void;
  onTossSettled: (faces: [CoinFace, CoinFace, CoinFace]) => void;
}

const FALLBACK_FACES: CoinFace[] = ['heads', 'tails', 'heads'];
const SETTLE_DELAY_MS = 1700;
const SETTLED_HOLD_MS = 520;
const SETTLE_CALLBACK_DELAY_MS = SETTLE_DELAY_MS + SETTLED_HOLD_MS;
const SCENE_WIDTH = 720;
const SCENE_HEIGHT = 480;
export { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS };
const COIN_RADIUS = TABLETOP_COIN_RADIUS;
const COIN_THICKNESS = TABLETOP_COIN_THICKNESS;
const COIN_FACE_TEXTURE_OFFSET = 0.004;
const COIN_RELIEF_DEPTH = 0.0025;
const COIN_RELIEF_GAP = 0.0008;
const COIN_SURFACE_EXTENSION = COIN_FACE_TEXTURE_OFFSET + COIN_RELIEF_GAP + COIN_RELIEF_DEPTH;
const TABLETOP_CONTACT_CLEARANCE = 0.006;
const FACE_TEXTURE_SIZE = 512;
export const MIN_COIN_LANDING_DISTANCE = TABLETOP_COIN_RADIUS * 2.08;
export const COIN_TEXTURE_ASSET = coinTextureUrl;
const COIN_LANDING_SEPARATION_MARGIN = 0.012;

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
    hoverX: side * 1.08 + (random() - 0.5) * 0.08,
    hoverY: 1.06 + index * 0.07 + random() * 0.07,
    hoverZ: -0.28 + side * 0.08 + (random() - 0.5) * 0.14,
    landingX: side * 0.78 + (random() - 0.5) * 0.34,
    landingZ: (random() - 0.5) * 0.96,
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

export function createCoinAnimationPlans(
  currentThrow: number,
  faces: readonly CoinFace[]
): CoinAnimationPlan[] {
  const plans = faces.map((face, index) =>
    createCoinAnimationPlan(currentThrow, faces, index, face)
  );

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let changed = false;

    for (let index = 0; index < plans.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < plans.length; otherIndex += 1) {
        const plan = plans[index];
        const otherPlan = plans[otherIndex];
        const planRestX = plan.landingX + plan.slideX;
        const planRestZ = plan.landingZ + plan.slideZ;
        const otherRestX = otherPlan.landingX + otherPlan.slideX;
        const otherRestZ = otherPlan.landingZ + otherPlan.slideZ;
        let deltaX = otherRestX - planRestX;
        let deltaZ = otherRestZ - planRestZ;
        let distance = Math.hypot(deltaX, deltaZ);

        const targetDistance = MIN_COIN_LANDING_DISTANCE + COIN_LANDING_SEPARATION_MARGIN;

        if (distance >= targetDistance) {
          continue;
        }

        if (distance < 0.001) {
          const angle = (index + otherIndex + currentThrow) * 1.91;
          deltaX = Math.cos(angle);
          deltaZ = Math.sin(angle);
          distance = 1;
        }

        const normalX = deltaX / distance;
        const normalZ = deltaZ / distance;
        const separation = (targetDistance - distance) / 2;

        plan.landingX -= normalX * separation;
        plan.landingZ -= normalZ * separation;
        otherPlan.landingX += normalX * separation;
        otherPlan.landingZ += normalZ * separation;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return plans;
}

export function computeCoinTableContactY(rotation: THREE.Euler, tableY = 0): number {
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(rotation);
  const normalY = clamp(normal.y, -1, 1);
  const radialVerticalExtent =
    TABLETOP_COIN_RADIUS * Math.sqrt(Math.max(0, 1 - normalY * normalY));
  const surfaceVerticalExtent =
    (TABLETOP_COIN_THICKNESS / 2 + COIN_SURFACE_EXTENSION) * Math.abs(normalY);

  return tableY + radialVerticalExtent + surfaceVerticalExtent + TABLETOP_CONTACT_CLEARANCE;
}

function createPendingTossKey(currentThrow: number, pendingTossId: number | null): string | null {
  if (pendingTossId === null) {
    return null;
  }

  return `${currentThrow}:${pendingTossId}`;
}

function createFallbackTossFaces(
  currentThrow: number,
  pendingTossId: number
): [CoinFace, CoinFace, CoinFace] {
  const random = createSeededRandom(
    Math.imul(currentThrow + 13, 1597334677) ^ Math.imul(pendingTossId + 41, 3812015801)
  );

  return [0, 1, 2].map(() => (random() > 0.5 ? 'heads' : 'tails')) as [
    CoinFace,
    CoinFace,
    CoinFace
  ];
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

function createLoadedTexture(image: TexImageSource): THREE.Texture {
  const texture = new THREE.Texture(image);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return texture;
}

async function loadCoinTextureFromAsset(): Promise<THREE.Texture> {
  const response = await fetch(COIN_TEXTURE_ASSET);

  if (!response.ok) {
    throw new Error(`Unable to load coin texture: ${response.status}`);
  }

  const blob = await response.blob();

  if (typeof createImageBitmap === 'function') {
    return createLoadedTexture(await createImageBitmap(blob));
  }

  const imageUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();

      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Unable to decode coin texture'));
      element.src = imageUrl;
    });

    return createLoadedTexture(image);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
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

function createCoinEdgeTexture(variant: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  if (!context || typeof context.fillRect !== 'function') {
    return createTextureFromCanvas(canvas);
  }

  const random = createSeededRandom(0x7f4a7c15 + variant * 193);
  const base = context.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, '#160f0a');
  base.addColorStop(0.16, '#7f5634');
  base.addColorStop(0.36, '#2f2016');
  base.addColorStop(0.58, '#a67545');
  base.addColorStop(0.78, '#3b2718');
  base.addColorStop(1, '#120c08');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < canvas.width; x += 1) {
    const oxide = Math.sin(x * 0.07 + variant) * 0.5 + Math.sin(x * 0.019) * 0.5;

    if (oxide > 0.44) {
      context.fillStyle = `rgba(34, 92, 75, ${0.12 + oxide * 0.12})`;
      context.fillRect(x, 0, 1 + random() * 2, canvas.height);
    } else if (oxide < -0.62) {
      context.fillStyle = `rgba(0, 0, 0, ${0.12 + Math.abs(oxide) * 0.08})`;
      context.fillRect(x, 0, 1 + random() * 3, canvas.height);
    }
  }

  for (let y = 0; y < canvas.height; y += 1) {
    const ridge = Math.sin(y * 0.62) * 18 + Math.sin(y * 2.6) * 6;
    const alpha = 0.11 + Math.abs(ridge) / 180;

    context.fillStyle =
      ridge > 0 ? `rgba(224, 165, 91, ${alpha})` : `rgba(0, 0, 0, ${alpha + 0.04})`;
    context.fillRect(0, y, canvas.width, 1);
  }

  for (let mark = 0; mark < 180; mark += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const length = 10 + random() * 70;
    const height = 0.8 + random() * 2.8;

    context.fillStyle =
      random() > 0.24
        ? `rgba(${38 + random() * 86}, ${24 + random() * 52}, ${12 + random() * 28}, ${0.2 + random() * 0.28})`
        : `rgba(${28 + random() * 36}, ${96 + random() * 72}, ${72 + random() * 50}, ${0.24 + random() * 0.34})`;
    context.fillRect(x, y, length, height);
  }

  const texture = createTextureFromCanvas(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(2.25, 1);
  texture.needsUpdate = true;

  return texture;
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
    copper.addColorStop(0, '#c98f46');
    copper.addColorStop(0.46, '#936026');
    copper.addColorStop(0.78, '#573017');
    copper.addColorStop(1, '#26160d');
  } else {
    copper.addColorStop(0, '#8f7545');
    copper.addColorStop(0.42, '#5a5d3e');
    copper.addColorStop(0.72, '#314b3d');
    copper.addColorStop(1, '#17231d');
  }

  context.fillStyle = copper;
  context.beginPath();
  context.arc(center, center, coinRadius, 0, Math.PI * 2);
  context.fill();

  for (let speck = 0; speck < 380; speck += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * coinRadius * 0.95;
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    const size = 0.5 + random() * 2.6;

    context.fillStyle =
      face === 'heads'
        ? `rgba(${90 + random() * 95}, ${54 + random() * 60}, ${25 + random() * 38}, ${0.1 + random() * 0.22})`
        : random() > 0.45
          ? `rgba(${47 + random() * 50}, ${98 + random() * 62}, ${82 + random() * 48}, ${0.1 + random() * 0.2})`
          : `rgba(${30 + random() * 45}, ${24 + random() * 32}, ${16 + random() * 24}, ${0.14 + random() * 0.24})`;

    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = face === 'heads' ? 'rgba(190, 130, 60, 0.66)' : 'rgba(104, 136, 103, 0.46)';
  context.lineWidth = 14;
  context.beginPath();
  context.arc(center, center, coinRadius * 0.86, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = face === 'heads' ? 'rgba(45, 23, 12, 0.62)' : 'rgba(13, 33, 27, 0.66)';
  context.lineWidth = 7;
  context.beginPath();
  context.arc(center, center, coinRadius * 0.78, 0, Math.PI * 2);
  context.stroke();

  const squareSize = FACE_TEXTURE_SIZE * 0.2;
  context.strokeStyle = face === 'heads' ? 'rgba(176, 110, 43, 0.68)' : 'rgba(80, 120, 90, 0.52)';
  context.lineWidth = 15;
  context.strokeRect(center - squareSize / 2, center - squareSize / 2, squareSize, squareSize);
  context.strokeStyle = face === 'heads' ? 'rgba(31, 16, 8, 0.76)' : 'rgba(9, 26, 22, 0.76)';
  context.lineWidth = 7;
  context.strokeRect(center - squareSize / 2, center - squareSize / 2, squareSize, squareSize);

  if (face === 'heads') {
    context.font = '800 68px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(38, 19, 9, 0.72)';
    context.strokeStyle = 'rgba(179, 123, 57, 0.56)';
    context.lineWidth = 8;
    context.shadowColor = 'rgba(255, 208, 126, 0.2)';
    context.shadowBlur = 2;
    context.shadowOffsetX = -1;
    context.shadowOffsetY = -1;

    [
      ['乾', center, center - 132],
      ['隆', center, center + 132],
      ['通', center + 132, center],
      ['宝', center - 132, center]
    ].forEach(([character, x, y]) => {
      context.strokeText(String(character), Number(x), Number(y));
      context.fillText(String(character), Number(x), Number(y));
    });
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
  } else {
    context.strokeStyle = 'rgba(9, 31, 25, 0.72)';
    context.lineWidth = 14;

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

    context.strokeStyle = 'rgba(126, 157, 112, 0.48)';
    context.lineWidth = 5;
    context.beginPath();
    context.arc(center, center, coinRadius * 0.55, -0.9, 0.18);
    context.stroke();
    context.beginPath();
    context.arc(center, center, coinRadius * 0.52, 2.15, 3.32);
    context.stroke();
  }

  for (let scratch = 0; scratch < 62; scratch += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * coinRadius * 0.88;
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    const length = 14 + random() * 54;

    context.save();
    context.translate(x, y);
    context.rotate(random() * Math.PI);
    context.strokeStyle = random() > 0.5 ? 'rgba(214, 166, 94, 0.13)' : 'rgba(0, 0, 0, 0.22)';
    context.lineWidth = 0.8 + random() * 1.2;
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

  const squareHoleSize = 0.135;
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
    bevelSegments: 2,
    bevelSize: 0.006,
    bevelThickness: 0.006,
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

function createCoinSheetFaceTexture(face: CoinFace, sourceTexture: THREE.Texture): THREE.Texture {
  const texture = sourceTexture.clone();

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.offset.set(face === 'heads' ? 0 : 0.5, 0);
  texture.repeat.set(0.5, 1);
  texture.needsUpdate = true;

  return texture;
}

function createReliefMaterial(face: CoinFace, variant: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color:
      face === 'heads'
        ? variant % 2 === 0
          ? 0x7b5737
          : 0x684833
        : variant % 2 === 0
          ? 0x4d5d4c
          : 0x3f5145,
    metalness: face === 'heads' ? 0.24 : 0.16,
    opacity: face === 'heads' ? 0.36 : 0.3,
    roughness: face === 'heads' ? 0.92 : 0.95,
    transparent: true
  });
}

function markReliefMesh<TMesh extends THREE.Mesh>(mesh: TMesh): TMesh {
  mesh.userData.relief = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 4;

  return mesh;
}

function createReliefBar(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  outward: 1 | -1,
  material: THREE.Material
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, COIN_RELIEF_DEPTH), material);

  mesh.position.set(
    x,
    y,
    outward *
      (COIN_THICKNESS / 2 + COIN_FACE_TEXTURE_OFFSET + COIN_RELIEF_GAP + COIN_RELIEF_DEPTH / 2)
  );
  mesh.rotation.z = rotation;

  return markReliefMesh(mesh);
}

function createReliefRing(
  radius: number,
  tubeRadius: number,
  outward: 1 | -1,
  material: THREE.Material
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tubeRadius, 8, 128), material);

  mesh.position.z =
    outward * (COIN_THICKNESS / 2 + COIN_FACE_TEXTURE_OFFSET + COIN_RELIEF_GAP + tubeRadius);

  return markReliefMesh(mesh);
}

function addSquareHoleRelief(
  group: THREE.Group,
  outward: 1 | -1,
  material: THREE.Material
): void {
  const rail = 0.007;
  const length = 0.29;
  const offset = 0.139;

  [
    createReliefBar(0, offset, length, rail, 0, outward, material),
    createReliefBar(0, -offset, length, rail, 0, outward, material),
    createReliefBar(offset, 0, rail, length, 0, outward, material),
    createReliefBar(-offset, 0, rail, length, 0, outward, material)
  ].forEach((mesh) => group.add(mesh));
}

function addTraditionalCoinRelief(group: THREE.Group, variant: number): void {
  const headsMaterial = createReliefMaterial('heads', variant);
  const tailsMaterial = createReliefMaterial('tails', variant);

  group.add(createReliefRing(0.438, 0.0024, 1, headsMaterial));
  group.add(createReliefRing(0.438, 0.0021, -1, tailsMaterial));
  addSquareHoleRelief(group, 1, headsMaterial);
  addSquareHoleRelief(group, -1, tailsMaterial);
}

function createCoinFaceMaterial(
  face: CoinFace,
  variant: number,
  coinTexture?: THREE.Texture
): THREE.MeshStandardMaterial {
  const faceTexture = coinTexture
    ? createCoinSheetFaceTexture(face, coinTexture)
    : createCoinFaceTexture(face, variant);

  return new THREE.MeshStandardMaterial({
    bumpMap: faceTexture,
    bumpScale: face === 'heads' ? 0.008 : 0.006,
    color: 0xffffff,
    depthWrite: false,
    emissive: 0xffffff,
    emissiveIntensity: face === 'heads' ? 0.18 : 0.22,
    emissiveMap: faceTexture,
    map: faceTexture,
    metalness: face === 'heads' ? 0.08 : 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -10,
    polygonOffsetUnits: -10,
    roughness: face === 'heads' ? 0.94 : 0.97,
    side: THREE.FrontSide,
    toneMapped: true
  });
}

export function createCoinGroup(variant: number, coinTexture?: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  const edgeTexture = createCoinEdgeTexture(variant);
  const body = new THREE.Mesh(
    createCoinBodyGeometry(),
    [
      new THREE.MeshStandardMaterial({
        color: variant % 2 === 0 ? 0x513722 : 0x463124,
        metalness: 0.24,
        roughness: 0.91
      }),
      new THREE.MeshStandardMaterial({
        bumpMap: edgeTexture,
        bumpScale: 0.006,
        color: 0xffffff,
        map: edgeTexture,
        metalness: 0.16,
        roughness: 0.96
      })
    ]
  );
  const heads = new THREE.Mesh(
    createCoinFaceGeometry(),
    createCoinFaceMaterial('heads', variant, coinTexture)
  );
  const tails = new THREE.Mesh(
    createCoinFaceGeometry(),
    createCoinFaceMaterial('tails', variant, coinTexture)
  );

  heads.position.z = COIN_THICKNESS / 2 + COIN_FACE_TEXTURE_OFFSET;
  tails.position.z = -COIN_THICKNESS / 2 - COIN_FACE_TEXTURE_OFFSET;
  tails.rotation.y = Math.PI;
  heads.renderOrder = 2;
  tails.renderOrder = 2;

  [body, heads, tails].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  addTraditionalCoinRelief(group, variant);

  return group;
}

export default function TabletopScene({
  currentThrow,
  pendingTossId,
  resultAvailable,
  onOpenResult,
  onTossRequest,
  onTossSettled
}: TabletopSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const coinTargetsRef = useRef<number[]>(FALLBACK_FACES.map(targetRotationForFace));
  const coinPlansRef = useRef<CoinAnimationPlan[]>(
    createCoinAnimationPlans(0, FALLBACK_FACES)
  );
  const currentThrowRef = useRef(currentThrow);
  const tossStartedAtRef = useRef<number | null>(null);
  const physicsSimulationRef = useRef<CoinPhysicsSimulation | null>(null);
  const physicsTossKeyRef = useRef<string | null>(null);
  const settlingHoldTimeoutRef = useRef<number | null>(null);
  const settledTossKeyRef = useRef<string | null>(null);
  const scheduledTossKeyRef = useRef<string | null>(null);
  const onTossSettledRef = useRef(onTossSettled);
  const [isWebGlActive, setIsWebGlActive] = useState(false);
  const throwStatusId = useId();
  const pendingTossKey = createPendingTossKey(currentThrow, pendingTossId);

  useEffect(() => {
    onTossSettledRef.current = onTossSettled;
  }, [onTossSettled]);

  useEffect(() => {
    currentThrowRef.current = currentThrow;
  }, [currentThrow]);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount || !hasWebGLSupport()) {
      return undefined;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let coinGroups: THREE.Group[] = [];
    let coinTexture: THREE.Texture | null = null;
    let tabletopGeometry: THREE.PlaneGeometry | null = null;
    let tabletopMaterial: THREE.MeshStandardMaterial | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeRenderer: (() => void) | null = null;
    let isWindowResizeFallback = false;
    let animationFrame = 0;
    let isEffectActive = true;
    let isPhysicsReady = false;

    const cleanupWebGlResources = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      if (settlingHoldTimeoutRef.current !== null) {
        window.clearTimeout(settlingHoldTimeoutRef.current);
        settlingHoldTimeoutRef.current = null;
      }

      isEffectActive = false;
      resizeObserver?.disconnect();

      if (isWindowResizeFallback && resizeRenderer) {
        window.removeEventListener('resize', resizeRenderer);
      }

      if (renderer?.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }

      coinGroups.forEach(disposeObject3D);
      coinGroups = [];
      coinTexture?.dispose();
      tabletopGeometry?.dispose();

      if (tabletopMaterial) {
        disposeMaterial(tabletopMaterial);
      }

      physicsSimulationRef.current?.dispose();
      physicsSimulationRef.current = null;
      physicsTossKeyRef.current = null;
      renderer?.dispose();
    };

    try {
      initCoinPhysics()
        .then(() => {
          if (isEffectActive) {
            isPhysicsReady = true;
          }
        })
        .catch(() => {
          isPhysicsReady = false;
        });

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x121611);
      const camera = new THREE.PerspectiveCamera(35, SCENE_WIDTH / SCENE_HEIGHT, 0.1, 100);
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true
      });
      const spawnCoins = (loadedCoinTexture?: THREE.Texture) => {
        coinGroups.forEach((coin) => {
          scene.remove(coin);
          disposeObject3D(coin);
        });
        coinGroups = [];

        FALLBACK_FACES.forEach((face, index) => {
          const coin = createCoinGroup(index, loadedCoinTexture);
          const plan = coinPlansRef.current[index];

          coinGroups.push(coin);
          coin.position.set(
            plan?.hoverX ?? (index - 1) * 1.22,
            plan?.hoverY ?? 1.18,
            plan?.hoverZ ?? 0
          );
          coin.rotation.x = targetRotationForFace(face);
          coin.rotation.z = (index - 1) * 0.08;
          scene.add(coin);
        });
      };
      const activeTabletopGeometry = new THREE.PlaneGeometry(13, 9);
      loadCoinTextureFromAsset()
        .then((loadedTexture) => {
          if (!isEffectActive) {
            loadedTexture.dispose();
            return;
          }

          coinTexture = loadedTexture;
          spawnCoins(loadedTexture);
        })
        .catch(() => {
          if (isEffectActive && coinGroups.length === 0) {
            spawnCoins();
          }
        });
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
        const deltaSeconds = clock.getDelta();
        const elapsed = clock.elapsedTime;
        const tossStartedAt = tossStartedAtRef.current;
        const tossProgress =
          tossStartedAt === null ? null : clamp((getTime() - tossStartedAt) / SETTLE_DELAY_MS);
        const activeTossKey = scheduledTossKeyRef.current;
        let physicsSnapshot: CoinPhysicsSnapshot | null = null;

        if (tossProgress !== null && activeTossKey && isPhysicsReady) {
          if (physicsTossKeyRef.current !== activeTossKey) {
            physicsSimulationRef.current?.dispose();
            physicsSimulationRef.current = createCoinPhysicsSimulation(
              currentThrowRef.current,
              Number(activeTossKey.split(':')[1] ?? 0)
            );
            physicsTossKeyRef.current = activeTossKey;
          }

          physicsSnapshot = physicsSimulationRef.current?.step(deltaSeconds) ?? null;

          if (
            physicsSnapshot?.settled &&
            physicsSnapshot.faces &&
            settledTossKeyRef.current !== activeTossKey &&
            settlingHoldTimeoutRef.current === null
          ) {
            const settledFaces = physicsSnapshot.faces;
            settledTossKeyRef.current = activeTossKey;
            coinTargetsRef.current = settledFaces.map(targetRotationForFace);

            settlingHoldTimeoutRef.current = window.setTimeout(() => {
              settlingHoldTimeoutRef.current = null;

              if (scheduledTossKeyRef.current !== activeTossKey) {
                return;
              }

              tossStartedAtRef.current = null;
              scheduledTossKeyRef.current = null;
              physicsSimulationRef.current?.dispose();
              physicsSimulationRef.current = null;
              physicsTossKeyRef.current = null;
              onTossSettledRef.current(settledFaces);
            }, SETTLED_HOLD_MS);
          }
        }

        coinGroups.forEach((coin, index) => {
          const plan = coinPlansRef.current[index];
          const targetRotation = coinTargetsRef.current[index] ?? plan.finalRotationX;

          if (physicsSnapshot?.coins[index]) {
            const simulatedCoin = physicsSnapshot.coins[index];

            coin.position.copy(simulatedCoin.position);
            coin.rotation.setFromQuaternion(simulatedCoin.visualRotation);
          } else if (tossProgress !== null) {
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
            const rotationX =
              plan.finalRotationX + plan.spinX * Math.PI * 2 * rotationDamping + impactWobble;
            const rotationY = plan.spinY * Math.PI * 2 * rotationDamping;
            const rotationZ = plan.finalRotationZ + plan.spinZ * Math.PI * 2 * rotationDamping;
            const currentRotation = new THREE.Euler(rotationX, rotationY, rotationZ);
            const contactY = computeCoinTableContactY(currentRotation);
            const positionX =
              lerp(plan.hoverX, plan.landingX, travelProgress) +
              plan.curveX * pathCurve * (1 - tossProgress * 0.34) +
              plan.slideX * slideProgress;
            const positionY =
              tossProgress < 0.72
                ? lerp(plan.hoverY, contactY + 0.04, easeInCubic(descentProgress))
                : contactY + bounce;
            const positionZ =
              lerp(plan.hoverZ, plan.landingZ, travelProgress) +
              plan.curveZ * pathCurve * (1 - tossProgress * 0.26) +
              plan.slideZ * slideProgress;

            coin.position.set(positionX, Math.max(positionY, contactY), positionZ);
            coin.rotation.copy(currentRotation);
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
    if (!pendingTossKey || pendingTossId === null) {
      tossStartedAtRef.current = null;
      scheduledTossKeyRef.current = null;
      settledTossKeyRef.current = null;
      physicsSimulationRef.current?.dispose();
      physicsSimulationRef.current = null;
      physicsTossKeyRef.current = null;
      if (settlingHoldTimeoutRef.current !== null) {
        window.clearTimeout(settlingHoldTimeoutRef.current);
        settlingHoldTimeoutRef.current = null;
      }
      coinTargetsRef.current = FALLBACK_FACES.map(targetRotationForFace);
      coinPlansRef.current = createCoinAnimationPlans(currentThrow, FALLBACK_FACES);
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
    const fallbackFaces = createFallbackTossFaces(currentThrow, pendingTossId);
    coinTargetsRef.current = fallbackFaces.map(targetRotationForFace);
    coinPlansRef.current = createCoinAnimationPlans(currentThrow, fallbackFaces);

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
      physicsSimulationRef.current?.dispose();
      physicsSimulationRef.current = null;
      physicsTossKeyRef.current = null;
      onTossSettledRef.current(fallbackFaces);
    }, SETTLE_CALLBACK_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);

      if (scheduledTossKeyRef.current === pendingTossKey) {
        scheduledTossKeyRef.current = null;
      }
    };
  }, [currentThrow, pendingTossId, pendingTossKey]);

  const fallbackFaces =
    pendingTossId === null ? FALLBACK_FACES : createFallbackTossFaces(currentThrow, pendingTossId);
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
        disabled={pendingTossId !== null}
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
