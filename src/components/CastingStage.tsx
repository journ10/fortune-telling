import { useEffect, useRef, useState } from 'react';
import {
  createGestureGate,
  createMediaPipeRecognizer,
  getTopGesture,
  startCamera,
  stopCamera
} from '../camera/gestureRecognizer';
import type { CastLine, CoinToss } from '../domain/types';
import CoinAnimation from './CoinAnimation';
import HexagramLines from './HexagramLines';
import PrivacyNotice from './PrivacyNotice';

interface CastingStageProps {
  question: string;
  currentThrow: number;
  tosses: CoinToss[];
  lines: CastLine[];
  onManualToss: () => void;
}

export default function CastingStage({
  question,
  currentThrow,
  tosses,
  lines,
  onManualToss
}: CastingStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const flashTimeoutRef = useRef<number | undefined>(undefined);
  const [cameraState, setCameraState] = useState('正在启动摄像头');
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return undefined;
    }

    const gate = createGestureGate(1500);
    let animationFrame = 0;
    let active = true;
    let stream: MediaStream | undefined;
    let recognizer: Awaited<ReturnType<typeof createMediaPipeRecognizer>> | undefined;

    const pulse = () => {
      setFlash(true);

      if (flashTimeoutRef.current !== undefined) {
        window.clearTimeout(flashTimeoutRef.current);
      }

      flashTimeoutRef.current = window.setTimeout(() => {
        setFlash(false);
        flashTimeoutRef.current = undefined;
      }, 260);
    };

    const loop = () => {
      if (!active || !recognizer) {
        return;
      }

      const result = recognizer.recognizeForVideo(video, performance.now());
      const gesture = getTopGesture(result);

      if (gate.update(gesture, performance.now())) {
        pulse();
        onManualToss();
      }

      animationFrame = window.requestAnimationFrame(loop);
    };

    const bootCamera = async () => {
      try {
        stream = await startCamera(video);

        if (!active) {
          stopCamera(stream);
          return;
        }

        recognizer = await createMediaPipeRecognizer();

        if (!active) {
          recognizer.close();
          return;
        }

        setCameraState('握拳后张开，完成一次掷钱');
        animationFrame = window.requestAnimationFrame(loop);
      } catch (error) {
        if (!active) {
          return;
        }

        if (stream) {
          stopCamera(stream);
          stream = undefined;
        }

        setCameraState(error instanceof Error ? error.message : '摄像头不可用，请使用手动掷钱');
      }
    };

    void bootCamera();

    return () => {
      active = false;

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      if (flashTimeoutRef.current !== undefined) {
        window.clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = undefined;
      }

      if (recognizer) {
        recognizer.close();
      }

      if (stream) {
        stopCamera(stream);
      }
    };
  }, [onManualToss]);

  return (
    <section className="castingPanel" aria-labelledby="casting-title">
      <p className="eyebrow">六次掷钱</p>
      <h1 id="casting-title">第 {currentThrow} 掷 / 共 6 掷</h1>
      <p className="questionEcho">{question}</p>

      <div className={flash ? 'cameraFrame cameraFrameActive' : 'cameraFrame'}>
        <video ref={videoRef} className="cameraVideo" aria-label="摄像头预览" muted playsInline />
        <p className="cameraHint">{cameraState}</p>
      </div>

      <CoinAnimation latestToss={tosses.at(-1)} />
      <HexagramLines lines={lines} />

      <button className="primaryButton" type="button" onClick={onManualToss}>
        手动掷一次
      </button>

      <PrivacyNotice />
    </section>
  );
}
