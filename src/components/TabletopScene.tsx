import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import * as THREE from 'three';
import type { CoinFace, CoinToss } from '../domain/types';

interface TabletopSceneProps {
  currentThrow: number;
  pendingToss: CoinToss | null;
  resultAvailable: boolean;
  onOpenResult: () => void;
  onTossRequest: () => void;
  onTossSettled: () => void;
}

const FALLBACK_FACES: CoinFace[] = ['heads', 'tails', 'heads'];
const SETTLE_DELAY_MS = 320;
const SCENE_WIDTH = 720;
const SCENE_HEIGHT = 480;
const COIN_RADIUS = 0.62;

const visuallyHiddenStyle: CSSProperties = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px'
};

function hasWebGLSupport(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function getTime(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function targetRotationForFace(face: CoinFace): number {
  return face === 'heads' ? -Math.PI / 2 : Math.PI / 2;
}

function createPendingTossKey(currentThrow: number, pendingToss: CoinToss | null): string | null {
  if (!pendingToss) {
    return null;
  }

  return `${currentThrow}:${pendingToss.faces.join('-')}:${pendingToss.score}:${pendingToss.line.name}`;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
}

function createCoinGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, COIN_RADIUS, 0, Math.PI * 2, false);

  const squareHoleSize = 0.17;
  const squareHole = new THREE.Path();
  squareHole.moveTo(-squareHoleSize, -squareHoleSize);
  squareHole.lineTo(squareHoleSize, -squareHoleSize);
  squareHole.lineTo(squareHoleSize, squareHoleSize);
  squareHole.lineTo(-squareHoleSize, squareHoleSize);
  squareHole.lineTo(-squareHoleSize, -squareHoleSize);
  shape.holes.push(squareHole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    curveSegments: 96
  });
  geometry.center();

  return geometry;
}

