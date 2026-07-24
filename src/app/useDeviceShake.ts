// Wires device shake detection into the casting controller.
//
// Permission is requested only from an explicit user tap; denial or
// missing sensors degrade to the touch chamber without blocking. The
// detector resets after every release, so six tosses in a row need no
// re-authorization.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createDeviceShakeTracker,
  createSampleFromDeviceMotionEvent,
  detectMotionSupport,
  requestMotionPermission,
  type DeviceShakeTracker,
  type MotionPermissionState
} from '../input/deviceShake';
import type { CastingController } from './useCastingController';

export interface DeviceShakeState {
  /** Whether the motion panel should be offered at all (touch device + sensors exist). */
  offered: boolean;
  permission: MotionPermissionState;
  /** True while devicemotion listening is active. */
  listening: boolean;
  requestPermission: () => void;
}

function isCoarsePointer(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  );
}

function nextPerturbationSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

export function useDeviceShake(controller: CastingController): DeviceShakeState {
  const [offered] = useState(() => isCoarsePointer() && detectMotionSupport() !== 'unsupported');
  const [permission, setPermission] = useState<MotionPermissionState>(() => {
    const support = detectMotionSupport();
    return support === 'unsupported' ? 'unsupported' : 'prompt';
  });
  const [listening, setListening] = useState(false);
  const trackerRef = useRef<DeviceShakeTracker | null>(null);
  const gravityRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const holdsChargeRef = useRef(false);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const requestPermission = useCallback(() => {
    setPermission('requesting');

    void requestMotionPermission().then((response) => {
      if (response === 'granted') {
        setPermission('granted');
        setListening(true);
        return;
      }

      // Denied or unsupported: stay on the touch chamber path.
      setPermission(response === 'unsupported' ? 'unsupported' : 'denied');
    });
  }, []);

  useEffect(() => {
    if (!listening) {
      return undefined;
    }

    trackerRef.current = createDeviceShakeTracker();

    const onMotion = (event: DeviceMotionEvent) => {
      const tracker = trackerRef.current;
      const current = controllerRef.current;

      if (!tracker) {
        return;
      }

      const { nextGravityVector, sample } = createSampleFromDeviceMotionEvent(
        event,
        gravityRef.current
      );
      gravityRef.current = nextGravityVector;

      const update = tracker.update(sample, {
        currentThrow: current.session.machine.throwIndex,
        perturbationSeed: nextPerturbationSeed()
      });

      if (update.phase === 'charging' || update.phase === 'armed') {
        if (!holdsChargeRef.current) {
          // Another input path may own the charge; ignore this gesture.
          if (!current.startExternalCharge()) {
            return;
          }
          holdsChargeRef.current = true;
        }
        current.setExternalEnergy(update.energyLevel);
        return;
      }

      if (update.phase === 'released' && update.input) {
        if (holdsChargeRef.current) {
          current.releaseExternalToss(update.input);
        }
        holdsChargeRef.current = false;
        // Reset so the next shake can start immediately (six tosses, no re-auth).
        tracker.reset();
        return;
      }

      if (update.phase === 'idle' && holdsChargeRef.current) {
        // Gesture discarded (too weak): hand the charge back to idle/ready.
        holdsChargeRef.current = false;
        current.cancelExternalCharge();
        tracker.reset();
        return;
      }
    };

    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      trackerRef.current = null;
      gravityRef.current = null;
      holdsChargeRef.current = false;
    };
  }, [listening]);

  // If a toss completes or resets while a charge was held by shake, drop the hold.
  useEffect(() => {
    if (controller.phase !== 'charging') {
      holdsChargeRef.current = false;
    }
  }, [controller.phase]);

  return { offered, permission, listening, requestPermission };
}
