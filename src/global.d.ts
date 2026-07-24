import type * as THREE from 'three';

declare global {
  interface Window {
    /** 调试钩子：TabletopScene 暴露当前桌面网格，便于运行时更新 PBR 材质。 */
    __tabletop?: THREE.Mesh;
  }
}

export {};