export default function TabletopScene({
  currentThrow,
  pendingToss,
  resultAvailable,
  onOpenResult,
  onTossRequest,
  onTossSettled
}: TabletopSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const coinTargetsRef = useRef<number[]>(FALLBACK_FACES.map(targetRotationForFace));
  const tossStartedAtRef = useRef<number | null>(null);
  const settledTossKeyRef = useRef<string | null>(null);
  const scheduledTossKeyRef = useRef<string | null>(null);
  const onTossSettledRef = useRef(onTossSettled);
  const [isWebGlActive, setIsWebGlActive] = useState(false);
  const throwStatusId = useId();
  const pendingTossKey = createPendingTossKey(currentThrow, pendingToss);

  useEffect(() => {
    onTossSettledRef.current = onTossSettled;
  }, [onTossSettled]);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount || !hasWebGLSupport()) {
      return undefined;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let coinGeometry: THREE.ExtrudeGeometry | null = null;
    let coinMaterial: THREE.MeshStandardMaterial | null = null;
    let tabletopGeometry: THREE.PlaneGeometry | null = null;
    let tabletopMaterial: THREE.MeshStandardMaterial | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeRenderer: (() => void) | null = null;
    let isWindowResizeFallback = false;
    let animationFrame = 0;

    const cleanupWebGlResources = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      resizeObserver?.disconnect();

      if (isWindowResizeFallback && resizeRenderer) {
        window.removeEventListener('resize', resizeRenderer);
      }

      if (renderer?.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }

      coinGeometry?.dispose();
      coinMaterial?.dispose();
      tabletopGeometry?.dispose();

      if (tabletopMaterial) {
        disposeMaterial(tabletopMaterial);
      }

      renderer?.dispose();
    };

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x121611);
      const camera = new THREE.PerspectiveCamera(35, SCENE_WIDTH / SCENE_HEIGHT, 0.1, 100);
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true
      });
      const activeCoinGeometry = createCoinGeometry();
      coinGeometry = activeCoinGeometry;
      const activeCoinMaterial = new THREE.MeshStandardMaterial({
        color: 0xb87333,
        metalness: 0.78,
        roughness: 0.34
      });
      coinMaterial = activeCoinMaterial;
      const activeTabletopGeometry = new THREE.PlaneGeometry(13, 9);
      tabletopGeometry = activeTabletopGeometry;
      const activeTabletopMaterial = new THREE.MeshStandardMaterial({
        color: 0x263c34,
        metalness: 0.04,
        roughness: 0.92
      });
      tabletopMaterial = activeTabletopMaterial;
      const tabletop = new THREE.Mesh(activeTabletopGeometry, activeTabletopMaterial);
      const coins = FALLBACK_FACES.map((face, index) => {
        const coin = new THREE.Mesh(activeCoinGeometry, activeCoinMaterial);

        coin.castShadow = true;
        coin.receiveShadow = true;
        coin.position.set((index - 1) * 1.22, 0.08, 0);
        coin.rotation.x = targetRotationForFace(face);
        coin.rotation.z = (index - 1) * 0.08;
        scene.add(coin);

        return coin;
      });

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.width = '100%';
      mount.appendChild(renderer.domElement);

      tabletop.receiveShadow = true;
      tabletop.rotation.x = -Math.PI / 2;
      tabletop.position.y = -0.01;
      scene.add(tabletop);

      scene.add(new THREE.AmbientLight(0xfff1dc, 1.9));

      const keyLight = new THREE.DirectionalLight(0xffd9aa, 2.5);
      keyLight.position.set(-2.5, 4.2, 3.4);
      keyLight.castShadow = true;
      scene.add(keyLight);

      const rimLight = new THREE.PointLight(0xfff6df, 1.1, 8);
      rimLight.position.set(2.4, 2.2, -2.8);
      scene.add(rimLight);

      camera.position.set(0, 3.2, 4.8);
      camera.lookAt(0, 0, 0);

      resizeRenderer = () => {
        const width = mount.clientWidth || SCENE_WIDTH;
        const height = mount.clientHeight || SCENE_HEIGHT;

        renderer?.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      resizeRenderer();

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resizeRenderer);
        resizeObserver.observe(mount);
      } else {
        isWindowResizeFallback = true;
        window.addEventListener('resize', resizeRenderer);
      }

      const clock = new THREE.Clock();
      const renderFrame = () => {
        const elapsed = clock.getElapsedTime();
        const tossStartedAt = tossStartedAtRef.current;
        const tossProgress =
          tossStartedAt === null ? 1 : Math.min((getTime() - tossStartedAt) / SETTLE_DELAY_MS, 1);

        coins.forEach((coin, index) => {
          const targetRotation = coinTargetsRef.current[index] ?? 0;

          if (tossStartedAt !== null && tossProgress < 1) {
            coin.rotation.x =
              targetRotation + (1 - tossProgress) * Math.PI * (5 + index * 0.8);
            coin.position.y = 0.08 + Math.sin(tossProgress * Math.PI) * (0.42 + index * 0.04);
          } else {
            coin.rotation.x += (targetRotation - coin.rotation.x) * 0.16;
            coin.position.y += (0.08 - coin.position.y) * 0.16;
          }

          coin.rotation.z = Math.sin(elapsed * 0.75 + index) * 0.05 + (index - 1) * 0.08;
        });

        renderer?.render(scene, camera);
        animationFrame = window.requestAnimationFrame(renderFrame);
      };

      renderFrame();
      setIsWebGlActive(true);

      return cleanupWebGlResources;
    } catch {
      cleanupWebGlResources();
      setIsWebGlActive(false);
      return undefined;
    };
  }, []);

  useEffect(() => {
    if (!pendingTossKey || !pendingToss) {
      tossStartedAtRef.current = null;
      scheduledTossKeyRef.current = null;
      settledTossKeyRef.current = null;
      return undefined;
    }

    if (
      scheduledTossKeyRef.current === pendingTossKey ||
      settledTossKeyRef.current === pendingTossKey
    ) {
      return undefined;
    }

    scheduledTossKeyRef.current = pendingTossKey;
    tossStartedAtRef.current = getTime();
    coinTargetsRef.current = pendingToss.faces.map(targetRotationForFace);

    const timeoutId = window.setTimeout(() => {
      if (
        scheduledTossKeyRef.current !== pendingTossKey ||
        settledTossKeyRef.current === pendingTossKey
      ) {
        return;
      }

      tossStartedAtRef.current = null;
      scheduledTossKeyRef.current = null;
      settledTossKeyRef.current = pendingTossKey;
      onTossSettledRef.current();
    }, SETTLE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);

      if (scheduledTossKeyRef.current === pendingTossKey) {
        scheduledTossKeyRef.current = null;
      }
    };
  }, [pendingTossKey]);

  const fallbackFaces = pendingToss?.faces ?? FALLBACK_FACES;
  const buttonLabel = resultAvailable ? '查看结果' : '投掷铜钱';
  const handleInteraction = () => {
    if (resultAvailable) {
      onOpenResult();
      return;
    }

    onTossRequest();
  };

  return (
    <section
      className="tabletopScene"
      data-webgl-active={isWebGlActive ? 'true' : 'false'}
      aria-label="铜钱桌面"
    >
      <div ref={mountRef} className="tabletopCanvas" aria-hidden="true" />
      <div className="fallbackCoins" aria-hidden="true">
        {fallbackFaces.map((face, index) => (
          <span className="fallbackCoin" data-face={face} key={`${face}-${index}`} />
        ))}
      </div>
      <button
        aria-describedby={throwStatusId}
        aria-label={buttonLabel}
        className="coinInteractionSurface"
        disabled={pendingToss !== null}
        onClick={handleInteraction}
        type="button"
      >
        <span className="sr-only" id={throwStatusId} style={visuallyHiddenStyle}>
          第 {currentThrow} 次投掷
        </span>
      </button>
    </section>
  );
}
