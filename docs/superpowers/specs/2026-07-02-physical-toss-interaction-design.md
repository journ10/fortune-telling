# Physical Toss Interaction Design

## Goal

Rework the coin-casting flow so the final three-coin result is decided by physical simulation, not by a pre-generated random face list.

User interaction must define the physical initial conditions. Rapier then simulates the toss, collisions, settling, and final coin orientation. The app reads the visible face from each settled rigid body and uses those faces to create the I Ching line.

This keeps the experience close to real-world coin tossing:

- A deliberate user can influence the toss through their motion.
- Normal use remains effectively random because of human variation, coin collisions, sensor noise, and small real-world-style perturbations.
- The system never directly chooses heads or tails before the physical simulation settles.

## Non-Goals

- Do not block users from trying to bias or practice a toss.
- Do not implement anti-cheat logic.
- Do not pre-generate coin faces for tabletop or motion tosses.
- Do not change the existing I Ching scoring rules.
- Do not make AI interpretation part of this change.

## Chosen Approach

Use one shared physical-input pipeline for both desktop/touch and mobile motion input.

Both interaction modes produce a `PhysicalTossInput`. The physics module consumes that input, builds the Rapier world, simulates the toss, and returns settled faces. UI components never pass predetermined `heads` or `tails` targets into the toss animation.

This is preferred over keeping the current chamber-only model because desktop/touch users need a direct drag-and-release toss whose direction, speed, and curve visibly matter. It is also preferred over two independent physics models because fairness, settling behavior, and tests should be shared.

## Core Data Model

Introduce a physical input shape similar to:

```ts
export type PhysicalTossSource = 'pointer' | 'motion';

export interface PhysicalCoinInitialState {
  position: [number, number, number];
  rotation: [number, number, number, number];
  linearVelocity: [number, number, number];
  angularVelocity: [number, number, number];
}

export interface PhysicalTossInput {
  source: PhysicalTossSource;
  coins: [PhysicalCoinInitialState, PhysicalCoinInitialState, PhysicalCoinInitialState];
  energy: number;
  durationMs: number;
  perturbationSeed: number;
  perturbationScale: number;
}
```

The exact TypeScript shape can evolve during implementation, but the boundary is fixed:

- The interaction layer computes physical initial conditions.
- The physics layer simulates from those conditions.
- The result layer reads settled rigid-body orientation.

`perturbationSeed` is allowed only for physical perturbation. It must not be converted directly into coin faces.

## Desktop And Touch Interaction

Desktop and touch use a drag-and-release toss.

1. On `pointerdown`, the scene enters holding mode and begins sampling pointer movement.
2. During `pointermove`, the scene records a short rolling history, around the last 180-250 ms.
3. On `pointerup`, the mapper computes release velocity, direction, drag curvature, hold duration, and small hand jitter.
4. Those values become three distinct coin initial states.

Mapping rules:

- Faster release creates stronger horizontal linear velocity.
- Curved movement creates stronger angular velocity.
- Hold duration and small movement jitter create per-coin spread.
- Release direction controls the main travel direction.
- Each coin receives a different offset and spin derived from the same gesture so the three coins collide naturally.
- Very weak releases get a minimum physical energy floor so the coins can still flip, but this only changes velocity and spin. It never changes final faces.

The button label should change from "按住颠钱，松开掷出" to copy closer to "拖动铜钱，松手掷出".

Keyboard access should remain. Holding Space or Enter can generate a standard light-toss physical input through the same pipeline.

## Mobile Motion Interaction

Mobile motion keeps the "shake, then become still to release" experience.

1. After permission is granted, the control listens to `devicemotion`.
2. When acceleration or rotation crosses the start threshold, it enters shaking.
3. While shaking, it accumulates energy, dominant direction, rotation bias, peak count, duration, and quiet-window decay.
4. When the quiet window is reached, the detector creates a `PhysicalTossInput`.
5. After release, the detector resets so the same six-line casting can continue with the next motion toss.

Mapping rules:

- Higher total energy increases release speed and spin.
- Dominant acceleration direction influences the release direction.
- Rotation-rate changes influence coin angular velocity.
- Sampling digest and crypto-derived micro noise are used only as physical perturbation inputs.
- Unsupported motion APIs or denied permission do not block casting; users can still use the desktop/touch drag path.

## Physics Simulation

Replace the current result-driven fallback path with an input-driven physics path.

The physics module should expose a creation API similar to:

