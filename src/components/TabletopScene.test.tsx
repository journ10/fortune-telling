import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as THREE from 'three';
import { afterEach, beforeEach, vi } from 'vitest';
import type { CoinFace } from '../domain/types';
import {
  createKeyboardPhysicalTossInput,
  type PhysicalTossInput
} from '../physics/physicalTossInput';
import TabletopScene, {
  COIN_TEXTURE_ASSET,
  MIN_COIN_LANDING_DISTANCE,
  TABLETOP_COIN_RADIUS,
  TABLETOP_COIN_THICKNESS,
  computeCoinTableContactY,
  createCoinAnimationPlans,
  createCoinGroup
} from './TabletopScene';

vi.mock('../hooks/usePhysicalTossSimulation', () => ({
  usePhysicalTossSimulation: vi.fn(() => null)
}));

interface PendingPhysicalToss {
  id: number;
  input: PhysicalTossInput;
}

interface RenderTabletopSceneOptions {
  currentThrow?: number;
  pendingToss?: PendingPhysicalToss | null;
  resultAvailable?: boolean;
  onOpenResult?: () => void;
  onPhysicalTossRequest?: (input: PhysicalTossInput) => void;
  onTossSimulationError?: (error: unknown) => void;
  onTossSettled?: (faces: [CoinFace, CoinFace, CoinFace]) => void;
}

function createPendingToss(id: number, currentThrow = 1): PendingPhysicalToss {
  return {
    id,
    input: createKeyboardPhysicalTossInput({
      currentThrow,
      perturbationSeed: id
    })
  };
}

