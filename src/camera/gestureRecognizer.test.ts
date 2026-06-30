import { createGestureGate } from './gestureRecognizer';

describe('gesture gate', () => {
  it('triggers on closed fist followed by open palm', () => {
    const gate = createGestureGate(1500);

    expect(gate.update('Closed_Fist', 1000)).toBe(false);
    expect(gate.update('Open_Palm', 1120)).toBe(true);
  });

  it('blocks repeated triggers during cooldown', () => {
    const gate = createGestureGate(1500);

    gate.update('Closed_Fist', 1000);
    expect(gate.update('Open_Palm', 1120)).toBe(true);
    gate.update('Closed_Fist', 1200);
    expect(gate.update('Open_Palm', 1300)).toBe(false);
    gate.update('Closed_Fist', 2700);
    expect(gate.update('Open_Palm', 2800)).toBe(true);
  });

  it('does not trigger on first-frame open palm', () => {
    const gate = createGestureGate(1500);

    expect(gate.update('Open_Palm', 1000)).toBe(false);
  });

  it('does not trigger when a non-target gesture interrupts the sequence', () => {
    const gate = createGestureGate(1500);

    expect(gate.update('Closed_Fist', 1000)).toBe(false);
    expect(gate.update('Victory', 1060)).toBe(false);
    expect(gate.update('Open_Palm', 1120)).toBe(false);
  });

  it('allows brief neutral frames between fist and open palm', () => {
    const gate = createGestureGate(1500);

    expect(gate.update('Closed_Fist', 1000)).toBe(false);
    expect(gate.update('None', 1060)).toBe(false);
    expect(gate.update('Open_Palm', 1120)).toBe(true);
  });

  it('allows a repeated trigger at the exact cooldown boundary', () => {
    const gate = createGestureGate(1500);

    gate.update('Closed_Fist', 1000);
    expect(gate.update('Open_Palm', 1120)).toBe(true);
    gate.update('Closed_Fist', 2600);
    expect(gate.update('Open_Palm', 2620)).toBe(true);
  });
});
