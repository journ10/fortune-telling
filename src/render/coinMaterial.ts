import * as THREE from 'three';

export interface CoinPBRMaps {
  albedo?: THREE.Texture;
  normal?: THREE.Texture;
  roughness?: THREE.Texture;
  metalness?: THREE.Texture;
  ao?: THREE.Texture;
}

export interface CoinMaterialConfig {
  baseColor: THREE.Color;
  clearcoat: number;
  clearcoatRoughness: number;
  metalness: number;
  roughness: number;
  sheen: number;
  sheenRoughness: number;
  sheenColor: THREE.Color;
  opacity?: number;
  transparent?: boolean;
  side?: THREE.Side;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  toneMapped?: boolean;
  depthWrite?: boolean;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  bumpMap?: THREE.Texture;
  bumpScale?: number;
}

const DEFAULT_COIN_CONFIG: CoinMaterialConfig = {
  baseColor: new THREE.Color(0xb87333),
  clearcoat: 0.15,
  clearcoatRoughness: 0.25,
  metalness: 0.92,
  roughness: 0.35,
  sheen: 0.08,
  sheenRoughness: 0.5,
  sheenColor: new THREE.Color(0xffd4a0)
};

const loader = new THREE.TextureLoader();
loader.setPath('/textures/pbr/');

/**
 * 异步加载铜钱 PBR 贴图组。
 * 使用 load 回调而非 loadAsync（Three.js 0.185 构建版未包含 loadAsync）。
 */
function loadTextureAsync(
  loader: THREE.TextureLoader,
  path: string
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (texture) => {
        console.log(`[PBR] Loaded: ${path}`);
        resolve(texture);
      },
      undefined,
      (error) => {
        console.error(`[PBR] Failed to load ${path}:`, error);
        reject(new Error(`Texture load failed: ${path}`));
      }
    );
  });
}

export async function loadCoinPBRMaps(prefix: 'coin-heads' | 'coin-tails'): Promise<CoinPBRMaps> {
  console.log(`[PBR] loadCoinPBRMaps starting: ${prefix}`);
  try {
    const [albedo, normal, roughness, metalness, ao] = await Promise.all([
      loadTextureAsync(loader, `${prefix}-albedo.png`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }),
      loadTextureAsync(loader, `${prefix}-normal.png`).then((t) => { t.anisotropy = 8; return t; }),
      loadTextureAsync(loader, `${prefix}-roughness.png`).then((t) => { t.anisotropy = 8; return t; }),
      loadTextureAsync(loader, `${prefix}-metalness.png`).then((t) => { t.anisotropy = 8; return t; }),
      loadTextureAsync(loader, `${prefix}-ao.png`).then((t) => { t.anisotropy = 8; return t; })
    ]);
    console.log(`[PBR] loadCoinPBRMaps success: ${prefix}`);
    return { albedo, normal, roughness, metalness, ao };
  } catch (e) {
    console.error(`[PBR] loadCoinPBRMaps failed: ${prefix}`, e);
    throw e;
  }
}

/**
 * 创建铜钱的 MeshPhysicalMaterial。
 * 支持 PBR 贴图叠加载程序化基底之上。
 */
export function createCoinMaterial(
  maps: CoinPBRMaps = {},
  config: Partial<CoinMaterialConfig> = {}
): THREE.MeshPhysicalMaterial {
  const c = { ...DEFAULT_COIN_CONFIG, ...config };

  return new THREE.MeshPhysicalMaterial({
    // 有贴图时用微暖白，避免纯白把铜色压成银灰
    color: maps.albedo ? 0xeeddcc : c.baseColor,
    metalness: c.metalness,
    roughness: c.roughness,
    metalnessMap: maps.metalness ?? undefined,
    roughnessMap: maps.roughness ?? undefined,
    normalMap: maps.normal ?? undefined,
    normalScale: maps.normal ? new THREE.Vector2(0.4, 0.4) : undefined,
    aoMap: maps.ao ?? undefined,
    aoMapIntensity: maps.ao ? 0.6 : 0,
    map: maps.albedo ?? undefined,
    clearcoat: c.clearcoat,
    clearcoatRoughness: c.clearcoatRoughness,
    sheen: c.sheen,
    sheenRoughness: c.sheenRoughness,
    sheenColor: c.sheenColor,
    envMapIntensity: 0.7,
    side: c.side ?? THREE.DoubleSide,
    transparent: c.transparent,
    opacity: c.opacity,
    depthWrite: c.depthWrite,
    polygonOffset: c.polygonOffset,
    polygonOffsetFactor: c.polygonOffsetFactor,
    polygonOffsetUnits: c.polygonOffsetUnits,
    toneMapped: c.toneMapped,
    emissive: c.emissive,
    emissiveIntensity: c.emissiveIntensity,
    bumpMap: c.bumpMap,
    bumpScale: c.bumpScale
  });
}

