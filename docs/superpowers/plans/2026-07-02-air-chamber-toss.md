# Air Chamber Toss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the instant tabletop toss with a full-physics hand-chamber flow: coins start flat on the table, the user shakes them inside an invisible palm-like chamber, release sends them into the existing settle/result pipeline, and mobile motion can drive the same chamber.

**Architecture:** Keep Rapier as the single source of coin motion and face results. Add a small interaction state layer in `App`/`TabletopScene`, and extend `coinPhysics` with an optional kinematic chamber that can be driven by PC hold input or mobile motion profiles before release. Mobile device motion is wrapped in a pure detector module so browser permissions and sample thresholds stay testable.

**Tech Stack:** React 19, TypeScript, Three.js, Rapier 3D, Vitest, Testing Library, browser `DeviceMotionEvent`.

---

### Task 1: Motion Profile And Chamber Physics

**Files:**
- Modify: `src/physics/coinPhysics.ts`
- Modify: `src/physics/coinPhysics.test.ts`

- [ ] **Step 1: Write failing physics tests**

Add tests proving:

```ts
it('starts chamber simulations with coins resting flat on the tabletop before shaking', async () => {
  await initCoinPhysics();
  const simulation = createCoinPhysicsSimulation(1, 1, 0x1234, {
    mode: 'chamber',
    phase: 'resting',
    drive: { elapsedSeconds: 0, energy: 0, release: false }
  });
  const snapshot = simulation.snapshot();

  snapshot.coins.forEach((coin) => {
    expect(coin.position.y).toBeLessThan(TABLETOP_COIN_RADIUS * 0.18);
    expect(Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(coin.physicsRotation).y)).toBeGreaterThanOrEqual(0.99);
  });

  simulation.dispose();
});

it('keeps chamber-driven coins bounded before release and settles only after release', async () => {
  await initCoinPhysics();
  const simulation = createCoinPhysicsSimulation(1, 1, 0x4567, {
    mode: 'chamber',
    phase: 'shaking',
    drive: { elapsedSeconds: 0, energy: 0.8, release: false }
  });

  let snapshot = simulation.snapshot();
  for (let index = 0; index < 180; index += 1) {
    simulation.updateChamberDrive?.({ elapsedSeconds: index / 60, energy: 0.85, release: false });
    snapshot = simulation.step(1 / 60);
    expect(snapshot.settled).toBe(false);
    snapshot.coins.forEach((coin) => {
      expect(Math.abs(coin.position.x)).toBeLessThanOrEqual(1.65);
      expect(Math.abs(coin.position.z)).toBeLessThanOrEqual(1.25);
      expect(coin.position.y).toBeLessThanOrEqual(1.25);
    });
  }

  simulation.releaseChamber?.({ elapsedSeconds: 3.1, energy: 0.85, release: true });
  for (let index = 0; index < 900 && !snapshot.settled; index += 1) {
    snapshot = simulation.step(1 / 60);
  }

  expect(snapshot.settled).toBe(true);
  simulation.dispose();
});
```

- [ ] **Step 2: Run physics tests and confirm they fail**

Run: `npm test -- src/physics/coinPhysics.test.ts`

Expected: failures for missing chamber options/API.

- [ ] **Step 3: Implement minimal chamber support**

Add:

```ts
export type CoinTossMode = 'drop' | 'chamber';
export type CoinTossPhase = 'resting' | 'shaking' | 'released';

export interface TossDriveState {
  elapsedSeconds: number;
  energy: number;
  release: boolean;
}

export interface CoinPhysicsOptions {
  mode?: CoinTossMode;
  phase?: CoinTossPhase;
  drive?: TossDriveState;
}
```

Extend `CoinPhysicsSimulation` with optional methods:

```ts
updateChamberDrive?: (drive: TossDriveState) => void;
releaseChamber?: (drive: TossDriveState) => void;
```

For chamber mode, create dynamic coin bodies initially flat on the table and kinematic chamber colliders:

- bottom palm plane under the coins
- four side walls
- top soft cap

Drive the kinematic chamber with smoothed bounded motion derived from `drive.energy`, `elapsedSeconds`, and seeded offsets. Before release, suppress settled faces. On release, remove or lower chamber colliders, transfer chamber velocity/micro torque into coins, and let the existing settle detection run.

- [ ] **Step 4: Verify physics tests**

Run: `npm test -- src/physics/coinPhysics.test.ts`

Expected: all physics tests pass.

---

