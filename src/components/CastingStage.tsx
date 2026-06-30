import { useEffect, useRef, useState } from 'react';
import {
  createGestureGate,
  createMediaPipeRecognizer,
  getTopGesture,
  type RecognizedGesture,
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

const GESTURE_LABELS: Record<RecognizedGesture, string> = {
  None: '未检测到手势',
  Closed_Fist: '已识别握拳',
  Open_Palm: '已识别张掌',
  Pointing_Up: '已识别指向',
  Thumb_Down: '已识别拇指向下',
  Thumb_Up: '已识别拇指向上',
  Victory: '已识别胜利手势',
  ILoveYou: '已识别 I Love You 手势'
};

function getGestureInstruction(gesture: RecognizedGesture): string {
  if (gesture === 'Closed_Fist') {
    return '已识别握拳，请张开手掌完成一掷';
  }

  if (gesture === 'Open_Palm') {
    return '已识别张掌；若未记爻，请先握拳再张开';
  }

  return '请先握拳，再张开手掌完成一次掷钱';
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
  const lastGestureRef = useRef<RecognizedGesture>('None');
  const [cameraState, setCameraState] = useState('正在启动摄像头');
  const [flash, setFlash] = useState(false);
  const [lastGesture, setLastGesture] = useState<RecognizedGesture>('None');

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

      if (gesture !== lastGestureRef.current) {
        lastGestureRef.current = gesture;
        setLastGesture(gesture);
        setCameraState(getGestureInstruction(gesture));
      }

      if (gate.update(gesture, performance.now())) {
        pulse();
        setCameraState('已记一爻，请继续下一次');
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

        setCameraState('请先握拳，再张开手掌完成一次掷钱');
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

      <div className={flash ? 'cameraFrame cameraFrameActive' : 'cameraFrame'} role="group" aria-label="手势识别区">
        <video ref={videoRef} className="cameraVideo" muted playsInline aria-hidden="true" />
        <div className="gestureScanner" aria-live="polite">
          <span className="gestureRing" aria-hidden="true">
            <span className="gestureCore">{currentThrow}</span>
          </span>
          <p className="cameraHint">{cameraState}</p>
          <p className="gestureStatus">当前状态：{GESTURE_LABELS[lastGesture]}</p>
        </div>
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
