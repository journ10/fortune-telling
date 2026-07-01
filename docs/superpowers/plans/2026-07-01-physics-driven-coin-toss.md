# Physics-Driven Coin Toss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the WebGL coin toss use Rapier physics and derive each line's coin faces from the final settled coin orientations.

**Architecture:** `App` only starts a toss and waits for settled faces. `TabletopScene` owns the visual/physics toss lifecycle and calls `onTossSettled(faces)`. `src/physics/coinPhysics.ts` isolates Rapier setup, stepping, and face detection so the rendering component stays focused on syncing meshes.

**Tech Stack:** React, Three.js, `@dimforge/rapier3d-compat`, Vitest, generated/project coin texture assets.

---

### Task 1: Lock The New Contract With Tests

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/components/TabletopScene.test.tsx`
- Create: `src/physics/coinPhysics.test.ts`

- [x] **Step 1: Write failing tests**

Add tests that assert `App` does not call `tossCoins()` on click, `TabletopScene` settles by returning three faces, and `coinPhysics` exposes Rapier-backed face detection.

- [x] **Step 2: Verify red**

Run:

```bash
npm test -- src/physics/coinPhysics.test.ts
npm test -- src/components/TabletopScene.test.tsx
npm test -- src/App.test.tsx
```

Expected: failures because `coinPhysics` does not exist, `TabletopScene` still takes `pendingToss`, and `App` still calls `tossCoins()`.

### Task 2: Add Rapier Physics Module

**Files:**
- Create: `src/physics/coinPhysics.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Implement `coinPhysics.ts`**

Create a Rapier world with a fixed tabletop and three dynamic cylinder coin bodies. Export `COIN_PHYSICS_ENGINE`, `initCoinPhysics`, `createCoinPhysicsSimulation`, `coinFaceFromVisualRotation`, and `coinFaceFromPhysicsRotation`.

- [x] **Step 2: Run physics tests**

Run:

```bash
npm test -- src/physics/coinPhysics.test.ts
```

Expected: pass.

### Task 3: Wire Physics Faces Through The App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/TabletopScene.tsx`
- Modify: `src/components/TabletopScene.test.tsx`

- [x] **Step 1: Change App toss state**

Replace `pendingToss: CoinToss | null` with `pendingTossId: number | null`. On click, increment an id. On settle, call `createCoinToss(faces)` and record the result.

- [x] **Step 2: Change TabletopScene toss props**

Replace `pendingToss` with `pendingTossId`, call `onTossSettled(faces)`, and use deterministic fallback faces only when WebGL/physics is unavailable.

- [x] **Step 3: Run component and App tests**

Run:

```bash
npm test -- src/components/TabletopScene.test.tsx
npm test -- src/App.test.tsx
```

Expected: pass.

### Task 4: Add Project Coin Texture Asset

**Files:**
- Create: `src/assets/qing-cash-coin-texture.png`
- Modify: `src/components/TabletopScene.tsx`

- [x] **Step 1: Add texture import**

Import the texture asset URL and use `THREE.TextureLoader` to assign left/right sheet regions to front/back coin materials.

- [x] **Step 2: Verify render**

Run WebGL screenshot QA and inspect the settled/tossing states.

### Task 5: Final Verification And Commit

**Files:**
- All touched files

- [x] **Step 1: Full verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass; Vite may keep the known large chunk warning.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json src docs
git commit -m "feat: drive coin tosses with physics"
```
