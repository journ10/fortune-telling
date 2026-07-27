import * as THREE from 'three';

import { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS } from './coinDimensions';

export { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS };

const COIN_FACE_TEXTURE_OFFSET = 0.0015;
/** 浮雕最大高度：字口位移峰值，连同面片抬升不得超过物理碰撞皮肤 0.012。 */
const COIN_RELIEF_MAX_HEIGHT = 0.0095;
const COIN_SURFACE_EXTENSION = COIN_FACE_TEXTURE_OFFSET + COIN_RELIEF_MAX_HEIGHT;
const TABLETOP_CONTACT_CLEARANCE = 0.006;

const SQUARE_HOLE_SIZE = 0.095;
const BEVEL_SIZE = 0.0012;
const BEVEL_THICKNESS = 0.0012;
const BEVEL_SEGMENTS = 3;

export const COIN_FACE_OFFSET = COIN_FACE_TEXTURE_OFFSET;
export const COIN_RELIEF_Z = TABLETOP_COIN_THICKNESS / 2 + COIN_FACE_TEXTURE_OFFSET + COIN_RELIEF_MAX_HEIGHT / 2;
export const COIN_SURFACE_EXT = COIN_SURFACE_EXTENSION;
export const CONTACT_CLEARANCE = TABLETOP_CONTACT_CLEARANCE;

export function createCoinShape(): THREE.Shape {
  const shape = new THREE.Shape();

  // 真钱不圆：低频固定的半径扰动（±0.6%），形成手工铸币的微不规则轮廓。
  // 扰动是确定性的，三枚铜钱共用同一轮廓，物理碰撞体不受影响。
  const wobbleRadius = (theta: number): number =>
    TABLETOP_COIN_RADIUS *
    (1 +
      0.0035 * Math.sin(theta * 3 + 1.7) +
      0.0025 * Math.sin(theta * 7 + 0.4) +
      0.0018 * Math.sin(theta * 13 + 2.9));

  const segments = 96;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const radius = wobbleRadius(theta);
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  shape.holes.push(roundedSquarePath(SQUARE_HOLE_SIZE));

  return shape;
}

/** 方孔圆角路径。 */
function roundedSquarePath(halfSize: number): THREE.Path {
  const s = halfSize;
  const r = s * 0.08;
  const path = new THREE.Path();
  path.moveTo(-s, -s + r);
  path.lineTo(-s, s - r);
  path.quadraticCurveTo(-s, s, -s + r, s);
  path.lineTo(s - r, s);
  path.quadraticCurveTo(s, s, s, s - r);
  path.lineTo(s, -s + r);
  path.quadraticCurveTo(s, -s, s - r, -s);
  path.lineTo(-s + r, -s);
  path.quadraticCurveTo(-s, -s, -s, -s + r);
  return path;
}

/**
 * 面片 UV 采样半径收缩系数：coin albedo 贴图的钱体图案只占内切圆半径的
 * ~95%（heads 实测 0.951），超出部分是白色背景；收缩到 0.94 避免边缘白环。
 */
const COIN_FACE_UV_SCALE = 0.94;

/**
 * 挤出体 UV 生成器：顶/底盖归一化到 [0,1]（与 createCoinFaceGeometry 一致），
 * 否则 ClampToEdge 下盖面会采样到贴图白边，整面发白。
 * 侧面保持 three 默认 WorldUVGenerator 行为（程序化边缘贴图依赖该映射）。
 */
const coinBodyUVGenerator = {
  generateTopUV(
    _geometry: THREE.ExtrudeGeometry,
    vertices: number[],
    indexA: number,
    indexB: number,
    indexC: number
  ): THREE.Vector2[] {
    // u 随 +x 递增：从上方看贴图左右不镜像（M5 bugfix，原为 0.5 - x*scale）。
    const toUV = (index: number): THREE.Vector2 =>
      new THREE.Vector2(
        0.5 + (vertices[index * 3] / (TABLETOP_COIN_RADIUS * 2)) * COIN_FACE_UV_SCALE,
        (vertices[index * 3 + 1] / (TABLETOP_COIN_RADIUS * 2)) * COIN_FACE_UV_SCALE + 0.5
      );
    return [toUV(indexA), toUV(indexB), toUV(indexC)];
  },
  generateSideWallUV(
    _geometry: THREE.ExtrudeGeometry,
    vertices: number[],
    indexA: number,
    indexB: number,
    indexC: number,
    indexD: number
  ): THREE.Vector2[] {
    const aX = vertices[indexA * 3];
    const aY = vertices[indexA * 3 + 1];
    const aZ = vertices[indexA * 3 + 2];
    const bX = vertices[indexB * 3];
    const bY = vertices[indexB * 3 + 1];
    const bZ = vertices[indexB * 3 + 2];
    const cX = vertices[indexC * 3];
    const cY = vertices[indexC * 3 + 1];
    const cZ = vertices[indexC * 3 + 2];
    const dX = vertices[indexD * 3];
    const dY = vertices[indexD * 3 + 1];
    const dZ = vertices[indexD * 3 + 2];

    if (Math.abs(aY - bY) < Math.abs(aX - bX)) {
      return [
        new THREE.Vector2(aX, 1 - aZ),
        new THREE.Vector2(bX, 1 - bZ),
        new THREE.Vector2(cX, 1 - cZ),
        new THREE.Vector2(dX, 1 - dZ)
      ];
    }
    return [
      new THREE.Vector2(aY, 1 - aZ),
      new THREE.Vector2(bY, 1 - bZ),
      new THREE.Vector2(cY, 1 - cZ),
      new THREE.Vector2(dY, 1 - dZ)
    ];
  }
};

