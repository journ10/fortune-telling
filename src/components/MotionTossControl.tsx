import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createDeviceMotionTossDetector,
  createMotionPerturbationSeed,
  type DeviceMotionSample
} from '../motion/deviceMotionToss';
import { createMotionPhysicalTossInput, type PhysicalTossInput } from '../physics/physicalTossInput';

interface MotionTossControlProps {
  currentThrow: number;
  isCasting: boolean;
  isTossing: boolean;
  onMotionDrive?: (energy: number) => void;
  onPhysicalTossRequest: (input: PhysicalTossInput) => void;
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
  const gravityDelta =
    gravityVector && previousGravityVector
      ? {
          x: gravityVector.x - previousGravityVector.x,
          y: gravityVector.y - previousGravityVector.y,
          z: gravityVector.z - previousGravityVector.z
        }
      : null;
  let accelerationMagnitude = acceleration ? vectorMagnitude(acceleration) : 0;

  if (!acceleration && gravityDelta) {
    accelerationMagnitude = vectorMagnitude(gravityDelta);
  }

  return {
    nextGravityVector: gravityVector,
    sample: {
      timestamp: Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now(),
      accelerationMagnitude,
      accelerationVector: acceleration
        ? [acceleration.x, acceleration.y, acceleration.z]
        : gravityDelta
          ? [gravityDelta.x, gravityDelta.y, gravityDelta.z]
          : [0, 0, 0],
      rotationMagnitude: readRotationMagnitude(event.rotationRate),
      rotationVector: [
        readAxis(event.rotationRate?.alpha) ?? 0,
        readAxis(event.rotationRate?.beta) ?? 0,
        readAxis(event.rotationRate?.gamma) ?? 0
      ]
    }
  };
}

export default function MotionTossControl({
  currentThrow,
  isCasting,
  isTossing,
  onMotionDrive,
  onPhysicalTossRequest
}: MotionTossControlProps) {
  const [mode, setMode] = useState<MotionMode>('prompt');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const detectorRef = useRef(createDeviceMotionTossDetector());
  const currentThrowRef = useRef(currentThrow);
  const hasStartedRef = useRef(false);
  const hasReleasedRef = useRef(false);
  const isListeningRef = useRef(false);
  const isTossingRef = useRef(isTossing);
  const previousIsTossingRef = useRef(isTossing);
  const lastGravityVectorRef = useRef<MotionVector | null>(null);
  const onMotionDriveRef = useRef(onMotionDrive);
  const onPhysicalTossRequestRef = useRef(onPhysicalTossRequest);
  const permissionTokenRef = useRef(0);

  useEffect(() => {
    currentThrowRef.current = currentThrow;
  }, [currentThrow]);

  useEffect(() => {
    const wasTossing = previousIsTossingRef.current;

    isTossingRef.current = isTossing;

    if (!isTossing && (wasTossing || hasReleasedRef.current)) {
      detectorRef.current.reset();
      hasStartedRef.current = false;
      hasReleasedRef.current = false;
      lastGravityVectorRef.current = null;
    }

    previousIsTossingRef.current = isTossing;
  }, [currentThrow, isTossing]);

  useEffect(() => {
    onMotionDriveRef.current = onMotionDrive;
  }, [onMotionDrive]);

  useEffect(() => {
    onPhysicalTossRequestRef.current = onPhysicalTossRequest;
  }, [onPhysicalTossRequest]);

  const handleDeviceMotion = useCallback((event: DeviceMotionEvent) => {
    if (isTossingRef.current) {
      return;
    }

    const { nextGravityVector, sample } = createSampleFromEvent(event, lastGravityVectorRef.current);
    lastGravityVectorRef.current = nextGravityVector;

    const result = detectorRef.current.update(sample);

    onMotionDriveRef.current?.(result.energy);

    if (result.state === 'shaking' && !hasStartedRef.current && !isTossingRef.current) {
      hasStartedRef.current = true;
    }

    if (result.state === 'released' && result.summary && hasStartedRef.current && !hasReleasedRef.current) {
      hasReleasedRef.current = true;
      onPhysicalTossRequestRef.current(
        createMotionPhysicalTossInput({
          currentThrow: currentThrowRef.current,
          durationMs: result.summary.durationMs,
          energy: result.summary.energy,
          digest: result.summary.digest,
          peakCount: result.summary.peakCount,
          dominantAcceleration: result.summary.dominantAcceleration,
          rotationBias: result.summary.rotationBias,
          perturbationSeed: createMotionPerturbationSeed()
        })
      );
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
