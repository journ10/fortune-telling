import { describe, expect, it } from 'vitest';
import {
  beginKeyboardCharge,
  cancelKeyboardCharge,
  createKeyboardTossTracker,
  isTossKey,
  sealKeyboardToss,
  summarizeKeyboardEnergy
} from './keyboardToss';

describe('keyboardToss', () => {
  it('recognizes Space and Enter as toss keys', () => {
    expect(isTossKey(' ')).toBe(true);
    expect(isTossKey('Spacebar')).toBe(true);
    expect(isTossKey('Enter')).toBe(true);
    expect(isTossKey('a')).toBe(false);
  });

  it('seals a key hold into a keyboard PhysicalTossInput', () => {
    let tracker = createKeyboardTossTracker();
    tracker = beginKeyboardCharge(tracker, ' ', 1000);

    expect(tracker.charging).toBe(true);

    const sealed = sealKeyboardToss(tracker, ' ', {
      currentThrow: 3,
      perturbationSeed: 0xfeed01,
      timestamp: 1600
    });

    expect(sealed).not.toBeNull();
    expect(sealed?.input.source).toBe('keyboard');
    expect(sealed?.input.currentThrow).toBe(3);
    expect(sealed?.input.durationMs).toBe(600);
    expect('faces' in (sealed?.input ?? {})).toBe(false);
    expect(sealed?.next.charging).toBe(false);
  });

  it('maps longer holds to stronger (still light) toss energy', () => {
    const shortHold = sealKeyboardToss(
      beginKeyboardCharge(createKeyboardTossTracker(), 'Enter', 0),
      'Enter',
      { currentThrow: 1, perturbationSeed: 7, timestamp: 200 }
    );
    const longHold = sealKeyboardToss(
      beginKeyboardCharge(createKeyboardTossTracker(), 'Enter', 0),
      'Enter',
      { currentThrow: 1, perturbationSeed: 7, timestamp: 2000 }
    );

    expect(longHold?.input.energy).toBeGreaterThan(shortHold?.input.energy ?? 0);
    expect(longHold?.input.energy).toBeLessThanOrEqual(1.1);
  });

  it('reports live hold energy and rejects mismatched keys', () => {
    let tracker = createKeyboardTossTracker();
    tracker = beginKeyboardCharge(tracker, ' ', 500);

    const summary = summarizeKeyboardEnergy(tracker, 1700);
    expect(summary.durationMs).toBe(1200);
    expect(summary.energy).toBeGreaterThan(0);
    expect(summary.energy).toBeLessThanOrEqual(1);

    const wrongKey = sealKeyboardToss(tracker, 'Enter', {
      currentThrow: 1,
      perturbationSeed: 1,
      timestamp: 1800
    });
    expect(wrongKey).toBeNull();

    expect(cancelKeyboardCharge(tracker).charging).toBe(false);
  });
});
