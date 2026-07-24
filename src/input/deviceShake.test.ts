import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceMotionSample } from './deviceShakeDetector';
import {
  createDeviceShakeTracker,
  detectMotionSupport,
  requestMotionPermission
} from './deviceShake';

function shakeSample(timestamp: number, strength = 1): DeviceMotionSample {
  return {
    timestamp,
    accelerationMagnitude: 20 * strength,
    accelerationVector: [18 * strength, 4, 2],
    rotationMagnitude: 140 * strength,
    rotationVector: [120 * strength, 40, 55]
  };
}

function quietSample(timestamp: number): DeviceMotionSample {
  return { timestamp, accelerationMagnitude: 0.1, rotationMagnitude: 0.5 };
}

const CONTEXT = { currentThrow: 2, perturbationSeed: 0xabc001 };

describe('deviceShakeTracker', () => {
  it('walks idle → charging → armed → released and produces a motion PhysicalTossInput', () => {
    const tracker = createDeviceShakeTracker({ quietWindowMs: 600 });

    expect(tracker.update(quietSample(0), CONTEXT).phase).toBe('idle');

    const first = tracker.update(shakeSample(60), CONTEXT);
    expect(first.phase).toBe('charging');
    expect(first.readyToRelease).toBe(false);
    expect(first.input).toBeNull();

    const second = tracker.update(shakeSample(140), CONTEXT);
    expect(second.phase).toBe('armed');
    expect(second.readyToRelease).toBe(true);

    const released = tracker.update(quietSample(800), CONTEXT);
    expect(released.phase).toBe('released');
    expect(released.input).not.toBeNull();
    expect(released.input?.source).toBe('motion');
    expect(released.input?.currentThrow).toBe(2);
    expect(released.input?.coins).toHaveLength(3);
    expect('faces' in (released.input ?? {})).toBe(false);
    expect(released.summary?.peakCount).toBeGreaterThanOrEqual(1);
  });

  it('resets after release and completes six consecutive tosses', () => {
    const tracker = createDeviceShakeTracker({ quietWindowMs: 500 });

    for (let toss = 1; toss <= 6; toss += 1) {
      const base = toss * 2000;
      tracker.update(shakeSample(base), { ...CONTEXT, currentThrow: toss });
      tracker.update(shakeSample(base + 100), { ...CONTEXT, currentThrow: toss });
      const released = tracker.update(quietSample(base + 700), {
        ...CONTEXT,
        currentThrow: toss
      });

      expect(released.phase).toBe('released');
      expect(released.input?.currentThrow).toBe(toss);

      tracker.reset();
      expect(tracker.phase()).toBe('idle');
    }
  });

  it('discards a too-weak gesture instead of releasing a fabricated toss', () => {
    const tracker = createDeviceShakeTracker({ quietWindowMs: 400, minReleaseEnergy: 5 });

    tracker.update(shakeSample(0, 0.6), { ...CONTEXT });
    const result = tracker.update(quietSample(500), CONTEXT);

    // One weak shake never reaches the release energy floor.
    expect(result.phase).toBe('idle');
    expect(result.input).toBeNull();
    expect(tracker.phase()).toBe('idle');
  });

  it('reports growing energy levels for HUD feedback', () => {
    const tracker = createDeviceShakeTracker();

    const first = tracker.update(shakeSample(0), CONTEXT);
    const second = tracker.update(shakeSample(80), CONTEXT);

    expect(second.energyLevel).toBeGreaterThan(first.energyLevel);
    expect(second.energyLevel).toBeLessThanOrEqual(1);
  });
});

describe('motion permission flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects unsupported environments', async () => {
    vi.stubGlobal('DeviceMotionEvent', undefined);

    expect(detectMotionSupport()).toBe('unsupported');
    expect(await requestMotionPermission()).toBe('unsupported');
  });

  it('detects sensors that need no permission (Android-style)', async () => {
    vi.stubGlobal('DeviceMotionEvent', class {});

    expect(detectMotionSupport()).toBe('available');
    expect(await requestMotionPermission()).toBe('granted');
  });

  it('runs the iOS requestPermission flow and maps the response', async () => {
    const grant = { requestPermission: vi.fn().mockResolvedValue('granted') };
    vi.stubGlobal('DeviceMotionEvent', grant);

    expect(detectMotionSupport()).toBe('needs-permission');
    expect(await requestMotionPermission()).toBe('granted');

    const deny = { requestPermission: vi.fn().mockResolvedValue('denied') };
    vi.stubGlobal('DeviceMotionEvent', deny);
    expect(await requestMotionPermission()).toBe('denied');

    const throwing = { requestPermission: vi.fn().mockRejectedValue(new Error('nope')) };
    vi.stubGlobal('DeviceMotionEvent', throwing);
    expect(await requestMotionPermission()).toBe('denied');
  });
});