export function createCoinBodyGeometry(): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(createCoinShape(), {
    depth: TABLETOP_COIN_THICKNESS,
    bevelEnabled: true,
    bevelSegments: BEVEL_SEGMENTS,
    bevelSize: BEVEL_SIZE,
    bevelThickness: BEVEL_THICKNESS,
    curveSegments: 96,
    UVGenerator: coinBodyUVGenerator
  });
  geometry.center();
  return geometry;
}

/**
 * 位移浮雕面片：细分平面 + 高度图位移，字口获得真实几何起伏。
 * UV 与旧平面面板同一约定（收缩 0.94 避开贴图白边）；
 * 钱体圆与方孔由材质 alphaMap + alphaTest 裁切，不再依赖几何挖洞。
 */
export function createCoinReliefPlateGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(
    TABLETOP_COIN_RADIUS * 2,
    TABLETOP_COIN_RADIUS * 2,
    160,
    160
  );
  const positions = geometry.getAttribute('position');
  const uvs: number[] = [];

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    uvs.push(
      0.5 + (x / (TABLETOP_COIN_RADIUS * 2)) * COIN_FACE_UV_SCALE,
      (y / (TABLETOP_COIN_RADIUS * 2)) * COIN_FACE_UV_SCALE + 0.5
    );
  }

  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * 外郭：钱缘凸起环带。Lathe 剖面从钱面爬升到冠顶再落回钱缘，
 * 参照乾隆通宝实物——郭带宽约为半径的 20%，冠顶微弧。
 * 剖面 y 即高度，绕 +Y 轴旋转成形；背面用法线翻转后使用。
 */
export function createOuterRimGeometry(): THREE.LatheGeometry {
  const r = TABLETOP_COIN_RADIUS;
  const profile = [
    new THREE.Vector2(r * 0.776, 0.0),
    new THREE.Vector2(r * 0.8, 0.0045),
    new THREE.Vector2(r * 0.856, 0.0078),
    new THREE.Vector2(r * 0.912, 0.0085),
    new THREE.Vector2(r * 0.956, 0.0062),
    new THREE.Vector2(r * 0.988, 0.0022),
    new THREE.Vector2(r, 0.0)
  ];
  const geometry = new THREE.LatheGeometry(profile, 128);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 内郭：方孔周围的凸起方框。外框半宽 0.128、内孔与钱体方孔一致，
 * 挤出 + 小倒角获得圆润的郭缘。沿 +Z 挤出，调用方按面翻转。
 */
export function createInnerRimGeometry(): THREE.ExtrudeGeometry {
  const outerHalf = 0.128;
  const shape = new THREE.Shape();
  const s = outerHalf;
  const r = 0.012;
  shape.moveTo(-s, -s + r);
  shape.lineTo(-s, s - r);
  shape.quadraticCurveTo(-s, s, -s + r, s);
  shape.lineTo(s - r, s);
  shape.quadraticCurveTo(s, s, s, s - r);
  shape.lineTo(s, -s + r);
  shape.quadraticCurveTo(s, -s, s - r, -s);
  shape.lineTo(-s + r, -s);
  shape.quadraticCurveTo(-s, -s, -s, -s + r);
  shape.holes.push(roundedSquarePath(SQUARE_HOLE_SIZE));

  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.006,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.0012,
    bevelThickness: 0.0012,
    curveSegments: 8
  });
}

export function computeCoinTableContactY(rotation: THREE.Euler, tableY = 0): number {
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(rotation);
  const normalY = Math.min(Math.max(normal.y, -1), 1);
  const radialVerticalExtent =
    TABLETOP_COIN_RADIUS * Math.sqrt(Math.max(0, 1 - normalY * normalY));
  const surfaceVerticalExtent =
    (TABLETOP_COIN_THICKNESS / 2 + COIN_SURFACE_EXTENSION) * Math.abs(normalY);

  return tableY + radialVerticalExtent + surfaceVerticalExtent + TABLETOP_CONTACT_CLEARANCE;
}
