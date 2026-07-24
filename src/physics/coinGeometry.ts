import * as THREE from 'three';

import { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS } from './coinDimensions';

export { TABLETOP_COIN_RADIUS, TABLETOP_COIN_THICKNESS };

const COIN_FACE_TEXTURE_OFFSET = 0.004;
const COIN_RELIEF_DEPTH = 0.0025;
const COIN_RELIEF_GAP = 0.0008;
const COIN_SURFACE_EXTENSION = COIN_FACE_TEXTURE_OFFSET + COIN_RELIEF_GAP + COIN_RELIEF_DEPTH;
const TABLETOP_CONTACT_CLEARANCE = 0.006;

const SQUARE_HOLE_SIZE = 0.095;
const BEVEL_SIZE = 0.0012;
const BEVEL_THICKNESS = 0.0012;
const BEVEL_SEGMENTS = 3;

export const COIN_FACE_OFFSET = COIN_FACE_TEXTURE_OFFSET;
export const COIN_RELIEF_Z = TABLETOP_COIN_THICKNESS / 2 + COIN_FACE_TEXTURE_OFFSET + COIN_RELIEF_GAP + COIN_RELIEF_DEPTH / 2;
export const COIN_SURFACE_EXT = COIN_SURFACE_EXTENSION;
export const CONTACT_CLEARANCE = TABLETOP_CONTACT_CLEARANCE;

export function createCoinShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, TABLETOP_COIN_RADIUS, 0, Math.PI * 2, false);

  const s = SQUARE_HOLE_SIZE;
  const r = s * 0.08;
  const squareHole = new THREE.Path();
  squareHole.moveTo(-s, -s + r);
  squareHole.lineTo(-s, s - r);
  squareHole.quadraticCurveTo(-s, s, -s + r, s);
  squareHole.lineTo(s - r, s);
  squareHole.quadraticCurveTo(s, s, s, s - r);
  squareHole.lineTo(s, -s + r);
  squareHole.quadraticCurveTo(s, -s, s - r, -s);
  squareHole.lineTo(-s + r, -s);
  squareHole.quadraticCurveTo(-s, -s, -s, -s + r);
  shape.holes.push(squareHole);

  return shape;
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
    const toUV = (index: number): THREE.Vector2 =>
      new THREE.Vector2(
        0.5 - (vertices[index * 3] / (TABLETOP_COIN_RADIUS * 2)) * COIN_FACE_UV_SCALE,
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

export function createCoinFaceGeometry(): THREE.ShapeGeometry {
  const geometry = new THREE.ShapeGeometry(createCoinShape(), 96);
  const positions = geometry.getAttribute('position');
  const uvs: number[] = [];

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    uvs.push(
      0.5 - (x / (TABLETOP_COIN_RADIUS * 2)) * COIN_FACE_UV_SCALE,
      (y / (TABLETOP_COIN_RADIUS * 2)) * COIN_FACE_UV_SCALE + 0.5
    );
  }

  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
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
