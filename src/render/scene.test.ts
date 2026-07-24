// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cameraDistanceScale } from './scene';

describe('cameraDistanceScale', () => {
  it('keeps the base distance on landscape desktop aspect ratios', () => {
    expect(cameraDistanceScale(16 / 9)).toBe(1);
    expect(cameraDistanceScale(1.35)).toBe(1);
  });

  it('pulls the camera back on narrow portrait screens so coins are not cropped', () => {
    // 390x844 portrait
    const portrait = cameraDistanceScale(390 / 844);
    expect(portrait).toBeGreaterThan(1.8);
    expect(portrait).toBeLessThanOrEqual(2.1);
  });

  it('clamps extreme aspects', () => {
    expect(cameraDistanceScale(0.1)).toBeLessThanOrEqual(2.1);
    expect(cameraDistanceScale(0)).toBeLessThanOrEqual(2.1);
  });
});
