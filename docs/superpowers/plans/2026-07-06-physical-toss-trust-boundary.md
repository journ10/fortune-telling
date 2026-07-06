# Physical Toss Trust Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the phase-one physical toss trust boundary so every recorded line comes from a settled Rapier `PhysicalTossInput`, with per-line evidence and no random/manual face generation in the app session path.

**Architecture:** Keep the existing domain and hexagram logic. Add an `experience` evidence layer, make the physical simulation hook report the settled snapshot with faces, and tighten `coinPhysics` so its public creation API accepts only `PhysicalTossInput`. Split face-reading helpers out of `coinPhysics` so result reading is independently testable.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Three.js, `@dimforge/rapier3d-compat`, Vite.

---

## Scope

This plan covers only phase one from [`2026-07-06-realistic-3d-coin-casting-redesign.md`](../specs/2026-07-06-realistic-3d-coin-casting-redesign.md): the physical result boundary, evidence recording, and removal of random/manual toss mutators from the casting session. PC money-cup interaction, mobile sensor interaction, final museum-grade rendering, and result drawer redesign get separate plans after this boundary is in place.

Before execution, inspect `git status --short`. This repository currently may contain unrelated dirty implementation files. Do not revert or overwrite those changes; work in an isolated worktree or merge carefully.

## File Structure

- Create `src/experience/castingEvidence.ts`: builds per-line evidence from `PhysicalTossInput`, `CoinPhysicsSnapshot`, and settled faces.
- Create `src/experience/castingEvidence.test.ts`: tests evidence shape, score/line metadata, and deterministic physical input digest.
- Create `src/physics/coinFaceReader.ts`: owns quaternion-to-face reading helpers.
- Create `src/physics/coinFaceReader.test.ts`: tests face reading from physics rotations.
- Modify `src/physics/coinPhysics.ts`: imports face reader helpers, removes legacy numeric overloads, exposes only `createCoinPhysicsSimulation(input)`.
- Modify `src/physics/coinPhysics.test.ts`: removes legacy chamber compatibility coverage and keeps settlement tests focused on `PhysicalTossInput`.
- Modify `src/hooks/usePhysicalTossSimulation.ts`: passes the full settled snapshot to `onSettled`.
- Modify `src/hooks/usePhysicalTossSimulation.test.ts`: verifies settled snapshot is forwarded and timeout errors do not synthesize faces.
- Modify `src/hooks/useCastingSession.ts`: stores `tossEvidence`, exposes `recordSettledToss`, removes public random/manual toss mutators.
- Modify `src/hooks/useCastingSession.test.ts`: verifies evidence storage and removal of random/manual session methods.
- Modify `src/App.tsx`: records settled physical tosses through `recordSettledToss`.
- Modify `src/App.test.tsx`: verifies the app records only physics-settled faces and does not call `tossCoins`.

---

### Task 1: Add Toss Evidence Contract

**Files:**
- Create: `src/experience/castingEvidence.ts`
- Create: `src/experience/castingEvidence.test.ts`

- [ ] **Step 1: Write the failing evidence tests**

Create `src/experience/castingEvidence.test.ts` with:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CoinPhysicsSnapshot } from '../physics/coinPhysics';
import type { PhysicalTossInput } from '../physics/physicalTossInput';
import { createTossEvidence, summarizePhysicalTossInput } from './castingEvidence';

function createTestInput(): PhysicalTossInput {
  const createCoin = (slot: number) => ({
    position: [slot * 0.25, 1 + slot * 0.1, -0.2] as [number, number, number],
    rotation: [0, slot * 0.1, 0, 1] as [number, number, number, number],
    linearVelocity: [0.4 + slot * 0.1, 2.1, -0.5] as [number, number, number],
    angularVelocity: [8 + slot, 0.8, 1.4] as [number, number, number]
  });

  return {
    source: 'pointer',
    currentThrow: 2,
    coins: [createCoin(0), createCoin(1), createCoin(2)],
    energy: 0.72,
    durationMs: 940,
    perturbationSeed: 0x1234abcd,
    perturbationScale: 0.052
  };
}

function createSettledSnapshot(): CoinPhysicsSnapshot {
  return {
    coins: [-1, 0, 1].map((slot) => ({
      position: new THREE.Vector3(slot, 0.08, 0),
      physicsRotation: new THREE.Quaternion(),
      visualRotation: new THREE.Quaternion()
    })) as CoinPhysicsSnapshot['coins'],
    elapsed: 3.25,
    faces: ['heads', 'tails', 'tails'],
    phase: 'settled',
    settled: true,
    settledReason: 'strict'
  };
}