```ts
createCoinPhysicsSimulation(input: PhysicalTossInput): CoinPhysicsSimulation
```

The simulation must:

- Create three dynamic coin rigid bodies from the supplied initial states.
- Apply small perturbations to physical variables only: initial position, angular velocity, friction, restitution, and tabletop micro tilt.
- Simulate coin-to-table and coin-to-coin collisions.
- Detect settling from actual body state.
- Return faces by calling `coinFaceFromPhysicsRotation` on final rigid-body rotations.

Existing chamber behavior can remain internally as a motion-input mapper, but it should still produce `PhysicalTossInput` before simulation begins.

## Settling And Timeout

Strict settling remains the normal path:

- Linear velocity below threshold.
- Angular velocity below threshold.
- Face normal close enough to up or down.

If strict settling takes too long, the fallback must still be physical:

- If every coin has a readable face orientation, read the current rigid-body orientations and mark the settlement reason as `timeout-readable`.
- If a coin is standing on edge and unreadable, continue applying a tiny physical destabilizing torque until it falls to a readable face.
- Do not call a fallback face generator.
- Do not call `tossCoins()` for tabletop or motion-driven tosses.

The UI can keep showing "投掷落定中" while this resolves, but the simulation must have a maximum protection path so the app cannot remain stuck forever.

## Result Flow

The end-to-end flow becomes:

```text
Pointer or motion samples
  -> PhysicalTossInput
  -> Rapier simulation
  -> settled rigid-body rotations
  -> [heads, tails, heads]
  -> createCoinToss(faces)
  -> useCastingSession.recordToss(toss)
  -> six tosses build the casting result
```

`createCoinToss` and the existing I Ching scoring rules remain the source of truth for line values:

- 6: old yin
- 7: young yang
- 8: young yin
- 9: old yang

## Testing And Verification

Add tests at three levels.

### Behavior Tests

- Tabletop tosses do not call `tossCoins()`.
- Tabletop tosses do not call a fallback face generator.
- `onTossSettled` receives faces read from physics snapshots.
- Motion toss detector resets after release and can complete six tosses in one casting.
- Weak pointer releases still produce a physical input with minimum toss energy.
- Timeout resolution never directly generates random faces.

### Physics Tests

- Given the same `PhysicalTossInput` and perturbation seed, simulation is reproducible.
- Changing pointer velocity changes linear and angular coin velocity.
- Changing motion energy changes generated physical energy.
- Settled faces match `coinFaceFromPhysicsRotation` for each rigid body.
- Edge cases eventually become readable through physical destabilization.

### Statistical Tests

Run large batches of synthetic normal toss inputs.

Basic target:

- Heads/tails should be close to 50/50.
- Line-value distribution should be close to the three-coin theory:
  - 6: 12.5%
  - 7: 37.5%
  - 8: 37.5%
  - 9: 12.5%

Interaction target:

- Multiple normal pointer patterns should not show a strong single-face bias.
- Multiple normal motion patterns should not show a strong single-face bias.
- High-energy and low-energy normal tosses may differ in animation and settle time, but should not systematically force one line value.

Statistical thresholds should be wide enough to avoid flaky tests, but tight enough to catch obvious bias.

## Implementation Scope

Keep the change focused on the toss pipeline:

- Add `PhysicalTossInput` and mapper utilities.
- Refactor `coinPhysics` to consume physical input.
- Replace tabletop fallback face generation with physical timeout behavior.
- Update pointer interaction to collect drag samples.
- Update motion interaction to generate physical input and reset after release.
- Update tests around behavior, physics, and statistics.

Leave result dialog, AI reading, hexagram catalog, and interpretation behavior unchanged.

## Risks

- Browser motion sensors vary widely, so motion mapping must clamp inputs and tolerate missing axes.
- Rapier simulation can be CPU-heavy on mobile, so statistical tests should not force runtime behavior to use huge sample counts in production.
- Strong user influence makes repeated practiced gestures more repeatable. This is acceptable by requirement.
- Small perturbations must stay small enough to preserve user influence, but large enough to model normal real-world uncertainty.

## Acceptance Criteria

- A toss result is never chosen before physical simulation settles.
- Both desktop/touch and mobile motion paths produce `PhysicalTossInput`.
- Final faces always come from settled or timeout-readable rigid-body rotations.
- Normal use passes basic and interaction statistical checks.
- Motion input can complete all six tosses without requiring a page refresh or re-enabling the detector after every toss.