function renderTabletopScene({
  currentThrow = 1,
  pendingToss = null,
  resultAvailable = false,
  onOpenResult = vi.fn(),
  onPhysicalTossRequest = vi.fn(),
  onTossSimulationError = vi.fn(),
  onTossSettled = vi.fn()
}: RenderTabletopSceneOptions = {}) {
  render(
    <TabletopScene
      currentThrow={currentThrow}
      pendingToss={pendingToss}
      resultAvailable={resultAvailable}
      onOpenResult={onOpenResult}
      onPhysicalTossRequest={onPhysicalTossRequest}
      onTossSimulationError={onTossSimulationError}
      onTossSettled={onTossSettled}
    />
  );

  return { onOpenResult, onPhysicalTossRequest, onTossSimulationError, onTossSettled };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('TabletopScene', () => {
  it('uses a restrained traditional coin scale', () => {
    expect(TABLETOP_COIN_RADIUS).toBeGreaterThanOrEqual(0.46);
    expect(TABLETOP_COIN_RADIUS).toBeLessThanOrEqual(0.52);
  });

  it('uses a thin cash-coin silhouette instead of a token-like slab', () => {
    const thicknessRatio = TABLETOP_COIN_THICKNESS / (TABLETOP_COIN_RADIUS * 2);

    expect(thicknessRatio).toBeGreaterThanOrEqual(0.04);
    expect(thicknessRatio).toBeLessThanOrEqual(0.045);

    const coin = createCoinGroup(0);
    const bounds = new THREE.Box3().setFromObject(coin);
    const size = new THREE.Vector3();
    bounds.getSize(size);

    expect(size.z / (TABLETOP_COIN_RADIUS * 2)).toBeLessThanOrEqual(0.07);
  });

  it('keeps generated coin resting points from overlapping', () => {
    const faceSets: CoinFace[][] = [
      ['heads', 'heads', 'heads'],
      ['heads', 'tails', 'heads'],
      ['tails', 'heads', 'tails'],
      ['tails', 'tails', 'tails']
    ];

    for (let currentThrow = 1; currentThrow <= 6; currentThrow += 1) {
      faceSets.forEach((faces) => {
        const plans = createCoinAnimationPlans(currentThrow, faces);

        plans.forEach((plan, index) => {
          plans.slice(index + 1).forEach((otherPlan) => {
            const distance = Math.hypot(
              plan.landingX + plan.slideX - otherPlan.landingX - otherPlan.slideX,
              plan.landingZ + plan.slideZ - otherPlan.landingZ - otherPlan.slideZ
            );

            expect(distance).toBeGreaterThanOrEqual(MIN_COIN_LANDING_DISTANCE);
          });
        });
      });
    }
  });

  it('keeps the coin body above the tabletop for tilted and upright rotations', () => {
    const rotations = [
      new THREE.Euler(-Math.PI / 2, 0, 0),
      new THREE.Euler(0, 0, 0),
      new THREE.Euler(Math.PI / 4, Math.PI / 3, Math.PI / 6),
      new THREE.Euler(Math.PI * 0.82, Math.PI * 0.35, Math.PI * 0.18)
    ];

    rotations.forEach((rotation) => {
      const contactY = computeCoinTableContactY(rotation);
      const normal = new THREE.Vector3(0, 0, 1).applyEuler(rotation);
      const verticalHalfExtent =
        TABLETOP_COIN_RADIUS * Math.sqrt(1 - normal.y * normal.y) +
        (TABLETOP_COIN_THICKNESS / 2) * Math.abs(normal.y);

      expect(contactY).toBeGreaterThanOrEqual(verticalHalfExtent);
    });
  });

  it('keeps real rim and square-hole relief geometry around the image texture', () => {
    const coin = createCoinGroup(0);
    const reliefMeshes: THREE.Object3D[] = [];

    coin.traverse((child) => {
      if (child.userData.relief === true) {
        reliefMeshes.push(child);
      }
    });

    expect(reliefMeshes.length).toBeGreaterThanOrEqual(8);
  });

  it('uses bump-mapped faces so cast lettering is not a flat bitmap', () => {
    const coin = createCoinGroup(0);
    const faceMaterials: THREE.MeshStandardMaterial[] = [];

    coin.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const material = child.material;

        if (material.map && material.emissiveMap === material.map) {
          faceMaterials.push(material);
        }
      }
    });

    expect(faceMaterials).toHaveLength(2);
    faceMaterials.forEach((material) => {
      expect(material.bumpMap).toBe(material.map);
      expect(material.bumpScale).toBeGreaterThan(0);
      expect(material.bumpScale).toBeLessThanOrEqual(0.012);
    });
  });

  it('renders coin faces front-side only so lettering is never shown mirrored from behind', () => {
    const coin = createCoinGroup(0);
    const faceMaterials: THREE.MeshStandardMaterial[] = [];

    coin.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const material = child.material;

        if (material.map && material.emissiveMap === material.map) {
          faceMaterials.push(material);
        }
      }
    });

    expect(faceMaterials).toHaveLength(2);
    faceMaterials.forEach((material) => {
      expect(material.side).toBe(THREE.FrontSide);
    });
  });

  it('maps face texture uvs against the mirrored camera-facing plane', () => {
    const coin = createCoinGroup(0);
    const face = coin.children.find(
      (child): child is THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial> =>
        child instanceof THREE.Mesh &&
        child.geometry instanceof THREE.ShapeGeometry &&
        child.material instanceof THREE.MeshStandardMaterial &&
        child.material.emissiveMap === child.material.map
    );

    expect(face).toBeDefined();

    const positions = face?.geometry.getAttribute('position') as THREE.BufferAttribute;
    const uvs = face?.geometry.getAttribute('uv') as THREE.BufferAttribute;
    let leftmostUv = 0;
    let rightmostUv = 0;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);

      if (x < minX) {
        minX = x;
        leftmostUv = uvs.getX(index);
      }

      if (x > maxX) {
        maxX = x;
        rightmostUv = uvs.getX(index);
      }
    }

    expect(leftmostUv).toBeGreaterThan(0.98);
    expect(rightmostUv).toBeLessThan(0.02);
  });

  it('uses a patinated edge texture instead of a flat side material', () => {
    const coin = createCoinGroup(0);
    const body = coin.children.find(
      (child): child is THREE.Mesh<THREE.ExtrudeGeometry, THREE.Material | THREE.Material[]> =>
        child instanceof THREE.Mesh && child.geometry instanceof THREE.ExtrudeGeometry
    );

    expect(body).toBeDefined();
    expect(Array.isArray(body?.material)).toBe(true);

    const materials = body?.material as THREE.Material[];
    const edgeMaterial = materials[1] as THREE.MeshStandardMaterial;

    expect(edgeMaterial).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(edgeMaterial.map).toBeTruthy();
    expect(edgeMaterial.bumpMap).toBe(edgeMaterial.map);
    expect(edgeMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(edgeMaterial.map?.repeat.x).toBeLessThanOrEqual(1.15);
    expect(edgeMaterial.userData.patinaPattern).toBe('mottled-edge');
    expect(edgeMaterial.userData.greenPatina).toBe('subtle-speckles');
  });

  it('references a project coin texture sheet asset for WebGL coin faces', () => {
    expect(COIN_TEXTURE_ASSET).toContain('qing-cash-coin-texture.png');
  });

  it('renders the coin interaction without question or AI copy', () => {
    const onPhysicalTossRequest = vi.fn();

    renderTabletopScene({ onPhysicalTossRequest });

    const button = screen.getByRole('button', { name: '拖动铜钱，松手掷出' });
    fireEvent.pointerDown(button, { clientX: 210, clientY: 250 });
    fireEvent.pointerUp(button, { clientX: 260, clientY: 220 });

    expect(onPhysicalTossRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('开始起卦')).not.toBeInTheDocument();
    expect(screen.queryByText('AI 解读')).not.toBeInTheDocument();
  });

  it('requests a physical pointer toss from drag release samples', () => {
    const onPhysicalTossRequest = vi.fn();

    renderTabletopScene({ onPhysicalTossRequest });

    const button = screen.getByRole('button', { name: '拖动铜钱，松手掷出' });
    fireEvent.pointerDown(button, { clientX: 210, clientY: 250 });
    fireEvent.pointerMove(button, { clientX: 260, clientY: 220 });
    fireEvent.pointerMove(button, { clientX: 340, clientY: 180 });
    fireEvent.pointerUp(button, { clientX: 390, clientY: 160 });

    expect(onPhysicalTossRequest).toHaveBeenCalledTimes(1);
    expect(onPhysicalTossRequest.mock.calls[0][0]).toMatchObject({
      source: 'pointer',
      currentThrow: 1
    });
    expect(onPhysicalTossRequest.mock.calls[0][0].coins).toHaveLength(3);
  });

  it('ignores secondary mouse pointer toss attempts', () => {
    const onPhysicalTossRequest = vi.fn();

    renderTabletopScene({ onPhysicalTossRequest });

    const button = screen.getByRole('button', { name: '拖动铜钱，松手掷出' });
    fireEvent.pointerDown(button, {
      button: 2,
      clientX: 210,
      clientY: 250,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse'
    });
    fireEvent.pointerMove(button, {
      clientX: 260,
      clientY: 220,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse'
    });
    fireEvent.pointerUp(button, {
      clientX: 340,
      clientY: 180,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse'
    });

    expect(onPhysicalTossRequest).not.toHaveBeenCalled();
  });

  it('ignores non-primary pointer toss attempts', () => {
    const onPhysicalTossRequest = vi.fn();

    renderTabletopScene({ onPhysicalTossRequest });

    const button = screen.getByRole('button', { name: '拖动铜钱，松手掷出' });
    fireEvent.pointerDown(button, {
      clientX: 210,
      clientY: 250,
      isPrimary: false,
      pointerId: 2,
      pointerType: 'touch'
    });
    fireEvent.pointerMove(button, {
      clientX: 260,
      clientY: 220,
      isPrimary: false,
      pointerId: 2,
      pointerType: 'touch'
    });
    fireEvent.pointerUp(button, {
      clientX: 340,
      clientY: 180,
      isPrimary: false,
      pointerId: 2,
      pointerType: 'touch'
    });

    expect(onPhysicalTossRequest).not.toHaveBeenCalled();
  });

  it('ignores pointer releases from a different active pointer', () => {
    const onPhysicalTossRequest = vi.fn();

    renderTabletopScene({ onPhysicalTossRequest });

    const button = screen.getByRole('button', { name: '拖动铜钱，松手掷出' });
    fireEvent.pointerDown(button, {
      button: 0,
      clientX: 210,
      clientY: 250,
      isPrimary: true,
      pointerId: 3,
      pointerType: 'touch'
    });
    fireEvent.pointerMove(button, {
      clientX: 260,
      clientY: 220,
      isPrimary: true,
      pointerId: 4,
      pointerType: 'touch'
    });
    fireEvent.pointerUp(button, {
      clientX: 340,
      clientY: 180,
      isPrimary: true,
      pointerId: 4,
      pointerType: 'touch'
    });

    expect(onPhysicalTossRequest).not.toHaveBeenCalled();
  });

  it('creates a keyboard physical toss on Enter release', () => {
    const onPhysicalTossRequest = vi.fn();

    renderTabletopScene({ onPhysicalTossRequest });

    const button = screen.getByRole('button', { name: '拖动铜钱，松手掷出' });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: 'Enter' });

    expect(onPhysicalTossRequest).toHaveBeenCalledTimes(1);
    expect(onPhysicalTossRequest.mock.calls[0][0]).toMatchObject({
      source: 'keyboard',
      currentThrow: 1
    });
  });

  it('does not settle a pending toss from fallback display faces', () => {
    const onTossSettled = vi.fn();

    renderTabletopScene({
      pendingToss: createPendingToss(1),
      onTossSettled
    });

    expect(screen.getByRole('button', { name: '投掷落定中' })).toBeDisabled();
    expect(document.querySelectorAll('.fallbackCoin')).toHaveLength(3);
    expect(onTossSettled).not.toHaveBeenCalled();
  });

  it('keeps neutral fallback coins on the tabletop while physics is pending', () => {
    const onTossSettled = vi.fn();

    renderTabletopScene({
      pendingToss: createPendingToss(1),
      onTossSettled
    });

    const pendingFaces = Array.from(document.querySelectorAll('.fallbackCoin')).map((coin) =>
      coin.getAttribute('data-face')
    );

    expect(pendingFaces).toEqual(['heads', 'tails', 'heads']);
    expect(onTossSettled).not.toHaveBeenCalled();
  });

  it('keeps fallback coins without settling when WebGL renderer setup fails', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D
    );
    const onTossSettled = vi.fn();

    expect(() =>
      renderTabletopScene({
        pendingToss: createPendingToss(2),
        onTossSettled
      })
    ).not.toThrow();

    expect(document.querySelector('.tabletopCanvas canvas')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.fallbackCoin')).toHaveLength(3);
    expect(onTossSettled).not.toHaveBeenCalled();
  });

  it('does not settle a rerendered pending toss without physics faces', () => {
    const firstSettled = vi.fn();
    const secondSettled = vi.fn();

    const { rerender } = render(
      <TabletopScene
        currentThrow={2}
        pendingToss={createPendingToss(22, 2)}
        resultAvailable={false}
        onOpenResult={vi.fn()}
        onPhysicalTossRequest={vi.fn()}
        onTossSimulationError={vi.fn()}
        onTossSettled={firstSettled}
      />
    );

    rerender(
      <TabletopScene
        currentThrow={2}
        pendingToss={createPendingToss(22, 2)}
        resultAvailable={false}
        onOpenResult={vi.fn()}
        onPhysicalTossRequest={vi.fn()}
        onTossSimulationError={vi.fn()}
        onTossSettled={secondSettled}
      />
    );

    expect(firstSettled).not.toHaveBeenCalled();
    expect(secondSettled).not.toHaveBeenCalled();
  });

  it('opens the result when a result is available', async () => {
    const user = userEvent.setup();
    const onOpenResult = vi.fn();
    const onPhysicalTossRequest = vi.fn();

    renderTabletopScene({ resultAvailable: true, onOpenResult, onPhysicalTossRequest });

    await user.click(screen.getByRole('button', { name: '查看结果' }));

    expect(onOpenResult).toHaveBeenCalledTimes(1);
    expect(onPhysicalTossRequest).not.toHaveBeenCalled();
  });
});
