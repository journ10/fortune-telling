// Procedural materials for the M2 tabletop: no PBR assets, everything is
// generated on a canvas at runtime. Visual polish (real PBR coins/table)
// is M5 scope.

import * as THREE from 'three';
import type { CoinFace } from '../domain/types';

const COIN_FACE_TEXTURE_SIZE = 512;

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }

  return [canvas, context];
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const COPPER_BASE = '#b0803f';
const COPPER_DARK = '#7d5a28';
const COPPER_LIGHT = '#d9b06a';

/**
 * Coin face texture: copper disc, raised rim, square hole, and the four
 * reign-mark characters on heads; a plainer reverse on tails.
 */
export function createCoinFaceTexture(face: CoinFace): THREE.CanvasTexture {
  const size = COIN_FACE_TEXTURE_SIZE;
  const [canvas, ctx] = createCanvas(size);
  const center = size / 2;

  const radial = ctx.createRadialGradient(center, center, size * 0.05, center, center, center);
  radial.addColorStop(0, COPPER_LIGHT);
  radial.addColorStop(0.62, COPPER_BASE);
  radial.addColorStop(1, COPPER_DARK);
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, size, size);

  // Subtle patina speckle.
  let speckleSeed = face === 'heads' ? 11 : 29;
  const speckleRandom = () => {
    speckleSeed = (Math.imul(speckleSeed, 1664525) + 1013904223) >>> 0;
    return speckleSeed / 4294967296;
  };
  for (let index = 0; index < 900; index += 1) {
    const angle = speckleRandom() * Math.PI * 2;
    const radius = Math.sqrt(speckleRandom()) * center * 0.96;
    ctx.fillStyle = `rgba(60, 74, 58, ${speckleRandom() * 0.05})`;
    ctx.fillRect(
      center + Math.cos(angle) * radius,
      center + Math.sin(angle) * radius,
      2,
      2
    );
  }

  // Raised rim.
  ctx.strokeStyle = 'rgba(255, 226, 170, 0.55)';
  ctx.lineWidth = size * 0.02;
  ctx.beginPath();
  ctx.arc(center, center, size * 0.465, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(70, 46, 18, 0.6)';
  ctx.lineWidth = size * 0.012;
  ctx.beginPath();
  ctx.arc(center, center, size * 0.445, 0, Math.PI * 2);
  ctx.stroke();

  // Square hole with a raised frame.
  const hole = size * 0.19;
  ctx.fillStyle = '#100c08';
  ctx.fillRect(center - hole / 2, center - hole / 2, hole, hole);
  ctx.strokeStyle = 'rgba(255, 226, 170, 0.5)';
  ctx.lineWidth = size * 0.014;
  ctx.strokeRect(center - hole / 2, center - hole / 2, hole, hole);

  if (face === 'heads') {
    ctx.fillStyle = 'rgba(58, 36, 12, 0.92)';
    ctx.font = `600 ${Math.round(size * 0.155)}px "Kaiti SC", "STKaiti", "KaiTi", "Songti SC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 乾隆通寶：上乾 下隆 右通 左寶
    ctx.fillText('乾', center, center - hole * 1.35);
    ctx.fillText('隆', center, center + hole * 1.35);
    ctx.fillText('通', center + hole * 1.35, center);
    ctx.fillText('寶', center - hole * 1.35, center);
  } else {
    // Tails: two plain mould marks instead of text.
    ctx.strokeStyle = 'rgba(58, 36, 12, 0.55)';
    ctx.lineWidth = size * 0.02;
    ctx.beginPath();
    ctx.arc(center - hole * 1.3, center, size * 0.045, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center + hole * 1.3, center, size * 0.045, 0, Math.PI * 2);
    ctx.stroke();
  }

  return toTexture(canvas);
}

/** Milled-edge texture for the coin rim. */
export function createCoinEdgeTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256);
  ctx.fillStyle = COPPER_BASE;
  ctx.fillRect(0, 0, 256, 256);

  for (let x = 0; x < 256; x += 8) {
    const gradient = ctx.createLinearGradient(x, 0, x + 8, 0);
    gradient.addColorStop(0, COPPER_DARK);
    gradient.addColorStop(0.5, COPPER_LIGHT);
    gradient.addColorStop(1, COPPER_DARK);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, 8, 256);
  }

  const texture = toTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 1);
  return texture;
}

/** Dark lacquered-wood tabletop texture. */
export function createTableTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = createCanvas(size);

  ctx.fillStyle = '#221b14';
  ctx.fillRect(0, 0, size, size);

  let seed = 7;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Wood grain streaks.
  for (let index = 0; index < 90; index += 1) {
    const y = random() * size;
    ctx.strokeStyle = `rgba(190, 150, 100, ${0.02 + random() * 0.05})`;
    ctx.lineWidth = 0.6 + random() * 1.8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 64) {
      ctx.lineTo(x, y + Math.sin(x / 90 + index) * 4 + (random() - 0.5) * 6);
    }
    ctx.stroke();
  }

  // Fine noise.
  for (let index = 0; index < 5000; index += 1) {
    ctx.fillStyle = `rgba(255, 230, 190, ${random() * 0.03})`;
    ctx.fillRect(random() * size, random() * size, 1.5, 1);
  }

  const texture = toTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1.4);
  return texture;
}

export function createCoinFaceMaterial(face: CoinFace): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: createCoinFaceTexture(face),
    metalness: 0.72,
    roughness: 0.38,
    envMapIntensity: 0.7
  });
}

export function createCoinEdgeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: createCoinEdgeTexture(),
    metalness: 0.78,
    roughness: 0.34,
    envMapIntensity: 0.7
  });
}

export function createCoinCapMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xa87c3e,
    metalness: 0.72,
    roughness: 0.42,
    envMapIntensity: 0.6
  });
}

export function createTableMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: createTableTexture(),
    color: 0xffffff,
    metalness: 0.08,
    roughness: 0.62,
    envMapIntensity: 0.35
  });
}
