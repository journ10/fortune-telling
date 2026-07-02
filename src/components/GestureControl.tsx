import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGestureGate,
  createMediaPipeRecognizer,
  getTopGesture,
  startCamera,
  stopCamera,
  type GestureGate
} from '../camera/gestureRecognizer';

interface GestureControlProps {
  isCasting: boolean;
  isTossing: boolean;
  onUseTabletopToss: () => void;
}

type GestureMode = 'prompt' | 'starting' | 'active' | 'error' | 'dismissed';
type GestureRecognizerInstance = Awaited<ReturnType<typeof createMediaPipeRecognizer>>;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '摄像头启动失败，请重试或改用桌面投掷。';
}

export default function GestureControl({
  isCasting,
  isTossing,
  onUseTabletopToss
}: GestureControlProps) {
  const [mode, setMode] = useState<GestureMode>('prompt');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognizerRef = useRef<GestureRecognizerInstance | null>(null);
  const gateRef = useRef<GestureGate | null>(null);
  const frameRef = useRef<number | null>(null);
  const startupTokenRef = useRef(0);
  const isTossingRef = useRef(isTossing);
  const onUseTabletopTossRef = useRef(onUseTabletopToss);

  useEffect(() => {
    isTossingRef.current = isTossing;
  }, [isTossing]);

  useEffect(() => {
    onUseTabletopTossRef.current = onUseTabletopToss;
  }, [onUseTabletopToss]);

  const cleanupSession = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (streamRef.current) {
      stopCamera(streamRef.current);
      streamRef.current = null;
    }

    const recognizer = recognizerRef.current as
      | (GestureRecognizerInstance & { close?: () => void })
      | null;
    recognizer?.close?.();
    recognizerRef.current = null;
    gateRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleUseTabletopToss = useCallback(() => {
    startupTokenRef.current += 1;
    cleanupSession();
    setMode('dismissed');
    onUseTabletopTossRef.current();
  }, [cleanupSession]);

  const runRecognitionLoop = useCallback(() => {
    const video = videoRef.current;
    const recognizer = recognizerRef.current;
    const gate = gateRef.current;

    if (video && recognizer && gate && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const timestamp = performance.now();
      const result = recognizer.recognizeForVideo(video, timestamp);
      const gesture = getTopGesture(result);

      if (!isTossingRef.current && gate.update(gesture, timestamp)) {
        handleUseTabletopToss();
        return;
      }
    }

    frameRef.current = requestAnimationFrame(runRecognitionLoop);
  }, [handleUseTabletopToss]);

  const handleEnableCamera = useCallback(async () => {
    const video = videoRef.current;

    if (!video) {
      setErrorMessage('摄像头预览尚未准备好，请重试或改用桌面投掷。');
      setMode('error');
      return;
    }

    const startupToken = startupTokenRef.current + 1;
    startupTokenRef.current = startupToken;
    cleanupSession();
    setErrorMessage(null);
    setMode('starting');

    try {
      const stream = await startCamera(video);

      if (startupTokenRef.current !== startupToken) {
        stopCamera(stream);
        return;
      }

      streamRef.current = stream;
      const recognizer = await createMediaPipeRecognizer();

      if (startupTokenRef.current !== startupToken) {
        (recognizer as GestureRecognizerInstance & { close?: () => void }).close?.();
        return;
      }

      recognizerRef.current = recognizer;
      gateRef.current = createGestureGate(1500);
      setMode('active');
      frameRef.current = requestAnimationFrame(runRecognitionLoop);
    } catch (error) {
      if (startupTokenRef.current !== startupToken) {
        return;
      }

      cleanupSession();
      setErrorMessage(getErrorMessage(error));
      setMode('error');
    }
  }, [cleanupSession, runRecognitionLoop]);

  useEffect(() => {
    if (!isCasting) {
      startupTokenRef.current += 1;
      cleanupSession();
      setErrorMessage(null);
      setMode('prompt');
    }
  }, [cleanupSession, isCasting]);

  useEffect(() => cleanupSession, [cleanupSession]);

  if (!isCasting || mode === 'dismissed') {
    return null;
  }

  const isActive = mode === 'active';
  const isStarting = mode === 'starting';
  const isError = mode === 'error';

  return (
    <aside
      aria-labelledby="gesture-control-title"
      className={isActive ? 'gesturePanel gesturePanel-active' : 'gesturePanel'}
      role="dialog"
    >
      <h2 id="gesture-control-title">手势投掷</h2>

      <video
        ref={videoRef}
        aria-label="摄像头预览"
        autoPlay
        className="gesturePreview"
        hidden={!isActive && !isStarting}
        muted
        playsInline
      />

      {isActive ? (
        <>
          <p className="gestureStatus" role="status">
            摄像头已启用
          </p>
          <p className="gestureStatus">握拳后张开手，将改用桌面投掷。</p>
        </>
      ) : null}

      {isStarting ? (
        <p className="gestureStatus" role="status">
          正在启用摄像头
        </p>
      ) : null}

      {isError && errorMessage ? (
        <p className="gestureStatus" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="gestureActions">
        {isError ? (
          <button className="primaryButton" type="button" onClick={handleEnableCamera}>
            重试摄像头
          </button>
        ) : (
          <button
            className="primaryButton"
            disabled={isActive || isStarting}
            type="button"
            onClick={handleEnableCamera}
          >
            {isStarting ? '启用中' : '启用摄像头'}
          </button>
        )}

        <button className="secondaryButton" type="button" onClick={handleUseTabletopToss}>
          改用桌面投掷
        </button>
      </div>
    </aside>
  );
}
