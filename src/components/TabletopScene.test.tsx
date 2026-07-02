import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as THREE from 'three';
import { afterEach, beforeEach, vi } from 'vitest';
import type { CoinFace } from '../domain/types';
import TabletopScene, {
  COIN_TEXTURE_ASSET,
  MIN_COIN_LANDING_DISTANCE,
  TABLETOP_COIN_RADIUS,
  TABLETOP_COIN_THICKNESS,
  computeCoinTableContactY,
  createCoinAnimationPlans,
  createCoinGroup
} from './TabletopScene';

interface RenderTabletopSceneOptions {
  currentThrow?: number;
  pendingTossId?: number | null;
  resultAvailable?: boolean;
  tossInteractionPhase?: 'idle' | 'shaking' | 'released';
  onOpenResult?: () => void;
  onTossRequest?: () => void;
  onTossSettled?: (faces: [CoinFace, CoinFace, CoinFace]) => void;
}

function renderTabletopScene({
  currentThrow = 1,
  pendingTossId = null,
  resultAvailable = false,
  tossInteractionPhase = 'idle',
  onOpenResult = vi.fn(),
  onTossRequest = vi.fn(),
  onTossSettled = vi.fn()
}: RenderTabletopSceneOptions = {}) {
  render(
    <TabletopScene
      currentThrow={currentThrow}
      pendingTossId={pendingTossId}
      resultAvailable={resultAvailable}
      tossInteractionPhase={tossInteractionPhase}
      onOpenResult={onOpenResult}
      onTossRequest={onTossRequest}
      onTossSettled={onTossSettled}
    />
  );

  return { onOpenResult, onTossRequest, onTossSettled };
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
    const onTossRequest = vi.fn();

    renderTabletopScene({ onTossRequest });

    fireEvent.pointerDown(screen.getByRole('button', { name: '按住颠钱，松开掷出' }));

    expect(onTossRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('开始起卦')).not.toBeInTheDocument();
    expect(screen.queryByText('AI 解读')).not.toBeInTheDocument();
  });

  it('settles a pending toss with fallback faces in the non-WebGL fallback', async () => {
    vi.useFakeTimers();
    const onTossSettled = vi.fn();

    renderTabletopScene({
      pendingTossId: 1,
      tossInteractionPhase: 'released',
      onTossSettled
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onTossSettled).toHaveBeenCalledTimes(1);
    expect(onTossSettled.mock.calls[0][0]).toHaveLength(3);
    onTossSettled.mock.calls[0][0].forEach((face: CoinFace) => {
      expect(['heads', 'tails']).toContain(face);
    });
  });

  it('keeps settled fallback coins on the tabletop until the next manual toss', async () => {
    vi.useFakeTimers();
    const onTossSettled = vi.fn();
    const { rerender } = render(
      <TabletopScene
        currentThrow={1}
        pendingTossId={1}
        resultAvailable={false}
        tossInteractionPhase="released"
        onOpenResult={vi.fn()}
        onTossRequest={vi.fn()}
        onTossSettled={onTossSettled}
      />
    );

    const pendingFaces = Array.from(document.querySelectorAll('.fallbackCoin')).map((coin) =>
      coin.getAttribute('data-face')
    );
    expect(pendingFaces).toHaveLength(3);
    pendingFaces.forEach((face) => {
      expect(['heads', 'tails']).toContain(face);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onTossSettled).toHaveBeenCalledTimes(1);

    rerender(
      <TabletopScene
        currentThrow={2}
        pendingTossId={null}
        resultAvailable={false}
        onOpenResult={vi.fn()}
        onTossRequest={vi.fn()}
        onTossSettled={onTossSettled}
      />
    );

    const settledFaces = Array.from(document.querySelectorAll('.fallbackCoin')).map((coin) =>
      coin.getAttribute('data-face')
    );
    expect(settledFaces).toEqual(pendingFaces);
  });

  it('keeps fallback coins and settles a toss when WebGL renderer setup fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D
    );
    const onTossSettled = vi.fn();

    expect(() =>
      renderTabletopScene({
        pendingTossId: 2,
        tossInteractionPhase: 'released',
        onTossSettled
      })
    ).not.toThrow();

    expect(document.querySelector('.tabletopCanvas canvas')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.fallbackCoin')).toHaveLength(3);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onTossSettled).toHaveBeenCalledTimes(1);
    expect(onTossSettled.mock.calls[0][0]).toHaveLength(3);
  });

  it('settles a rerendered pending toss once without restarting the timer', async () => {
    vi.useFakeTimers();
    const firstSettled = vi.fn();
    const secondSettled = vi.fn();
    const thirdSettled = vi.fn();

    const { rerender } = render(
      <TabletopScene
        currentThrow={2}
        pendingTossId={22}
        resultAvailable={false}
        tossInteractionPhase="released"
        onOpenResult={vi.fn()}
        onTossRequest={vi.fn()}
        onTossSettled={firstSettled}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1700);
    });

    rerender(
      <TabletopScene
        currentThrow={2}
        pendingTossId={22}
        resultAvailable={false}
        tossInteractionPhase="released"
        onOpenResult={vi.fn()}
        onTossRequest={vi.fn()}
        onTossSettled={secondSettled}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(520);
    });

    expect(firstSettled).not.toHaveBeenCalled();
    expect(secondSettled).toHaveBeenCalledTimes(1);

    rerender(
      <TabletopScene
        currentThrow={2}
        pendingTossId={22}
        resultAvailable={false}
        tossInteractionPhase="released"
        onOpenResult={vi.fn()}
        onTossRequest={vi.fn()}
        onTossSettled={thirdSettled}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(secondSettled).toHaveBeenCalledTimes(1);
    expect(thirdSettled).not.toHaveBeenCalled();
  });

  it('opens the result when a result is available', async () => {
    const user = userEvent.setup();
    const onOpenResult = vi.fn();
    const onTossRequest = vi.fn();

    renderTabletopScene({ resultAvailable: true, onOpenResult, onTossRequest });

    await user.click(screen.getByRole('button', { name: '查看结果' }));

    expect(onOpenResult).toHaveBeenCalledTimes(1);
    expect(onTossRequest).not.toHaveBeenCalled();
  });
});