/**
 * 生成铜钱边缘的环状材质（比正面更粗糙，无纹饰）。
 */
export function createCoinEdgeMaterial(
  maps: CoinPBRMaps = {},
  config: Partial<CoinMaterialConfig> = {}
): THREE.MeshPhysicalMaterial {
  const c = { ...DEFAULT_COIN_CONFIG, ...config };

  return new THREE.MeshPhysicalMaterial({
    // 侧壁/倒角 UV 是世界坐标（ExtrudeGeometry 侧壁生成器），无法正确采样
    // 1024 面片贴图，会 Clamp 到贴图白边；边缘用青铜基色而非 albedo。
    color: c.baseColor,
    metalness: 0.2,
    roughness: 0.8,
    metalnessMap: maps.metalness ?? undefined,
    roughnessMap: maps.roughness ?? undefined,
    normalMap: maps.normal ?? undefined,
    normalScale: maps.normal ? new THREE.Vector2(0.4, 0.4) : undefined,
    aoMap: maps.ao ?? undefined,
    aoMapIntensity: maps.ao ? 0.6 : 0,
    clearcoat: c.clearcoat * 0.5,
    clearcoatRoughness: c.clearcoatRoughness * 1.5,
    sheen: c.sheen,
    sheenRoughness: c.sheenRoughness,
    sheenColor: c.sheenColor,
    envMapIntensity: 0.7,
    side: c.side ?? THREE.DoubleSide,
    transparent: c.transparent,
    opacity: c.opacity,
    depthWrite: c.depthWrite,
    polygonOffset: c.polygonOffset,
    polygonOffsetFactor: c.polygonOffsetFactor,
    polygonOffsetUnits: c.polygonOffsetUnits,
    toneMapped: c.toneMapped
  });
}

/**
 * 生成铜钱正面的文字/纹饰浮雕贴图（Canvas 2D 程序化）。
 * 这是 AI 纹理生成前的占位方案，可输出为 PNG 供 AI 精修。
 */
export function generateCoinFacePlaceholderTexture(
  face: 'heads' | 'tails',
  size = 1024
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.46;

  ctx.fillStyle = '#3a2208';
  ctx.fillRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#b87333';
  ctx.fill();

  const s = size * 0.095;
  const sr = s * 0.08;
  ctx.fillStyle = '#3a2208';
  roundRect(ctx, cx - s, cy - s, s * 2, s * 2, sr);
  ctx.fill();

  ctx.fillStyle = '#2a1805';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (face === 'heads') {
    ctx.font = `bold ${size * 0.15}px serif`;
    ctx.fillText('乾', cx, cy - size * 0.18);
    ctx.fillText('隆', cx, cy + size * 0.18);
    ctx.font = `bold ${size * 0.09}px serif`;
    ctx.fillText('通', cx - size * 0.18, cy);
    ctx.fillText('宝', cx + size * 0.18, cy);
  } else {
    ctx.font = `bold ${size * 0.11}px serif`;
    ctx.fillText('乾隆通宝', cx, cy);
  }

  ctx.strokeStyle = 'rgba(42, 24, 5, 0.4)';
  ctx.lineWidth = size * 0.008;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
