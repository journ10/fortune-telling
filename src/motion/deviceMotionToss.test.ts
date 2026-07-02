import { describe, expect, it } from 'vitest';
import { createDeviceMotionTossDetector } from './deviceMotionToss';

describe('createDeviceMotionTossDetector', () => {
  it('enters shaking when magnitude-based motion energy crosses the start threshold', () => {
    const detector = createDeviceMotionTossDetector();

    expect(
      detector.update({ timestamp: 0, accelerationMagnitude: 0.2, rotationMagnitude: 0 })
    ).toMatchObject({ state: 'idle' });

    const result = detector.update({
      timestamp: 80,
      accelerationMagnitude: 18,
      rotationMagnitude: 160
    });

    expect(result.state).toBe('shaking');
    expect(result.energy).toBeGreaterThan(1);
    expect(result.digest).toBeGreaterThan(0);
  });

  it('releases after a quiet window following shaking', () => {
    const detector = createDeviceMotionTossDetector({ quietWindowMs: 600 });

    detector.update({ timestamp: 0, accelerationMagnitude: 20, rotationMagnitude: 140 });
    detector.update({ timestamp: 120, accelerationMagnitude: 22, rotationMagnitude: 110 });

    expect(
      detector.update({ timestamp: 820, accelerationMagnitude: 0.3, rotationMagnitude: 1 })
    ).toMatchObject({ state: 'released' });
  });

  it('does not depend on one acceleration axis to detect shaking', () => {
    const detector = createDeviceMotionTossDetector();

    expect(
      detector.update({ timestamp: 40, accelerationMagnitude: 0, rotationMagnitude: 260 })
    ).toMatchObject({ state: 'shaking' });
  });

  it('produces a deterministic motion digest from sampled energy', () => {
    const first = createDeviceMotionTossDetector();
    const second = createDeviceMotionTossDetector();
    const samples = [
      { timestamp: 0, accelerationMagnitude: 18, rotationMagnitude: 90 },
      { timestamp: 120, accelerationMagnitude: 21, rotationMagnitude: 140 },
      { timestamp: 900, accelerationMagnitude: 0, rotationMagnitude: 0 }
    ];

    let firstReleased = first.update(samples[0]);
    let secondReleased = second.update(samples[0]);

    for (const sample of samples.slice(1)) {
      firstReleased = first.update(sample);
      secondReleased = second.update(sample);
    }

    expect(firstReleased.state).toBe('released');
    expect(firstReleased.digest).toBeGreaterThan(0);
    expect(secondReleased.digest).toBe(firstReleased.digest);
  });

  it('resets state, energy, and digest for a new toss', () => {
    const detector = createDeviceMotionTossDetector();

    detector.update({ timestamp: 0, accelerationMagnitude: 18, rotationMagnitude: 90 });
    detector.update({ timestamp: 900, accelerationMagnitude: 0, rotationMagnitude: 0 });
    detector.reset();

    expect(
      detector.update({ timestamp: 1000, accelerationMagnitude: 0, rotationMagnitude: 0 })
    ).toEqual({ state: 'idle', energy: 0, digest: 0 });
  });
});
