// Deterministic seeded randomness for physical perturbation only.
//
// The seed stream may only influence physical variables (friction,
// restitution, micro tilt, micro offsets). It must never be mapped
// directly onto coin faces.

export interface SeededRandom {
  (): number;
}

export function createSeededRandom(seed: number): SeededRandom {
  let value = seed >>> 0;

  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const GAUSSIAN_MAX_SIGMA = 2.4;

export function randomGaussianOffset(
  random: SeededRandom,
  maxMagnitude: number,
  maxSigma = GAUSSIAN_MAX_SIGMA
): number {
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
  const boundedGaussian = Math.min(Math.max(gaussian, -maxSigma), maxSigma);

  return (boundedGaussian / maxSigma) * maxMagnitude;
}
