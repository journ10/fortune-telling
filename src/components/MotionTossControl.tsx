import { useCallback, useEffect, useRef, useState } from 'react';
import { createDeviceMotionTossDetector, type DeviceMotionSample } from '../motion/deviceMotionToss';

interface MotionTossControlProps {
  isCasting: boolean;
  isTossing: boolean;
  onMotionDrive?: (energy: number) => void;
  onMotionShakeStart: (seedMix: number) => void;
  onMotionRelease: (digest: number) => void;
}

type MotionMode = 'prompt' | 'requesting' | 'active' | 'error';
type MotionPermissionResponse = 'granted' | 'denied' | 'prompt';
type MotionEventConstructorWithPermission = {
  requestPermission?: () => Promise<MotionPermissionResponse>;
};

interface MotionVector {
  x: number;
  y: number;
  z: number;
}

function getDeviceMotionConstructor(): MotionEventConstructorWithPermission | null {
  if (typeof DeviceMotionEvent === 'undefined') {
    return null;
  }

  return DeviceMotionEvent as unknown as MotionEventConstructorWithPermission;
}

function readAxis(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readVector(vector: DeviceMotionEventAcceleration | null): MotionVector | null {
  if (!vector) {
    return null;
  }

  const x = readAxis(vector.x);
  const y = readAxis(vector.y);
  const z = readAxis(vector.z);

  if (x === null && y === null && z === null) {
    return null;
  }

  return {
    x: x ?? 0,
    y: y ?? 0,
    z: z ?? 0
  };
}

function vectorMagnitude(vector: MotionVector): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function readRotationMagnitude(rotationRate: DeviceMotionEventRotationRate | null): number {
  if (!rotationRate) {
    return 0;
  }

  return Math.hypot(
    readAxis(rotationRate.alpha) ?? 0,
    readAxis(rotationRate.beta) ?? 0,
    readAxis(rotationRate.gamma) ?? 0
  );
}

function createSampleFromEvent(
  event: DeviceMotionEvent,
  previousGravityVector: MotionVector | null
): { nextGravityVector: MotionVector | null; sample: DeviceMotionSample } {
  const acceleration = readVector(event.acceleration);
  const gravityVector = readVector(event.accelerationIncludingGravity);
  let accelerationMagnitude = acceleration ? vectorMagnitude(acceleration) : 0;

  if (!acceleration && gravityVector && previousGravityVector) {
    accelerationMagnitude = vectorMagnitude({
      x: gravityVector.x - previousGravityVector.x,
      y: gravityVector.y - previousGravityVector.y,
      z: gravityVector.z - previousGravityVector.z
    });
  }

  return {
    nextGravityVector: gravityVector,
    sample: {
      timestamp: Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now(),
      accelerationMagnitude,
      rotationMagnitude: readRotationMagnitude(event.rotationRate)
    }
  };
}

export default function MotionTossControl({
  isCasting,
  isTossing,
  onMotionDrive,
  onMotionRelease,
  onMotionShakeStart
}: MotionTossControlProps) {
  const [mode, setMode] = useState<MotionMode>('prompt');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const detectorRef = useRef(createDeviceMotionTossDetector());
  const hasStartedRef = useRef(false);
  const hasReleasedRef = useRef(false);
  const isListeningRef = useRef(false);
  const isTossingRef = useRef(isTossing);
  const lastGravityVectorRef = useRef<MotionVector | null>(null);
  const onMotionDriveRef = useRef(onMotionDrive);
  const onMotionReleaseRef = useRef(onMotionRelease);
  const onMotionShakeStartRef = useRef(onMotionShakeStart);
  const permissionTokenRef = useRef(0);

  useEffect(() => {
    isTossingRef.current = isTossing;
  }, [isTossing]);

  useEffect(() => {
    onMotionDriveRef.current = onMotionDrive;
  }, [onMotionDrive]);

  useEffect(() => {
    onMotionReleaseRef.current = onMotionRelease;
  }, [onMotionRelease]);

  useEffect(() => {
    onMotionShakeStartRef.current = onMotionShakeStart;
  }, [onMotionShakeStart]);

  const handleDeviceMotion = useCallback((event: DeviceMotionEvent) => {
    const { nextGravityVector, sample } = createSampleFromEvent(event, lastGravityVectorRef.current);
    lastGravityVectorRef.current = nextGravityVector;

    const result = detectorRef.current.update(sample);

    onMotionDriveRef.current?.(result.energy);

    if (result.state === 'shaking' && !hasStartedRef.current && !isTossingRef.current) {
      hasStartedRef.current = true;
      onMotionShakeStartRef.current(result.digest);
    }

    if (result.state === 'released' && hasStartedRef.current && !hasReleasedRef.current) {
      hasReleasedRef.current = true;
      onMotionReleaseRef.current(result.digest);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!isListeningRef.current) {
      return;
    }

    window.removeEventListener('devicemotion', handleDeviceMotion);
    isListeningRef.current = false;
  }, [handleDeviceMotion]);

  const startListening = useCallback(() => {
    stopListening();
    detectorRef.current.reset();
    hasStartedRef.current = false;
    hasReleasedRef.current = false;
    lastGravityVectorRef.current = null;
    window.addEventListener('devicemotion', handleDeviceMotion);
    isListeningRef.current = true;
    setErrorMessage(null);
    setMode('active');
  }, [handleDeviceMotion, stopListening]);

  const cleanupSession = useCallback(() => {
    stopListening();
    detectorRef.current.reset();
    hasStartedRef.current = false;
    hasReleasedRef.current = false;
    lastGravityVectorRef.current = null;
  }, [stopListening]);

  const handleEnableMotion = useCallback(async () => {
    const motionConstructor = getDeviceMotionConstructor();

    if (!motionConstructor) {
      setErrorMessage('当前浏览器不支持设备运动事件');
      setMode('error');
      return;
    }

    const permissionToken = permissionTokenRef.current + 1;
    permissionTokenRef.current = permissionToken;
    setErrorMessage(null);
    setMode('requesting');

    try {
      const permission = motionConstructor.requestPermission
        ? await motionConstructor.requestPermission()
        : 'granted';

      if (permissionTokenRef.current !== permissionToken) {
        return;
      }

      if (permission !== 'granted') {
        cleanupSession();
        setErrorMessage('体感权限被拒绝');
        setMode('error');
        return;
      }

      startListening();
    } catch (error) {
      if (permissionTokenRef.current !== permissionToken) {
        return;
      }

      cleanupSession();
      setErrorMessage(error instanceof Error ? error.message : '体感权限请求失败');
      setMode('error');
    }
  }, [cleanupSession, startListening]);

  useEffect(() => {
    if (!isCasting) {
      permissionTokenRef.current += 1;
      cleanupSession();
      setErrorMessage(null);
      setMode('prompt');
    }
  }, [cleanupSession, isCasting]);

  useEffect(() => cleanupSession, [cleanupSession]);

  if (!isCasting) {
    return null;
  }

  const isActive = mode === 'active';
  const isRequesting = mode === 'requesting';
  const isError = mode === 'error';

  return (
    <aside
      aria-labelledby="motion-toss-control-title"
      className={isActive ? 'gesturePanel gesturePanel-active' : 'gesturePanel'}
      role="dialog"
    >
      <h2 id="motion-toss-control-title">手机体感投掷</h2>

      {isActive ? (
        <p className="gestureStatus" role="status">
          体感监听已启用
        </p>
      ) : null}

      {isRequesting ? (
        <p className="gestureStatus" role="status">
          正在请求体感权限
        </p>
      ) : null}

      {isError && errorMessage ? (
        <p className="gestureStatus" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <p className="gestureStatus">摇晃手机后静止即可投掷。</p>

      <div className="gestureActions">
        <button
          className="primaryButton"
          disabled={isActive || isRequesting || isTossing}
          type="button"
          onClick={handleEnableMotion}
        >
          {isRequesting ? '启用中' : isError ? '重试体感投掷' : '启用体感投掷'}
        </button>
      </div>
    </aside>
  );
}
