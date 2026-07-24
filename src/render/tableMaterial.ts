import * as THREE from 'three';

export interface TablePBRMaps {
  albedo?: THREE.Texture;
  normal?: THREE.Texture;
  roughness?: THREE.Texture;
  ao?: THREE.Texture;
}

const loader = new THREE.TextureLoader();
loader.setPath('/textures/pbr/');

/**
 * 异步加载桌面 PBR 贴图组。
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

export async function loadTablePBRMaps(): Promise<TablePBRMaps> {
  console.log('[PBR] loadTablePBRMaps starting');
  try {
    const [albedo, normal, roughness, ao] = await Promise.all([
      loadTextureAsync(loader, 'table-albedo.png').then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }),
      loadTextureAsync(loader, 'table-normal.png').then((t) => { t.anisotropy = 8; return t; }),
      loadTextureAsync(loader, 'table-roughness.png').then((t) => { t.anisotropy = 8; return t; }),
      loadTextureAsync(loader, 'table-ao.png').then((t) => { t.anisotropy = 8; return t; })
    ]);
    console.log('[PBR] loadTablePBRMaps success');
    return { albedo, normal, roughness, ao };
  } catch (e) {
    console.error('[PBR] loadTablePBRMaps failed:', e);
    throw e;
  }
}

/**
 * 创建桌面 MeshPhysicalMaterial。
 * 暗色木质/漆面，低 roughness 以呈现光泽感。
 */
export function createTableMaterial(
  maps: TablePBRMaps = {}
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: maps.albedo ? 0xffffff : 0x1e1a15,
    metalness: 0.05,
    roughness: maps.roughness ? 1.0 : 0.65,
    roughnessMap: maps.roughness ?? undefined,
    normalMap: maps.normal ?? undefined,
    normalScale: maps.normal ? new THREE.Vector2(0.4, 0.4) : undefined,
    aoMap: maps.ao ?? undefined,
    aoMapIntensity: maps.ao ? 0.6 : 0,
    map: maps.albedo ?? undefined,
    clearcoat: maps.roughness ? 0.35 : 0.08,
    clearcoatRoughness: maps.roughness ? 0.2 : 0.5,
    envMapIntensity: 0.45,
    side: THREE.FrontSide
  });
}

/**
 * 生成桌面占位纹理（深暗木质漆感）。
 */
export function generateTablePlaceholderTexture(size = 1024): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1a1612';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * 0.06;
    ctx.fillStyle = `rgba(255, 240, 210, ${a})`;
    ctx.fillRect(x, y, Math.random() * 2 + 0.5, Math.random() * 0.5 + 0.2);
  }

  for (let i = 0; i < 60; i++) {
    const y = Math.random() * size;
    ctx.strokeStyle = `rgba(255, 245, 220, ${Math.random() * 0.04})`;
    ctx.lineWidth = Math.random() * 1.5 + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 8);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
