import { describe, expect, it } from 'vitest';
import { createDeviceMotionTossDetector } from './deviceMotionToss';

describe('createDeviceMotionTossDetector', () => {
  it('enters shaking when magnitude-based motion energy crosses the start threshold', () => {
    const detector = createDeviceMotionTossDetector();

    expect(
      detector.update({ timestamp: 0, accelerationMagnitude: 0.2, rotationMagnitude: 0 })
    ).toMatchObject({ state: 'idle', summary: null });

    const result = detector.update({
      timestamp: 80,
      accelerationMagnitude: 18,
      rotationMagnitude: 160
    });

    expect(result.state).toBe('shaking');
    expect(result.energy).toBeGreaterThan(1);
    expect(result.digest).toBeGreaterThan(0);
    expect(result.summary).toBeNull();
  });

  it('releases after a quiet window following shaking', () => {
    const detector = createDeviceMotionTossDetector({ quietWindowMs: 600 });

    detector.update({ timestamp: 0, accelerationMagnitude: 20, rotationMagnitude: 140 });
    detector.update({ timestamp: 120, accelerationMagnitude: 22, rotationMagnitude: 110 });

    expect(
      detector.update({ timestamp: 820, accelerationMagnitude: 0.3, rotationMagnitude: 1 })
    ).toMatchObject({ state: 'released' });
  });

  it('returns a release summary for physical toss mapping', () => {
    const detector = createDeviceMotionTossDetector({ quietWindowMs: 600 });

    detector.update({
      timestamp: 0,
      accelerationMagnitude: 20,
      accelerationVector: [18, 4, 2],
      rotationMagnitude: 140,
      rotationVector: [120, 40, 55]
    });
    detector.update({
      timestamp: 120,
      accelerationMagnitude: 22,
      accelerationVector: [20, 5, 2],
      rotationMagnitude: 110,
      rotationVector: [90, 30, 45]
    });
    const result = detector.update({
      timestamp: 820,
      accelerationMagnitude: 0.2,
      accelerationVector: [0.2, 0, 0],
      rotationMagnitude: 1,
      rotationVector: [1, 0, 0]
    });

    expect(result.state).toBe('released');
    expect(result.summary).toMatchObject({
      durationMs: 820,
      peakCount: expect.any(Number),
      dominantAcceleration: expect.any(Array),
      rotationBias: expect.any(Array),
      digest: expect.any(Number)
    });
    expect(result.summary?.energy).toBeGreaterThan(0);
  });

  it('keeps below-stop quiet samples out of the release summary', () => {
    const detector = createDeviceMotionTossDetector({ quietWindowMs: 600 });
    const activeOnlyDetector = createDeviceMotionTossDetector({ quietWindowMs: 600 });
    const activeSamples = [
      {
        timestamp: 0,
        accelerationMagnitude: 20,
        accelerationVector: [20, 0, 0] as [number, number, number],
        rotationMagnitude: 120,
        rotationVector: [120, 0, 0] as [number, number, number]
      },
      {
        timestamp: 120,
        accelerationMagnitude: 18,
        accelerationVector: [18, 0, 0] as [number, number, number],
        rotationMagnitude: 90,
        rotationVector: [90, 0, 0] as [number, number, number]
      }
    ];
    const releaseSample = {
      timestamp: 820,
      accelerationMagnitude: 0,
      accelerationVector: [0, 0, 0] as [number, number, number],
      rotationMagnitude: 0,
      rotationVector: [0, 0, 0] as [number, number, number]
    };

    for (const sample of activeSamples) {
      detector.update(sample);
      activeOnlyDetector.update(sample);
    }

    for (let timestamp = 180; timestamp < 720; timestamp += 60) {
      detector.update({
        timestamp,
        accelerationMagnitude: 1.2,
        accelerationVector: [0, 30, 0],
        rotationMagnitude: 12,
        rotationVector: [700, 800, 900]
      });
    }

    const result = detector.update(releaseSample);
    const activeOnlyResult = activeOnlyDetector.update(releaseSample);

    expect(result.state).toBe('released');
    expect(activeOnlyResult.state).toBe('released');
    expect(result.summary).toMatchObject({
      durationMs: 820,
      peakCount: 1
    });
    expect(activeOnlyResult.summary).toMatchObject({
      durationMs: 820,
      peakCount: 1
    });
    expect(result.summary?.energy).toBeCloseTo(activeOnlyResult.summary?.energy ?? 0, 5);
    expect(result.summary?.digest).toBe(activeOnlyResult.summary?.digest);
    expect(result.summary?.dominantAcceleration).toEqual(
      activeOnlyResult.summary?.dominantAcceleration
    );
    expect(result.summary?.rotationBias).toEqual(activeOnlyResult.summary?.rotationBias);
  });

  it('does not depend on one acceleration axis to detect shaking', () => {
    const detector = createDeviceMotionTossDetector();

    expect(
      detector.update({ timestamp: 40, accelerationMagnitude: 0, rotationMagnitude: 260 })
    ).toMatchObject({ state: 'shaking', summary: null });
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
    ).toEqual({ state: 'idle', energy: 0, digest: 0, summary: null });
  });
});
