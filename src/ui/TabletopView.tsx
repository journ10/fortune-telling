// TabletopView: the 3D table surface. It renders the scene, syncs coin
// meshes from physics snapshots while a toss is in flight, and forwards
// pointer gestures to the casting controller. It never learns about
// faces, scores, or results.

import { useEffect, useRef, useState } from 'react';
import type { CastingPhase } from '../casting/castingMachine';
import { chargingCoinPose, createCoinViews, idleCoinPose, type CoinView } from '../render/coinView';
import { createTabletopScene, type TabletopSceneHandle } from '../render/scene';
import type { CoinTossSimulationSnapshot } from '../physics/tossSimulation';
import type { ActiveToss } from '../app/useCastingController';

interface TabletopViewProps {
  phase: CastingPhase;
  physicsReady: boolean;
  activeToss: ActiveToss | null;
  chargeEnergy: number;
  resetNonce: number;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onSimulationSettled: (settled: NonNullable<CoinTossSimulationSnapshot['settledToss']>) => void;
}

export default function TabletopView({
  phase,
  physicsReady,
  activeToss,
  chargeEnergy,
  resetNonce,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onSimulationSettled
}: TabletopViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<TabletopSceneHandle | null>(null);
  const coinsRef = useRef<CoinView[] | null>(null);
  const restPoseRef = useRef<CoinTossSimulationSnapshot['coins'] | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  // Latest props for the animation loop.
  const loopStateRef = useRef({ phase, activeToss, chargeEnergy, onSimulationSettled });
  loopStateRef.current = { phase, activeToss, chargeEnergy, onSimulationSettled };

  useEffect(() => {
    restPoseRef.current = null;
  }, [resetNonce]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;

    if (!container || !canvas) {
      return undefined;
    }

    let handle: TabletopSceneHandle | null = null;

    try {
      handle = createTabletopScene(canvas);
      sceneRef.current = handle;
      coinsRef.current = createCoinViews(handle.scene, 3);
    } catch (error) {
      console.error('WebGL 初始化失败', error);
      setWebglFailed(true);
    }

    const resize = () => {
      const rect = container.getBoundingClientRect();
      handle?.resize(rect.width, rect.height);
    };
    resize();

    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(container);
    } else {
      window.addEventListener('resize', resize);
    }

    let animationFrame = 0;
    let previousTime = performance.now();
    const startedAt = previousTime;
    // prefers-reduced-motion：静置不摆动，蓄力仅保留少量姿态反馈。
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const idleMotionScale = reducedMotion ? 0 : 1;
    const chargingMotionScale = reducedMotion ? 0.25 : 1;

    const loop = (now: number) => {
      animationFrame = window.requestAnimationFrame(loop);
      const deltaSeconds = Math.min((now - previousTime) / 1000, 0.1);
      previousTime = now;
      const elapsedSeconds = (now - startedAt) / 1000;
      const coins = coinsRef.current;
      const { phase: currentPhase, activeToss: toss, chargeEnergy: energy } = loopStateRef.current;

      if (coins) {
        if (toss) {
          const snapshot = toss.simulation.step(deltaSeconds);
          snapshot.coins.forEach((coin, index) => {
            coins[index].setPose(coin.position, coin.rotation);
          });

          if (snapshot.settledToss) {
            restPoseRef.current = snapshot.coins;
            loopStateRef.current.onSimulationSettled(snapshot.settledToss);
          }
        } else if (currentPhase === 'charging') {
          restPoseRef.current = null;
          coins.forEach((coin, index) => {
            const pose = chargingCoinPose(index, elapsedSeconds, energy, chargingMotionScale);
            coin.setPose(pose.position, pose.rotation);
          });
        } else if (restPoseRef.current) {
          coins.forEach((coin, index) => {
            const rest = restPoseRef.current?.[index];
            if (rest) {
              coin.setPose(rest.position, rest.rotation);
            }
          });
        } else {
          coins.forEach((coin, index) => {
            const pose = idleCoinPose(index, elapsedSeconds, idleMotionScale);
            coin.setPose(pose.position, pose.rotation);
          });
        }
      }

      handle?.render();
    };

    animationFrame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      coinsRef.current?.forEach((coin) => coin.dispose());
      coinsRef.current = null;
      handle?.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="tabletopView"
      data-testid="tabletop-view"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role="application"
      aria-label="铜钱桌面：按住摇动，松手掷出"
    >
      <canvas ref={canvasRef} className="tabletopCanvas" />
      {webglFailed ? (
        <div className="webglFallback" role="alert">
          当前环境无法初始化 3D 桌面（WebGL 不可用）。投掷与结果仍可通过键盘完成。
        </div>
      ) : null}
      {!physicsReady && !webglFailed ? (
        <div className="physicsLoading">物理引擎加载中…</div>
      ) : null}
    </div>
  );
}
