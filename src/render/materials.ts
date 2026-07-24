// M5 视觉基线：铜钱与桌面使用 public/textures/pbr 下的真实 PBR 贴图
// （albedo/normal/roughness/metalness/ao，由 scripts/generate-pbr-textures.py
// 生成并压缩到 ≤500KB/张）。仅 coin 边缘保留程序化贴图（无对应资产）。
//
// 贴图通过 TextureLoader 异步填充：材质同步返回，首帧不阻塞；
// THREE.Cache 开启后三枚铜钱共享同一份解码结果。

import * as THREE from 'three';
import type { CoinFace } from '../domain/types';

THREE.Cache.enabled = true;

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/pbr`;

const textureLoader = new THREE.TextureLoader();

function loadPbrTexture(name: string, { srgb = false }: { srgb?: boolean } = {}): THREE.Texture {
  const texture = textureLoader.load(`${TEXTURE_BASE}/${name}`);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  // 几何体只有一套 UV；aoMap 显式指向同一通道。
  texture.channel = 0;
  return texture;
}

/** 桌面各通道共享 repeat/wrap 设置。 */
function repeatTable(texture: THREE.Texture): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1.4);
  return texture;
}

/** 释放材质及其全部 PBR 贴图槽位。 */
export function disposePbrMaterial(material: THREE.MeshStandardMaterial): void {
  material.map?.dispose();
  material.normalMap?.dispose();
  material.roughnessMap?.dispose();
  material.metalnessMap?.dispose();
  material.aoMap?.dispose();
  material.dispose();
}

/**
 * Coin face material: real PBR set per face (heads 有年号字，tails 素背)。
 * metalness/roughness 标量置 1，由贴图通道承载变化。
 */
export function createCoinFaceMaterial(face: CoinFace): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: loadPbrTexture(`coin-${face}-albedo.png`, { srgb: true }),
    normalMap: loadPbrTexture(`coin-${face}-normal.png`),
    roughnessMap: loadPbrTexture(`coin-${face}-roughness.png`),
    metalnessMap: loadPbrTexture(`coin-${face}-metalness.png`),
    aoMap: loadPbrTexture(`coin-${face}-ao.png`),
    metalness: 1,
    roughness: 1,
    envMapIntensity: 0.7
  });
}

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

const COPPER_BASE = '#b0803f';
const COPPER_DARK = '#7d5a28';
const COPPER_LIGHT = '#d9b06a';

/** Milled-edge texture for the coin rim (no PBR asset; procedural). */
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

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 1);
  return texture;
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

/** Wood tabletop: real PBR set; metalness stays a low constant (无资产变化量)。 */
export function createTableMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: repeatTable(loadPbrTexture('table-albedo.png', { srgb: true })),
    normalMap: repeatTable(loadPbrTexture('table-normal.png')),
    roughnessMap: repeatTable(loadPbrTexture('table-roughness.png')),
    aoMap: repeatTable(loadPbrTexture('table-ao.png')),
    metalness: 0.06,
    roughness: 1,
    envMapIntensity: 0.35
  });
}
