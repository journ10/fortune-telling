import { useEffect, useId, useRef } from 'react';
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
  return face === 'heads' ? 0 : Math.PI;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
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
  const throwStatusId = useId();

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount || !hasWebGLSupport()) {
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, SCENE_WIDTH / SCENE_HEIGHT, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    const coinGeometry = new THREE.CylinderGeometry(0.56, 0.56, 0.1, 72);
    const coinMaterial = new THREE.MeshStandardMaterial({
      color: 0xb87333,
      metalness: 0.86,
      roughness: 0.26
    });
    const tabletopGeometry = new THREE.PlaneGeometry(8, 5);
    const tabletopMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b211a,
      metalness: 0.04,
      roughness: 0.88
    });
    const tabletop = new THREE.Mesh(tabletopGeometry, tabletopMaterial);
    const coins = FALLBACK_FACES.map((face, index) => {
      const coin = new THREE.Mesh(coinGeometry, coinMaterial);

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

    const resizeRenderer = () => {
      const width = mount.clientWidth || SCENE_WIDTH;
      const height = mount.clientHeight || SCENE_HEIGHT;

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resizeRenderer();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resizeRenderer);
      resizeObserver.observe(mount);
    } else {
      window.addEventListener('resize', resizeRenderer);
    }

    let animationFrame = 0;
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

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resizeRenderer);

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }

      coinGeometry.dispose();
      coinMaterial.dispose();
      tabletopGeometry.dispose();
      disposeMaterial(tabletopMaterial);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!pendingToss) {
      tossStartedAtRef.current = null;
      return undefined;
    }

    tossStartedAtRef.current = getTime();
    coinTargetsRef.current = pendingToss.faces.map(targetRotationForFace);

    const timeoutId = window.setTimeout(() => {
      tossStartedAtRef.current = null;
      onTossSettled();
    }, SETTLE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [onTossSettled, pendingToss]);

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
    <section className="tabletopScene" aria-label="铜钱桌面">
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