describe('casting evidence', () => {
  it('summarizes physical toss input without storing full renderer objects', () => {
    const summary = summarizePhysicalTossInput(createTestInput());

    expect(summary.source).toBe('pointer');
    expect(summary.currentThrow).toBe(2);
    expect(summary.energy).toBe(0.72);
    expect(summary.durationMs).toBe(940);
    expect(summary.perturbationScale).toBe(0.052);
    expect(summary.coinCount).toBe(3);
    expect(summary.digest).toMatch(/^[0-9a-f]{8}$/);
  });

  it('creates line evidence from settled physical faces', () => {
    const evidence = createTossEvidence({
      throwIndex: 2,
      input: createTestInput(),
      snapshot: createSettledSnapshot(),
      faces: ['heads', 'tails', 'tails']
    });

    expect(evidence.throwIndex).toBe(2);
    expect(evidence.inputSource).toBe('pointer');
    expect(evidence.settledReason).toBe('strict');
    expect(evidence.settledTimeMs).toBe(3250);
    expect(evidence.faces).toEqual(['heads', 'tails', 'tails']);
    expect(evidence.score).toBe(7);
    expect(evidence.lineName).toBe('young-yang');
    expect(evidence.isMoving).toBe(false);
    expect(evidence.physicalTossInputDigest).toBe(evidence.inputSummary.digest);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- src/experience/castingEvidence.test.ts
```

Expected: fail because `src/experience/castingEvidence.ts` does not exist.

- [ ] **Step 3: Implement evidence helpers**

Create `src/experience/castingEvidence.ts` with:

```ts
import { createCoinToss } from '../domain/coinToss';
import type { CoinFace, LineName, LineScore } from '../domain/types';
import type { CoinPhysicsSettledReason, CoinPhysicsSnapshot } from '../physics/coinPhysics';
import type { PhysicalTossInput, PhysicalTossSource } from '../physics/physicalTossInput';

export interface PhysicalTossInputSummary {
  source: PhysicalTossSource;
  currentThrow: number;
  energy: number;
  durationMs: number;
  perturbationScale: number;
  coinCount: 3;
  digest: string;
}

export interface TossEvidence {
  throwIndex: number;
  inputSource: PhysicalTossSource;
  inputSummary: PhysicalTossInputSummary;
  physicalTossInputDigest: string;
  settledReason: CoinPhysicsSettledReason;
  settledTimeMs: number;
  faces: [CoinFace, CoinFace, CoinFace];
  score: LineScore;
  lineName: LineName;
  isMoving: boolean;
}

interface CreateTossEvidenceParams {
  throwIndex: number;
  input: PhysicalTossInput;
  snapshot: CoinPhysicsSnapshot;
  faces: [CoinFace, CoinFace, CoinFace];
}

function mixWord(hash: number, word: number): number {
  let mixed = (hash ^ (word >>> 0)) >>> 0;

  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function quantize(value: number, scale: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * scale);
}

export function digestPhysicalTossInput(input: PhysicalTossInput): string {
  let hash = 0x811c9dc5;

  hash = mixWord(hash, input.currentThrow);
  hash = mixWord(hash, input.source.length);
  hash = mixWord(hash, quantize(input.energy, 1000));
  hash = mixWord(hash, quantize(input.durationMs, 1));
  hash = mixWord(hash, input.perturbationSeed);
  hash = mixWord(hash, quantize(input.perturbationScale, 100000));

  input.coins.forEach((coin) => {
    [...coin.position, ...coin.rotation, ...coin.linearVelocity, ...coin.angularVelocity].forEach(
      (value) => {
        hash = mixWord(hash, quantize(value, 100000));
      }
    );
  });

  return hash.toString(16).padStart(8, '0').slice(-8);
}

export function summarizePhysicalTossInput(input: PhysicalTossInput): PhysicalTossInputSummary {
  return {
    source: input.source,
    currentThrow: input.currentThrow,
    energy: input.energy,
    durationMs: input.durationMs,
    perturbationScale: input.perturbationScale,
    coinCount: 3,
    digest: digestPhysicalTossInput(input)
  };
}

export function createTossEvidence({
  throwIndex,
  input,
  snapshot,
  faces
}: CreateTossEvidenceParams): TossEvidence {
  if (!snapshot.settled || !snapshot.settledReason) {
    throw new Error('Cannot create toss evidence from an unsettled physics snapshot');
  }

  const toss = createCoinToss(faces);
  const inputSummary = summarizePhysicalTossInput(input);

  return {
    throwIndex,
    inputSource: input.source,
    inputSummary,
    physicalTossInputDigest: inputSummary.digest,
    settledReason: snapshot.settledReason,
    settledTimeMs: Math.round(snapshot.elapsed * 1000),
    faces,
    score: toss.score,
    lineName: toss.line.name,
    isMoving: toss.line.isMoving
  };
}
```

- [ ] **Step 4: Run evidence tests**

Run:

```bash
npm test -- src/experience/castingEvidence.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/experience/castingEvidence.ts src/experience/castingEvidence.test.ts
git commit -m "feat: add physical toss evidence contract"
```

---

### Task 2: Split Physics Face Reading

**Files:**
- Create: `src/physics/coinFaceReader.ts`
- Create: `src/physics/coinFaceReader.test.ts`
- Modify: `src/physics/coinPhysics.ts`
- Modify: `src/physics/physicalTossInput.test.ts`

- [ ] **Step 1: Write face reader tests**

Create `src/physics/coinFaceReader.test.ts` with:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { coinFaceFromPhysicsRotation, readCoinFacesFromPhysicsRotations } from './coinFaceReader';

describe('coin face reader', () => {
  it('reads heads when the physics face normal points upward', () => {
    expect(coinFaceFromPhysicsRotation(new THREE.Quaternion())).toBe('heads');
  });

  it('reads tails when the physics face normal points downward', () => {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);

    expect(coinFaceFromPhysicsRotation(rotation)).toBe('tails');
  });

  it('reads exactly three physics rotations into coin faces', () => {
    const tails = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);

    expect(readCoinFacesFromPhysicsRotations([new THREE.Quaternion(), tails, tails])).toEqual([
      'heads',
      'tails',
      'tails'
    ]);
  });
});
```

- [ ] **Step 2: Run the failing face reader test**

Run:

```bash
npm test -- src/physics/coinFaceReader.test.ts
```

Expected: fail because `coinFaceReader.ts` does not exist.

- [ ] **Step 3: Implement face reader**

Create `src/physics/coinFaceReader.ts` with:

```ts
import * as THREE from 'three';
import type { CoinFace } from '../domain/types';

export function coinFaceFromPhysicsRotation(rotation: THREE.Quaternion): CoinFace {
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  return normal.y >= 0 ? 'heads' : 'tails';
}

export function coinFaceFromVisualRotation(rotation: THREE.Quaternion): CoinFace {
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
  return normal.y >= 0 ? 'heads' : 'tails';
}

export function readCoinFacesFromPhysicsRotations(
  rotations: readonly [THREE.Quaternion, THREE.Quaternion, THREE.Quaternion]
): [CoinFace, CoinFace, CoinFace] {
  return rotations.map((rotation) => coinFaceFromPhysicsRotation(rotation)) as [
    CoinFace,
    CoinFace,
    CoinFace
  ];
}
```

- [ ] **Step 4: Update `coinPhysics.ts` to use the helper**

Modify `src/physics/coinPhysics.ts`:

```ts
import {
  coinFaceFromPhysicsRotation,
  coinFaceFromVisualRotation
} from './coinFaceReader';
```

Delete the local `coinFaceFromVisualRotation` and `coinFaceFromPhysicsRotation` function declarations from `coinPhysics.ts`, then re-export them near the imports if existing call sites still import from `coinPhysics`:

```ts
export { coinFaceFromPhysicsRotation, coinFaceFromVisualRotation } from './coinFaceReader';
```

- [ ] **Step 5: Run affected tests**

Run:

```bash
npm test -- src/physics/coinFaceReader.test.ts src/physics/physicalTossInput.test.ts src/physics/coinPhysics.test.ts
```

Expected: pass after imports are updated.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/physics/coinFaceReader.ts src/physics/coinFaceReader.test.ts src/physics/coinPhysics.ts src/physics/physicalTossInput.test.ts
git commit -m "refactor: split coin face reading from physics world"
```

---

### Task 3: Forward Settled Physics Snapshot From Simulation Hook

**Files:**
- Modify: `src/hooks/usePhysicalTossSimulation.ts`
- Modify: `src/hooks/usePhysicalTossSimulation.test.ts`

- [ ] **Step 1: Add a failing hook test for snapshot forwarding**

In `src/hooks/usePhysicalTossSimulation.test.ts`, update the first test's `onSettled` mock and assertions:

```ts
const onSettled = vi.fn<
  (settledFaces: [CoinFace, CoinFace, CoinFace], snapshot: CoinPhysicsSnapshot) => void
>();
```

Then replace the final assertions with:

```ts
expect(onSettled).toHaveBeenCalledTimes(1);
expect(onSettled).toHaveBeenCalledWith(faces, settledSnapshot);
```

- [ ] **Step 2: Run the failing hook test**

Run:

```bash
npm test -- src/hooks/usePhysicalTossSimulation.test.ts -t "settles once"
```

Expected: fail because `onSettled` only receives faces.

- [ ] **Step 3: Update the hook API and implementation**

In `src/hooks/usePhysicalTossSimulation.ts`, change the params interface:

```ts
export interface PhysicalTossSimulationParams {
  pendingTossKey: PendingTossKey;
  input: PhysicalTossInput | null | undefined;
  onSettled: (faces: [CoinFace, CoinFace, CoinFace], snapshot: CoinPhysicsSnapshot) => void;
  onError?: (error: unknown) => void;
}
```

Then change the settled callback:

```ts
if (nextSnapshot.settled && nextSnapshot.faces && !hasSettled) {
  hasSettled = true;
  onSettledRef.current(nextSnapshot.faces, nextSnapshot);
  disposeSimulation();
  return;
}
```

- [ ] **Step 4: Update remaining hook test callback types**

In `src/hooks/usePhysicalTossSimulation.test.ts`, replace every one-argument `onSettled` mock type with:

```ts
const onSettled = vi.fn<
  (settledFaces: [CoinFace, CoinFace, CoinFace], snapshot: CoinPhysicsSnapshot) => void
>();
```

For tests that only care about faces, assert the first argument:

```ts
expect(onSettled.mock.calls[0][0]).toEqual(firstFaces);
```

- [ ] **Step 5: Run hook tests**

Run:

```bash
npm test -- src/hooks/usePhysicalTossSimulation.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/hooks/usePhysicalTossSimulation.ts src/hooks/usePhysicalTossSimulation.test.ts
git commit -m "feat: expose settled physics snapshots"
```

---

### Task 4: Store Physical Toss Evidence In Casting Session

**Files:**
- Modify: `src/hooks/useCastingSession.ts`
- Modify: `src/hooks/useCastingSession.test.ts`

- [ ] **Step 1: Add failing session tests**

In `src/hooks/useCastingSession.test.ts`, add imports:

```ts
import * as THREE from 'three';
import type { CoinPhysicsSnapshot } from '../physics/coinPhysics';
import type { PhysicalTossInput } from '../physics/physicalTossInput';
```

Add local helpers:

```ts
function createTestInput(currentThrow: number): PhysicalTossInput {
  const createCoin = (slot: number) => ({
    position: [slot * 0.2, 1 + slot * 0.1, -0.1] as [number, number, number],
    rotation: [0, slot * 0.1, 0, 1] as [number, number, number, number],
    linearVelocity: [0.4, 2.1, -0.4] as [number, number, number],
    angularVelocity: [8 + slot, 0.8, 1.2] as [number, number, number]
  });

  return {
    source: 'keyboard',
    currentThrow,
    coins: [createCoin(0), createCoin(1), createCoin(2)],
    energy: 0.4,
    durationMs: 180,
    perturbationSeed: 0x1111 + currentThrow,
    perturbationScale: 0.04
  };
}

function createSettledSnapshot(faces: ['heads', 'tails', 'tails']): CoinPhysicsSnapshot {
  return {
    coins: [-1, 0, 1].map((slot) => ({
      position: new THREE.Vector3(slot, 0.08, 0),
      physicsRotation: new THREE.Quaternion(),
      visualRotation: new THREE.Quaternion()
    })) as CoinPhysicsSnapshot['coins'],
    elapsed: 2.5,
    faces,
    phase: 'settled',
    settled: true,
    settledReason: 'strict'
  };
}
```

Replace the manual/random tests with:

```ts
it('records physical tosses with evidence and creates a result after six tosses', () => {
  const { result } = renderHook(() => useCastingSession());
  const faces: ['heads', 'tails', 'tails'] = ['heads', 'tails', 'tails'];

  act(() => {
    result.current.start('今日运势', 'general');
  });

  for (let index = 0; index < 6; index += 1) {
    act(() => {
      result.current.recordSettledToss(
        faces,
        createTestInput(index + 1),
        createSettledSnapshot(faces)
      );
    });
  }

  expect(result.current.phase).toBe('result');
  expect(result.current.tosses).toHaveLength(6);
  expect(result.current.tossEvidence).toHaveLength(6);
  expect(result.current.tossEvidence[0]).toMatchObject({
    throwIndex: 1,
    inputSource: 'keyboard',
    settledReason: 'strict',
    score: 7,
    lineName: 'young-yang'
  });
});

it('does not expose random or manual toss mutators on the session API', () => {
  const { result } = renderHook(() => useCastingSession());
  const api = result.current as unknown as Record<string, unknown>;

  expect(api.addRandomToss).toBeUndefined();
  expect(api.addManualToss).toBeUndefined();
});
```

- [ ] **Step 2: Run the failing session tests**

Run:

```bash
npm test -- src/hooks/useCastingSession.test.ts
```

Expected: fail because `recordSettledToss` and `tossEvidence` do not exist and random/manual mutators are still exposed.

- [ ] **Step 3: Update session implementation**

In `src/hooks/useCastingSession.ts`, remove imports of `tossCoins` and `tossCoinsWithBits`, and add:

```ts
import { createCoinToss } from '../domain/coinToss';
import { createTossEvidence, type TossEvidence } from '../experience/castingEvidence';
import type { CoinPhysicsSnapshot } from '../physics/coinPhysics';
import type { PhysicalTossInput } from '../physics/physicalTossInput';
import type { CoinFace } from '../domain/types';
```

Update the public interface:

```ts
export interface CastingSession {
  phase: AppPhase;
  question: string;
  questionType: QuestionType;
  tosses: CoinToss[];
  tossEvidence: TossEvidence[];
  castingResult: CastingResult | null;
  currentThrow: number;
  start: (question: string, questionType: QuestionType) => void;
  recordSettledToss: (
    faces: [CoinFace, CoinFace, CoinFace],
    input: PhysicalTossInput,
    snapshot: CoinPhysicsSnapshot
  ) => void;
  reset: () => void;
}
```

Add `tossEvidence` to state:

```ts
interface CastingSessionState {
  phase: AppPhase;
  question: string;
  questionType: QuestionType;
  tosses: CoinToss[];
  tossEvidence: TossEvidence[];
  castingResult: CastingResult | null;
}
```

Update the initial state and start/reset state to include `tossEvidence: []`.

Change the action:

```ts
type CastingSessionAction =
  | { type: 'start'; question: string; questionType: QuestionType }
  | {
      type: 'addSettledToss';
      faces: [CoinFace, CoinFace, CoinFace];
      input: PhysicalTossInput;
      snapshot: CoinPhysicsSnapshot;
    }
  | { type: 'reset' };
```

Replace the `addToss` reducer case with:

```ts
case 'addSettledToss': {
  if (state.phase !== 'casting' || state.tosses.length >= 6) {
    return state;
  }

  const toss = createCoinToss(action.faces);
  const tosses = [...state.tosses, toss];
  const tossEvidence = [
    ...state.tossEvidence,
    createTossEvidence({
      throwIndex: tosses.length,
      input: action.input,
      snapshot: action.snapshot,
      faces: action.faces
    })
  ];

  if (tosses.length < 6) {
    return {
      ...state,
      tosses,
      tossEvidence
    };
  }

  const casting = buildCasting(state.question, state.questionType, tosses);

  return {
    ...state,
    phase: 'result',
    tosses,
    tossEvidence,
    castingResult: createCastingResult(casting)
  };
}
```

Replace callbacks with:

```ts
const recordSettledToss = useCallback(
  (
    faces: [CoinFace, CoinFace, CoinFace],
    input: PhysicalTossInput,
    snapshot: CoinPhysicsSnapshot
  ) => {
    dispatch({ type: 'addSettledToss', faces, input, snapshot });
  },
  []
);
```

Return `tossEvidence` and `recordSettledToss`, and remove `recordToss`, `addRandomToss`, and `addManualToss` from the public return object.

- [ ] **Step 4: Update remaining session tests**

Replace calls to `result.current.addManualToss([true, false, false])` with:

```ts
result.current.recordSettledToss(
  ['heads', 'tails', 'tails'],
  createTestInput(result.current.currentThrow),
  createSettledSnapshot(['heads', 'tails', 'tails'])
);
```

Replace the old predetermined toss test with:

```ts
it('records a physics-settled toss so animation can settle before committing the line', () => {
  const { result } = renderHook(() => useCastingSession());
  const faces: ['heads', 'tails', 'tails'] = ['heads', 'tails', 'tails'];

  act(() => {
    result.current.start('今日运势', 'general');
    result.current.recordSettledToss(faces, createTestInput(1), createSettledSnapshot(faces));
  });

  expect(result.current.phase).toBe('casting');
  expect(result.current.tosses[0].faces).toEqual(faces);
  expect(result.current.tossEvidence[0].physicalTossInputDigest).toMatch(/^[0-9a-f]{8}$/);
  expect(result.current.currentThrow).toBe(2);
});
```

- [ ] **Step 5: Run session tests**

Run:

```bash
npm test -- src/hooks/useCastingSession.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/hooks/useCastingSession.ts src/hooks/useCastingSession.test.ts
git commit -m "feat: record settled physical toss evidence"
```

---

### Task 5: Wire Evidence Recording Through App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Update App tests to expect snapshot-aware settlement**

In the `usePhysicalTossSimulation` mock inside `src/App.test.tsx`, define the snapshot shape returned to `onSettled`. Replace the mocked `onSettled` type with:

```ts
onSettled: (
  faces: ['heads', 'tails', 'heads'],
  snapshot: {
    coins: [];
    elapsed: number;
    faces: ['heads', 'tails', 'heads'];
    phase: 'settled';
    settled: true;
    settledReason: 'strict';
  }
) => void;
```

Replace the timeout body with:

```ts
const settledFaces: ['heads', 'tails', 'heads'] = ['heads', 'tails', 'heads'];
const snapshot = {
  coins: [],
  elapsed: settleDelayMs / 1000,
  faces: settledFaces,
  phase: 'settled' as const,
  settled: true as const,
  settledReason: 'strict' as const
};

setFaces(settledFaces);
onSettled(settledFaces, snapshot);
```

Add this test:

```ts
it('does not call crypto random coin generation during physical tabletop casting', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const randomSpy = vi.spyOn(coinTossModule, 'tossCoins');

  render(<App />);
  await saveAiSettings(user);
  await startCastingWithDefaultQuestion(user);
  await settleSixTosses();

  expect(randomSpy).not.toHaveBeenCalled();
  expect(getRequestedPhysicalInputs()).toHaveLength(6);
});
```

- [ ] **Step 2: Run the failing App tests**

Run:

```bash
npm test -- src/App.test.tsx -t "physical tabletop casting"
```

Expected: fail because `App.tsx` still calls `session.recordToss(createCoinToss(faces))` and the hook callback signature is outdated.

- [ ] **Step 3: Update App settlement handling**

In `src/App.tsx`, remove the `createCoinToss` import:

```ts
- import { createCoinToss } from './domain/coinToss';
```

Import the snapshot type:

```ts
import type { CoinPhysicsSnapshot } from './physics/coinPhysics';
```

Update `settlePhysicalToss`:

```ts
const settlePhysicalToss = useCallback(
  (faces: [CoinFace, CoinFace, CoinFace], snapshot: CoinPhysicsSnapshot) => {
    const pending = pendingTossRef.current;

    if (pending === null) {
      return;
    }

    pendingTossRef.current = null;
    session.recordSettledToss(faces, pending.input, snapshot);
    setPendingToss(null);
  },
  [session]
);
```

- [ ] **Step 4: Run App tests**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: record app tosses from settled physics"
```

---

### Task 6: Remove Legacy Numeric Physics Simulation API

**Files:**
- Modify: `src/physics/coinPhysics.ts`
- Modify: `src/physics/coinPhysics.test.ts`

- [ ] **Step 1: Add a type-level guard test**

In `src/physics/coinPhysics.test.ts`, add this compile-time assertion near existing imports:

```ts
// @ts-expect-error createCoinPhysicsSimulation requires a PhysicalTossInput.
createCoinPhysicsSimulation(1, 7, 0x12345678, { mode: 'chamber' });
```

This line should remain outside any `it` block. It verifies the TypeScript API no longer accepts legacy numeric arguments after implementation.

- [ ] **Step 2: Run typecheck to see the current failure**

Run:

```bash
npm run lint
```

Expected: fail with "Unused '@ts-expect-error' directive" because the legacy overload still accepts numeric arguments.

- [ ] **Step 3: Remove legacy API from `coinPhysics.ts`**

In `src/physics/coinPhysics.ts`, delete the legacy exports and helpers named:

```text
CoinTossMode
TossDriveState
CoinPhysicsOptions
mixCoinPhysicsSeed
createLegacyPhysicalTossInput
createLegacyChamberCompatibilitySimulation
```

Replace the overload block with a single function:

```ts
export function createCoinPhysicsSimulation(input: PhysicalTossInput): CoinPhysicsSimulation {
  return createPhysicalCoinPhysicsSimulation(input);
}
```

Update `CoinPhysicsSimulation` by removing chamber-only optional methods:

```ts
export interface CoinPhysicsSimulation {
  dispose: () => void;
  snapshot: () => CoinPhysicsSnapshot;
  step: (deltaSeconds: number) => CoinPhysicsSnapshot;
}
```

- [ ] **Step 4: Remove legacy chamber tests**

In `src/physics/coinPhysics.test.ts`, delete the test that calls:

```ts
createCoinPhysicsSimulation(1, 7, 0x12345678, {
  mode: 'chamber',
  drive: {
    elapsedSeconds: 0.4,
    energy: 0.7,
    release: false
  }
});
```

Find chamber-specific expectations with:

```bash
rg -n "releaseChamber|updateChamberDrive" src/physics/coinPhysics.test.ts
```

Delete the matched expectations and their enclosing chamber-compatibility test blocks because phase-one public physics now starts only from `PhysicalTossInput`.

- [ ] **Step 5: Run physics tests and typecheck**

Run:

```bash
npm test -- src/physics/coinPhysics.test.ts
npm run lint
```

Expected: both pass. The `@ts-expect-error` is now consumed by the invalid numeric call.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/physics/coinPhysics.ts src/physics/coinPhysics.test.ts
git commit -m "refactor: require physical toss input for physics simulation"
```

---

### Task 7: Final Phase-One Verification

**Files:**
- Verify only. File changes are needed only when one of the commands below reports a concrete import, type, test, or build error.

- [ ] **Step 1: Run targeted phase-one tests**

Run:

```bash
npm test -- \
  src/experience/castingEvidence.test.ts \
  src/physics/coinFaceReader.test.ts \
  src/physics/physicalTossInput.test.ts \
  src/physics/coinPhysics.test.ts \
  src/hooks/usePhysicalTossSimulation.test.ts \
  src/hooks/useCastingSession.test.ts \
  src/App.test.tsx
```

Expected: all listed test files pass.

- [ ] **Step 2: Run the full suite**

Run:

```bash
npm test
```

Expected: pass.

- [ ] **Step 3: Run typecheck/build validation**

Run:

```bash
npm run lint
npm run build
```

Expected: both pass.

- [ ] **Step 4: Inspect public result boundary**

Run:

```bash
rg -n "tossCoins\\(|tossCoinsWithBits\\(|addRandomToss|addManualToss|createCoinPhysicsSimulation\\([0-9]" src
```

Expected: no matches in app/session/physics production paths. Matches in domain tests are acceptable only when they test `coinToss` itself.

- [ ] **Step 5: Commit any verification fixes**

If Step 1 through Step 4 required small import or typing fixes, commit them:

```bash
git add src
git commit -m "test: verify physical toss trust boundary"
```

If no files changed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: this plan implements the phase-one requirements for `PhysicalTossInput`, physical result recording, evidence, no pre-generated faces in session flow, settled snapshot forwarding, and the public physics API boundary.
- Deferred requirements: PC money-cup input, mobile `DeviceMotion` shake-then-still, museum-grade GLB/PBR rendering, result drawer redesign, AI UI polish, and browser visual QA are intentionally deferred to later phase plans.
- Type consistency: the plan uses `PhysicalTossInput`, `CoinPhysicsSnapshot`, `CoinPhysicsSettledReason`, `[CoinFace, CoinFace, CoinFace]`, and `TossEvidence` consistently across hook, session, app, and evidence layers.
