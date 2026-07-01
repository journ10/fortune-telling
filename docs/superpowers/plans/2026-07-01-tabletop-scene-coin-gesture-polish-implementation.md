# Tabletop Scene Coin Gesture Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current tabletop scene so it has a richer desk surface, traditional square-holed copper cash coins with distinct heads/tails, realistic suspended-to-table toss animation, and a visible floating camera gesture enable flow.

**Architecture:** Keep the existing React modal orchestration and domain rules. Concentrate visual work inside `TabletopScene`, add a focused gesture control component that calls the existing camera adapter, and connect that component from `App` only during casting. Tests exercise jsdom-safe fallback behavior, gesture UI state, and App integration without relying on real WebGL or a real camera.

**Tech Stack:** Vite, React 19, TypeScript, Vitest, React Testing Library, Three.js, existing MediaPipe adapter, plain CSS.

---

## File Structure

- Modify: `src/components/TabletopScene.tsx`
  - Add procedural tabletop texture, coin face textures, traditional cash-coin geometry, hover state, and longer independent toss animation.
- Modify: `src/components/TabletopScene.test.tsx`
  - Update animation timing expectations and assert fallback heads/tails face markers remain visible.
- Create: `src/components/GestureControl.tsx`
  - Floating gesture prompt/status UI. Owns camera lifecycle, MediaPipe recognizer loop, error state, skip state, and gesture-to-toss callback.
- Create: `src/components/GestureControl.test.tsx`
  - Tests prompt rendering, skip behavior, camera start success, and camera start failure using mocks.
- Modify: `src/App.tsx`
  - Render `GestureControl` only while `session.phase === 'casting'`.
- Modify: `src/styles.css`
  - Add richer fallback table/coin styles and floating gesture panel styles.

## Task 1: Traditional Coin Scene And Animation

**Files:**
- Modify: `src/components/TabletopScene.tsx`
- Modify: `src/components/TabletopScene.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write/update failing tests**

In `src/components/TabletopScene.test.tsx`, update the fallback settle timing test to expect the new animation duration and add a fallback face assertion:

```ts
it('keeps distinguishable fallback faces for heads and tails', () => {
  const pendingToss = createCoinToss(['heads', 'tails', 'heads']);

  renderTabletopScene({ pendingToss });

  expect(document.querySelectorAll('.fallbackCoin[data-face="heads"]')).toHaveLength(2);
  expect(document.querySelectorAll('.fallbackCoin[data-face="tails"]')).toHaveLength(1);
});
```

Update timer-based tests so they advance past the new settle duration:

```ts
await act(async () => {
  await vi.advanceTimersByTimeAsync(1900);
});
```

Run:

```bash
npm test -- src/components/TabletopScene.test.tsx
```

Expected: tests fail until the component uses the new timing and fallback markers consistently.

- [ ] **Step 2: Add procedural texture helpers**

In `src/components/TabletopScene.tsx`, add helper functions near the geometry helpers:

```ts
function createTabletopTexture(): THREE.CanvasTexture;
function createCoinFaceTexture(face: CoinFace, variant: number): THREE.CanvasTexture;
function createCoinShape(): THREE.Shape;
function createCoinGroup(variant: number): THREE.Group;
```

The coin face texture draws a round cash coin face on a canvas, including:

- copper radial base
- outer and inner rings
- square hole shadow
- front text `乾` `隆` `通` `宝` for `heads`
- darker oxidation and reverse mint-mark strokes for `tails`
- small deterministic speckles based on `variant`

- [ ] **Step 3: Replace single coin mesh with coin groups**

Keep one side/extrude mesh plus two `ShapeGeometry` face meshes per coin group. Use `heads` texture on the local front face and `tails` texture on the local back face. Preserve square holes in both face meshes by using the same `THREE.Shape` with a hole.

- [ ] **Step 4: Replace simple jump animation**

Replace the current 320ms sine jump with a 1700ms animation:

```ts
const SETTLE_DELAY_MS = 1700;
const SETTLED_HOLD_MS = 520;
```

For each pending toss, build three deterministic animation plans from `currentThrow`, `pendingToss.faces`, and coin index. Each plan needs:

- hover position
- landing position
- start height
- lateral drift
- spin multipliers
- bounce offset
- final face rotation from `targetRotationForFace`

The render loop should show:

- no pending toss: hover above table
- pending toss: independent fall, spin, bounce, and settle
- immediately after settle: brief table hold before returning to hover

- [ ] **Step 5: Improve fallback CSS**

In `src/styles.css`, update `.tabletopScene::before`, `.fallbackCoin`, `.fallbackCoin::before`, `.fallbackCoin::after`, and `.fallbackCoin[data-face="tails"]` so fallback coins also show:

- square hole
- ringed cash-coin face
- front/reverse color difference
- faint face text or reverse marks

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- src/components/TabletopScene.test.tsx src/components/TabletopScene.gesture.test.tsx
npm run lint
```