### Task 2: PC Hold-To-Shake Interaction

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/TabletopScene.tsx`
- Modify: `src/components/TabletopScene.test.tsx`
- Modify: `src/components/TabletopScene.physics.test.tsx`

- [ ] **Step 1: Write failing UI/state tests**

Add tests proving:

```ts
it('uses a hold-to-shake and release-to-throw tabletop flow', async () => {
  const user = userEvent.setup();
  vi.stubGlobal('fetch', vi.fn());
  render(<App />);

  await saveAiSettings(user, { apiKey: 'sk-user' });
  await startCastingWithDefaultQuestion(user);

  const button = screen.getByRole('button', { name: '按住颠钱，松开掷出' });
  fireEvent.pointerDown(button);
  expect(screen.getByRole('status')).toHaveTextContent('颠钱中');

  fireEvent.pointerUp(button);
  expect(screen.getByRole('button', { name: '投掷落定中' })).toBeDisabled();
});
```

In `TabletopScene.physics.test.tsx`, assert that `createCoinPhysicsSimulation` is called with chamber mode and that `updateChamberDrive` is called before release.

- [ ] **Step 2: Run UI tests and confirm they fail**

Run: `npm test -- src/App.test.tsx src/components/TabletopScene.test.tsx src/components/TabletopScene.physics.test.tsx`

Expected: failures for old click-to-toss flow.

- [ ] **Step 3: Implement interaction state**

Add a tossing interaction phase in `App`:

```ts
type TossInteractionPhase = 'idle' | 'shaking' | 'released';
```

Replace simple click request with:

- `startTossShake()` creates `pendingTossId` and `pendingTossSeed`, sets phase `shaking`
- `releaseToss()` sets phase `released`
- `settleToss()` clears id, seed, and phase back to `idle`

Pass `tossInteractionPhase` and handlers into `TabletopScene`.

- [ ] **Step 4: Implement TabletopScene controls**

Change the main surface from click-only to pointer/key hold:

- idle label: `按住颠钱，松开掷出`
- shaking label/status: `颠钱中`
- released/settling label: `投掷落定中`

Use pointer down/up/cancel and Space/Enter key down/up. While shaking, call physics `updateChamberDrive` each frame. When released, call `releaseChamber`.

Make initial no-pending coin state rest flat on the table, not hover.

- [ ] **Step 5: Verify UI tests**

Run: `npm test -- src/App.test.tsx src/components/TabletopScene.test.tsx src/components/TabletopScene.physics.test.tsx`

Expected: all targeted UI tests pass.

---

### Task 3: Mobile Motion Detector And Hook

**Files:**
- Create: `src/motion/deviceMotionToss.ts`
- Create: `src/motion/deviceMotionToss.test.ts`
- Modify: `src/components/GestureControl.tsx` or create `src/components/MotionTossControl.tsx`
- Modify: related component tests
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing pure detector tests**

Create `src/motion/deviceMotionToss.test.ts` with tests:

```ts
it('enters shaking when motion energy crosses the start threshold', () => {
  const detector = createDeviceMotionTossDetector();
  expect(detector.update({ timestamp: 0, accelerationMagnitude: 0.2, rotationMagnitude: 0 })).toMatchObject({ state: 'idle' });
  expect(detector.update({ timestamp: 80, accelerationMagnitude: 18, rotationMagnitude: 160 })).toMatchObject({ state: 'shaking' });
});

it('releases after a quiet window following shaking', () => {
  const detector = createDeviceMotionTossDetector({ quietWindowMs: 600 });
  detector.update({ timestamp: 0, accelerationMagnitude: 20, rotationMagnitude: 140 });
  detector.update({ timestamp: 120, accelerationMagnitude: 22, rotationMagnitude: 110 });
  expect(detector.update({ timestamp: 820, accelerationMagnitude: 0.3, rotationMagnitude: 1 })).toMatchObject({ state: 'released' });
});

it('produces a deterministic motion digest from sampled energy', () => {
  const detector = createDeviceMotionTossDetector();
  detector.update({ timestamp: 0, accelerationMagnitude: 18, rotationMagnitude: 90 });
  const released = detector.update({ timestamp: 900, accelerationMagnitude: 0, rotationMagnitude: 0 });
  expect(released.digest).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run detector tests and confirm they fail**

Run: `npm test -- src/motion/deviceMotionToss.test.ts`

Expected: missing module failure.

- [ ] **Step 3: Implement detector module**

Create:

```ts
export interface DeviceMotionSample {
  timestamp: number;
  accelerationMagnitude: number;
  rotationMagnitude: number;
}

export interface DeviceMotionTossResult {
  state: 'idle' | 'shaking' | 'released';
  energy: number;
  digest: number;
}

export function createDeviceMotionTossDetector(options?: {
  startThreshold?: number;
  stopThreshold?: number;
  quietWindowMs?: number;
}): { update(sample: DeviceMotionSample): DeviceMotionTossResult; reset(): void }
```

Use magnitude-based energy, not device-axis direction. Accumulate digest with integer mixing so it can perturb `tossSeed`.

- [ ] **Step 4: Add mobile control wrapper**

Add a small UI that requests `DeviceMotionEvent.requestPermission()` when present, listens to `devicemotion`, feeds detector samples, calls `startTossShake` on shaking and `releaseToss` when released. Keep existing camera gesture control unless product decides to remove it later.

- [ ] **Step 5: Verify motion tests**

Run: `npm test -- src/motion/deviceMotionToss.test.ts src/components/GestureControl.test.tsx src/App.test.tsx`

Expected: detector and integration tests pass.

---

### Task 4: Full Verification

**Files:**
- No planned source edits unless verification finds regressions.

- [ ] **Step 1: Run complete automated checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

- all tests pass
- TypeScript passes
- production build succeeds; existing large chunk warning is acceptable

- [ ] **Step 2: Browser smoke test**

Start or reuse Vite dev server and use Chrome/Playwright to verify:

- coins initially rest on the tabletop
- PC pointer hold enters shaking state
- pointer release enters settling state
- final snapshot shows coins flat on the table
- the progress advances to the next toss only after settle

- [ ] **Step 3: Final review**

Review `git diff --check`, `git status --short`, and changed files for unrelated edits. Do not remove `.DS_Store` unless explicitly requested.

