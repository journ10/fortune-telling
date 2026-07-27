// 场景道具：蒲席、背景墙、钱筒、光尘。
// 全部为程序化生成（无外部资产），纯视觉陈设，不参与物理与判面。

import * as THREE from 'three';

function createCanvas(size: number, height = size): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }
  return [canvas, context];
}

function toTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/* ---------- 蒲席：同心编织圆席，铜钱的仪式锚点 ---------- */

export function createWovenMat(): THREE.Mesh {
  const SIZE = 512;
  const [canvas, ctx] = createCanvas(SIZE);
  const center = SIZE / 2;

  // 蔺草底色
  ctx.fillStyle = '#4a3a26';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 同心编环：明暗交替的环带 + 每环内的斜向织纹
  for (let r = 6; r < center; r += 7) {
    const tone = (r / 7) % 2 === 0 ? '#5a4730' : '#42331f';
    ctx.strokeStyle = tone;
    ctx.lineWidth = 5.2;
    ctx.beginPath();
    ctx.arc(center, center, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 放射状缝线（蒲席的筋）
  ctx.strokeStyle = 'rgba(30, 22, 12, 0.55)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(center + Math.cos(angle) * 8, center + Math.sin(angle) * 8);
    ctx.lineTo(center + Math.cos(angle) * center, center + Math.sin(angle) * center);
    ctx.stroke();
  }

  // 边缘包边
  ctx.strokeStyle = '#2c2114';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(center, center, center - 8, 0, Math.PI * 2);
  ctx.stroke();

  // 磨损噪点
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const shade = Math.random() > 0.5 ? 'rgba(255, 230, 180, 0.05)' : 'rgba(0, 0, 0, 0.08)';
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, 1.6, 1.6);
  }

  const material = new THREE.MeshStandardMaterial({
    map: toTexture(canvas),
    bumpMap: toTexture(canvas, false),
    bumpScale: 0.6,
    roughness: 0.92,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    envMapIntensity: 0.25
  });

  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1.7, 96), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.receiveShadow = true;
  return mesh;
}

/* ---------- 背景墙：夜色中的一堵暖墙，灯晕从左侧漫上来 ---------- */

export function createBackdropWall(): THREE.Mesh {
  const WIDTH = 1024;
  const HEIGHT = 512;
  const [canvas, ctx] = createCanvas(WIDTH, HEIGHT);

  // 纵向基调：底部沉黑，顶部微暖
  const vertical = ctx.createLinearGradient(0, HEIGHT, 0, 0);
  vertical.addColorStop(0, '#0d0a07');
  vertical.addColorStop(0.55, '#161009');
  vertical.addColorStop(1, '#1c140c');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 灯晕：左中位置的暖色径向光斑（与聚光方向呼应）
  const glow = ctx.createRadialGradient(340, 300, 30, 340, 300, 560);
  glow.addColorStop(0, 'rgba(178, 126, 62, 0.52)');
  glow.addColorStop(0.5, 'rgba(128, 88, 44, 0.2)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 宣纸/土墙颗粒
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * WIDTH;
    const y = Math.random() * HEIGHT;
    ctx.fillStyle =
      Math.random() > 0.5 ? 'rgba(255, 235, 200, 0.028)' : 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(x, y, 1.4, 1.4);
  }

  const material = new THREE.MeshBasicMaterial({ map: toTexture(canvas) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(34, 12), material);
  mesh.position.set(0, 4.4, -8.6);
  return mesh;
}

/* ---------- 钱筒：竹制签筒，静置于一角的仪式器物 ---------- */

function createBambooTexture(): THREE.CanvasTexture {
  const SIZE = 256;
  const [canvas, ctx] = createCanvas(SIZE);

  ctx.fillStyle = '#6b4e2a';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 纵向竹纤维
  for (let x = 0; x < SIZE; x += 3) {
    const shade = 62 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${shade + 30}, ${shade + 8}, ${shade - 18}, 0.5)`;
    ctx.fillRect(x, 0, 2, SIZE);
  }

  // 竹节环
  for (const y of [SIZE * 0.3, SIZE * 0.72]) {
    ctx.fillStyle = 'rgba(38, 26, 12, 0.85)';
    ctx.fillRect(0, y - 3, SIZE, 7);
    ctx.fillStyle = 'rgba(210, 170, 100, 0.35)';
    ctx.fillRect(0, y + 4, SIZE, 2);
  }

  return toTexture(canvas);
}

export function createCoinTube(): THREE.Group {
  const group = new THREE.Group();

  const bamboo = createBambooTexture();
  bamboo.wrapS = THREE.RepeatWrapping;
  bamboo.repeat.set(3, 1);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    map: bamboo,
    roughness: 0.75,
    metalness: 0.0,
    envMapIntensity: 0.3
  });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.17, 0.68, 28, 1, true),
    bodyMaterial
  );
  body.castShadow = true;
  body.receiveShadow = true;

  // 筒底
  const bottom = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 28),
    new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.9 })
  );
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.34;

  // 筒口：幽暗的内膛，深不见底
  const mouth = new THREE.Mesh(
    new THREE.CircleGeometry(0.142, 28),
    new THREE.MeshBasicMaterial({ color: 0x050302 })
  );
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.y = 0.335;

  // 筒口木缘
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.012, 10, 36),
    bodyMaterial
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.34;

  group.add(body, bottom, mouth, lip);
  group.position.set(-2.75, 0.34, -2.6);
  group.rotation.z = 0.05;
  group.rotation.x = -0.03;
  return group;
}

/* ---------- 光尘：光柱里缓缓浮游的微尘 ---------- */

export interface DustMotes {
  points: THREE.Points;
  update: (elapsedSeconds: number) => void;
  dispose: () => void;
}

export function createDustMotes(count = 90): DustMotes {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const bases = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    bases[i * 3] = (Math.random() - 0.5) * 4.4; // x
    bases[i * 3 + 1] = 0.15 + Math.random() * 3.0; // y
    bases[i * 3 + 2] = (Math.random() - 0.5) * 3.2; // z
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.5 + Math.random() * 0.8;
  }
  positions.set(bases);

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffe0b0,
    size: 0.014,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    update: (elapsedSeconds) => {
      for (let i = 0; i < count; i++) {
        const phase = phases[i];
        const speed = speeds[i];
        positions[i * 3] = bases[i * 3] + Math.sin(elapsedSeconds * 0.11 * speed + phase) * 0.22;
        positions[i * 3 + 1] =
          bases[i * 3 + 1] + Math.sin(elapsedSeconds * 0.07 * speed + phase * 1.7) * 0.18;
        positions[i * 3 + 2] =
          bases[i * 3 + 2] + Math.cos(elapsedSeconds * 0.09 * speed + phase) * 0.16;
      }
      geometry.attributes.position.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    }
  };
}