Expected: focused tests and TypeScript pass.

## Task 2: Floating Gesture Camera Control

**Files:**
- Create: `src/components/GestureControl.tsx`
- Create: `src/components/GestureControl.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing component tests**

Create `src/components/GestureControl.test.tsx` with tests that mock `../camera/gestureRecognizer`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GestureControl from './GestureControl';
import { startCamera } from '../camera/gestureRecognizer';

vi.mock('../camera/gestureRecognizer', () => ({
  createGestureGate: () => ({ update: vi.fn(() => false) }),
  createMediaPipeRecognizer: vi.fn(async () => ({ recognizeForVideo: vi.fn(() => ({ gestures: [] })) })),
  getTopGesture: vi.fn(() => 'None'),
  startCamera: vi.fn(async () => ({ getTracks: () => [] })),
  stopCamera: vi.fn()
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('GestureControl', () => {
  it('shows a floating camera enable prompt while casting', () => {
    render(<GestureControl isCasting isTossing={false} onGestureToss={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: '手势投掷' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '启用摄像头' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '手动投掷' })).toBeInTheDocument();
  });

  it('hides the prompt when manual tossing is selected', async () => {
    const user = userEvent.setup();

    render(<GestureControl isCasting isTossing={false} onGestureToss={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '手动投掷' }));

    expect(screen.queryByRole('dialog', { name: '手势投掷' })).not.toBeInTheDocument();
  });

  it('starts the camera when enabled', async () => {
    const user = userEvent.setup();

    render(<GestureControl isCasting isTossing={false} onGestureToss={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '启用摄像头' }));

    await waitFor(() => {
      expect(startCamera).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('摄像头已启用')).toBeInTheDocument();
  });
});
```

Run:

```bash
npm test -- src/components/GestureControl.test.tsx
```

Expected: fail because `GestureControl` does not exist.

- [ ] **Step 2: Implement `GestureControl`**

Create a component with this public interface:

```ts
interface GestureControlProps {
  isCasting: boolean;
  isTossing: boolean;
  onGestureToss: () => void;
}
```

Behavior:

- returns `null` when `isCasting` is false
- prompt mode shows a floating `role="dialog"` with title `手势投掷`
- manual button sets internal mode to `dismissed`
- enable button calls `startCamera(video)`, then `createMediaPipeRecognizer()`
- active mode shows the video preview and status text `摄像头已启用`
- recognizer loop calls `onGestureToss()` only when `createGestureGate(1500).update(...)` returns true and `isTossing` is false
- cleanup cancels `requestAnimationFrame`, stops camera tracks, and closes the recognizer if it exposes `close()`

- [ ] **Step 3: Connect from App**

In `src/App.tsx`, import and render:

```tsx
<GestureControl
  isCasting={session.phase === 'casting'}
  isTossing={pendingToss !== null}
  onGestureToss={requestToss}
/>
```

Place it after `CastProgressToast` so the main tabletop remains persistent and the gesture UI is a floating overlay.

- [ ] **Step 4: Style the floating panel**

In `src/styles.css`, add:

- `.gesturePanel`
- `.gesturePanel-active`
- `.gesturePreview`
- `.gestureStatus`
- `.gestureActions`

Panel must be fixed, top/right on desktop, bottom sheet-like on mobile, visually consistent with existing modal glass, and not cover the coins on narrow screens.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/components/GestureControl.test.tsx
npm test -- src/components/TabletopScene.test.tsx src/components/TabletopScene.gesture.test.tsx
npm run lint
```

Expected: all pass.

## Task 3: End-To-End Regression And Visual QA

**Files:**
- Modify only if failures reveal issues in files touched by Tasks 1-2.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass. Build may keep the existing Vite large chunk warning, but no TypeScript or test failure is allowed.

- [ ] **Step 2: Start dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite serves the app at a local URL.

- [ ] **Step 3: Browser visual checks**

Using browser automation or manual screenshot inspection, verify:

- no API config: top floating AI settings dialog appears
- after configured/question started: tabletop has richer desk texture
- three coins are visibly suspended before toss
- fallback and WebGL coins show square holes and distinct heads/tails
- toss animation falls to table with independent paths
- gesture prompt appears during casting and camera enable UI is visible
- result dialog behavior still matches prior design

## Self-Review

- Spec coverage: the plan covers richer scene, traditional coin simulation, suspended-to-table animation, and visible gesture camera flow.
- Placeholder scan: no red-flag placeholder terms remain.
- Type consistency: `GestureControlProps`, `pendingToss`, `CoinFace`, `onGestureToss`, and existing `TabletopScene` props match current code.
