# Camera I Ching Gesture App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Vite/React/TypeScript web app where users enter a question, perform six camera-triggered coin tosses, and receive a traceable I Ching result.

**Architecture:** Keep the I Ching rules in pure TypeScript modules with unit tests, then compose them into React state and UI. Camera gesture recognition is an optional adapter around MediaPipe; manual toss remains a first-class path so the app works when camera access or model loading fails.

**Tech Stack:** Vite, React, TypeScript, Vitest, React Testing Library, MediaPipe `@mediapipe/tasks-vision`, CSS modules or plain CSS.

---

## File Structure

- `package.json`: npm scripts and dependencies.
- `index.html`: static Vite entry point.
- `src/main.tsx`: React bootstrap.
- `src/App.tsx`: top-level application shell and phase routing.
- `src/App.test.tsx`: integration tests for the primary user flow.
- `src/styles.css`: global responsive visual system.
- `src/domain/types.ts`: shared domain types for questions, coins, lines, hexagrams, and interpretations.
- `src/domain/coinToss.ts`: pure three-coin toss scoring and casting helpers.
- `src/domain/coinToss.test.ts`: tests for 6/7/8/9 line mapping and casting order.
- `src/domain/trigrams.ts`: trigram patterns and King Wen lookup matrix.
- `src/domain/hexagrams.ts`: pure hexagram resolution and changed-hexagram calculation.
- `src/domain/hexagrams.test.ts`: tests for known hexagram mappings and changing lines.
- `src/data/hexagramCatalog.ts`: local 64-hexagram catalog with names, texts, keywords, summaries, and six line records.
- `src/data/hexagramCatalog.test.ts`: data completeness tests.
- `src/domain/interpretation.ts`: deterministic interpretation generation from question type, hexagram data, moving lines, and changed hexagram.
- `src/domain/interpretation.test.ts`: tests for traceable interpretation output.
- `src/hooks/useCastingSession.ts`: React hook for casting state, manual tosses, reset, and result creation.
- `src/hooks/useCastingSession.test.ts`: hook-level tests for six-toss completion and reset.
- `src/camera/gestureRecognizer.ts`: MediaPipe gesture adapter and browser camera lifecycle helpers.
- `src/camera/gestureRecognizer.test.ts`: tests for gesture state transitions and cooldown logic.
- `src/components/QuestionEntry.tsx`: question input and quick question buttons.
- `src/components/CastingStage.tsx`: camera/manual casting screen and six-line progress.
- `src/components/CoinAnimation.tsx`: visual coin toss feedback.
- `src/components/HexagramLines.tsx`: reusable six-line renderer.
- `src/components/ResultView.tsx`: result page with direct reading and traditional basis.
- `src/components/PrivacyNotice.tsx`: short local-camera privacy copy.
- `docs/superpowers/specs/2026-06-30-camera-iching-design.md`: approved design spec.

## Task 1: Scaffold Vite, React, TypeScript, And Tests

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/App.test.tsx`
- Create: `src/setupTests.ts`
- Create: `src/styles.css`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`

- [ ] **Step 1: Create the npm project files**

Create `package.json`:

```json
{
  "name": "fortune-telling",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc -b --pretty false"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "latest",
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "typescript": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/user-event": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "jsdom": "latest",
    "vitest": "latest"
  }
}
```

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>六爻起卦</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true
  }
});
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

Create `src/setupTests.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Create `src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="appShell">
      <section className="heroPanel" aria-labelledby="app-title">
        <p className="eyebrow">摄像头手势六爻</p>
        <h1 id="app-title">三钱成卦</h1>
        <p className="intro">输入所问之事，以六次掷钱完成一卦。</p>
      </section>
    </main>
  );
}
```

Create `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the initial product title', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '三钱成卦' })).toBeInTheDocument();
    expect(screen.getByText('输入所问之事，以六次掷钱完成一卦。')).toBeInTheDocument();
  });
});
```

Create `src/styles.css`:

```css
:root {
  color: #f6efe0;
  background: #11100d;
  font-family: "Songti SC", "Noto Serif CJK SC", "Microsoft YaHei", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
textarea {
  font: inherit;
}

.appShell {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at 50% 0%, rgba(204, 151, 62, 0.18), transparent 34rem),
    linear-gradient(135deg, #16130f 0%, #0f1115 58%, #18140f 100%);
}

.heroPanel {
  width: min(960px, 100%);
  margin: 0 auto;
  padding: 32px 0;
}

.eyebrow {
  margin: 0 0 8px;
  color: #d7aa61;
  letter-spacing: 0;
}

h1 {
  margin: 0;
  font-size: clamp(2.25rem, 8vw, 5rem);
  line-height: 1;
  letter-spacing: 0;
}

.intro {
  max-width: 36rem;
  color: #d8ccba;
  font-size: 1.125rem;
  line-height: 1.7;
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: npm creates `package-lock.json` and installs Vite, React, TypeScript, Vitest, Testing Library, and MediaPipe.

- [ ] **Step 3: Run the first test**

Run:

```bash
npm test
```

Expected: PASS, `App renders the initial product title`.

- [ ] **Step 4: Run the type/build check**

Run:

```bash
npm run build
```

Expected: PASS, Vite writes a production build to `dist/`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json index.html vite.config.ts tsconfig.json tsconfig.node.json src
git commit -m "chore: scaffold gesture divination app"
```

## Task 2: Implement Three-Coin Toss Rules

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/coinToss.ts`
- Create: `src/domain/coinToss.test.ts`

- [ ] **Step 1: Write failing tests for coin scoring and line creation**

Create `src/domain/coinToss.test.ts`:

```ts
import {
  buildCasting,
  createCoinToss,
  lineFromScore,
  tossCoinsWithBits
} from './coinToss';

describe('coin toss rules', () => {
  it.each([
    [['tails', 'tails', 'tails'], 6, 'old-yin', false, true],
    [['heads', 'tails', 'tails'], 7, 'young-yang', true, false],
    [['heads', 'heads', 'tails'], 8, 'young-yin', false, false],
    [['heads', 'heads', 'heads'], 9, 'old-yang', true, true]
  ] as const)('maps %j to score %i', (faces, score, name, isYang, isMoving) => {
    const toss = createCoinToss(faces);

    expect(toss.score).toBe(score);
    expect(toss.line.name).toBe(name);
    expect(toss.line.isYang).toBe(isYang);
    expect(toss.line.isMoving).toBe(isMoving);
  });

  it('rejects scores outside the three-coin range', () => {
    expect(() => lineFromScore(5)).toThrow('Unsupported coin score: 5');
    expect(() => lineFromScore(10)).toThrow('Unsupported coin score: 10');
  });

  it('creates deterministic tosses from bits', () => {
    expect(tossCoinsWithBits([false, true, true])).toMatchObject({
      faces: ['tails', 'heads', 'heads'],
      score: 8
    });
  });

  it('builds a casting from bottom line to top line', () => {
    const tosses = [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['tails', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails'])
    ];

    const casting = buildCasting('今日运势', 'general', tosses);

    expect(casting.tosses).toHaveLength(6);
    expect(casting.lines.map((line) => line.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(casting.lines.map((line) => line.isMoving)).toEqual([false, false, true, true, false, false]);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- src/domain/coinToss.test.ts
```

Expected: FAIL because `src/domain/coinToss.ts` does not exist.

- [ ] **Step 3: Add shared domain types**

Create `src/domain/types.ts`:

```ts
export type QuestionType = 'general' | 'career' | 'relationship' | 'wealth' | 'decision';

export type CoinFace = 'heads' | 'tails';

export type LineName = 'old-yin' | 'young-yang' | 'young-yin' | 'old-yang';

export type LineScore = 6 | 7 | 8 | 9;

export interface LineValue {
  score: LineScore;
  name: LineName;
  isYang: boolean;
  isMoving: boolean;
}

export interface CastLine extends LineValue {
  position: 1 | 2 | 3 | 4 | 5 | 6;
  changedIsYang: boolean;
}

export interface CoinToss {
  faces: [CoinFace, CoinFace, CoinFace];
  score: LineScore;
  line: LineValue;
}

export interface Casting {
  question: string;
  questionType: QuestionType;
  tosses: CoinToss[];
  lines: CastLine[];
  createdAt: string;
}

export interface HexagramRef {
  id: number;
  name: string;
  upperTrigram: string;
  lowerTrigram: string;
}

export interface HexagramLineText {
  position: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  original: string;
  summary: string;
  tags: string[];
}

export interface HexagramCatalogEntry extends HexagramRef {
  pattern: string;
  judgment: string;
  image: string;
  keywords: string[];
  summary: string;
  lines: HexagramLineText[];
}

export interface Interpretation {
  question: string;
  questionType: QuestionType;
  originalHexagram: HexagramCatalogEntry;
  changedHexagram: HexagramCatalogEntry | null;
  movingLines: HexagramLineText[];
  headline: string;
  plainText: string;
  advice: string[];
  basis: string[];
}
```

- [ ] **Step 4: Implement coin toss rules**

Create `src/domain/coinToss.ts`:

```ts
import type {
  CastLine,
  CoinFace,
  CoinToss,
  Casting,
  LineScore,
  LineValue,
  QuestionType
} from './types';

const LINE_BY_SCORE: Record<LineScore, LineValue> = {
  6: { score: 6, name: 'old-yin', isYang: false, isMoving: true },
  7: { score: 7, name: 'young-yang', isYang: true, isMoving: false },
  8: { score: 8, name: 'young-yin', isYang: false, isMoving: false },
  9: { score: 9, name: 'old-yang', isYang: true, isMoving: true }
};

export function lineFromScore(score: number): LineValue {
  if (score === 6 || score === 7 || score === 8 || score === 9) {
    return LINE_BY_SCORE[score];
  }

  throw new Error(`Unsupported coin score: ${score}`);
}

export function createCoinToss(faces: readonly CoinFace[]): CoinToss {
  if (faces.length !== 3) {
    throw new Error(`A toss requires exactly 3 coins, received ${faces.length}`);
  }

  const score = faces.reduce((total, face) => total + (face === 'heads' ? 3 : 2), 0);
  const typedFaces = faces as [CoinFace, CoinFace, CoinFace];

  return {
    faces: typedFaces,
    score: lineFromScore(score).score,
    line: lineFromScore(score)
  };
}

export function tossCoinsWithBits(bits: readonly boolean[]): CoinToss {
  if (bits.length !== 3) {
    throw new Error(`A toss requires exactly 3 random bits, received ${bits.length}`);
  }

  return createCoinToss(bits.map((bit) => (bit ? 'heads' : 'tails')));
}

export function tossCoins(): CoinToss {
  const values = new Uint8Array(3);
  crypto.getRandomValues(values);
  return tossCoinsWithBits(Array.from(values, (value) => value % 2 === 1));
}

export function buildCasting(
  question: string,
  questionType: QuestionType,
  tosses: readonly CoinToss[],
  createdAt = new Date().toISOString()
): Casting {
  if (tosses.length !== 6) {
    throw new Error(`A complete casting requires 6 tosses, received ${tosses.length}`);
  }

  const lines = tosses.map<CastLine>((toss, index) => ({
    ...toss.line,
    position: (index + 1) as CastLine['position'],
    changedIsYang: toss.line.isMoving ? !toss.line.isYang : toss.line.isYang
  }));

  return {
    question,
    questionType,
    tosses: [...tosses],
    lines,
    createdAt
  };
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/domain/coinToss.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/coinToss.ts src/domain/coinToss.test.ts
git commit -m "feat: add three coin casting rules"
```

## Task 3: Resolve Hexagrams And Changing Lines

**Files:**
- Create: `src/domain/trigrams.ts`
- Create: `src/domain/hexagrams.ts`
- Create: `src/domain/hexagrams.test.ts`

- [ ] **Step 1: Write failing hexagram tests**

Create `src/domain/hexagrams.test.ts`:

```ts
import { createCoinToss, buildCasting } from './coinToss';
import { getChangedPattern, getHexagramByLines, getMovingLinePositions } from './hexagrams';

describe('hexagram resolution', () => {
  it('resolves all-yang lines as hexagram 1', () => {
    const hexagram = getHexagramByLines([true, true, true, true, true, true]);

    expect(hexagram).toMatchObject({
      id: 1,
      name: '乾为天',
      lowerTrigram: '乾',
      upperTrigram: '乾'
    });
  });

  it('resolves all-yin lines as hexagram 2', () => {
    const hexagram = getHexagramByLines([false, false, false, false, false, false]);

    expect(hexagram).toMatchObject({
      id: 2,
      name: '坤为地',
      lowerTrigram: '坤',
      upperTrigram: '坤'
    });
  });

  it('resolves bottom heaven and top earth as hexagram 11', () => {
    const hexagram = getHexagramByLines([true, true, true, false, false, false]);

    expect(hexagram).toMatchObject({
      id: 11,
      name: '地天泰',
      lowerTrigram: '乾',
      upperTrigram: '坤'
    });
  });

  it('returns moving line positions from a complete casting', () => {
    const casting = buildCasting('今日运势', 'general', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'heads', 'tails']),
      createCoinToss(['tails', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails'])
    ]);

    expect(getMovingLinePositions(casting.lines)).toEqual([2, 4]);
  });

  it('creates the changed pattern by flipping moving lines', () => {
    const casting = buildCasting('今日运势', 'general', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'heads', 'tails']),
      createCoinToss(['tails', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails'])
    ]);

    expect(casting.lines.map((line) => line.isYang)).toEqual([true, true, false, false, true, false]);
    expect(getChangedPattern(casting.lines)).toEqual([true, false, false, true, true, false]);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- src/domain/hexagrams.test.ts
```

Expected: FAIL because `src/domain/hexagrams.ts` does not exist.

- [ ] **Step 3: Add trigram and King Wen lookup data**

Create `src/domain/trigrams.ts`:

```ts
import type { HexagramRef } from './types';

export type TrigramName = '乾' | '兑' | '离' | '震' | '巽' | '坎' | '艮' | '坤';

export interface Trigram {
  name: TrigramName;
  pattern: string;
}

export const TRIGRAMS: Record<string, Trigram> = {
  '111': { name: '乾', pattern: '111' },
  '110': { name: '兑', pattern: '110' },
  '101': { name: '离', pattern: '101' },
  '100': { name: '震', pattern: '100' },
  '011': { name: '巽', pattern: '011' },
  '010': { name: '坎', pattern: '010' },
  '001': { name: '艮', pattern: '001' },
  '000': { name: '坤', pattern: '000' }
};

export const KING_WEN_MATRIX: Record<TrigramName, Record<TrigramName, HexagramRef>> = {
  乾: {
    乾: { id: 1, name: '乾为天', upperTrigram: '乾', lowerTrigram: '乾' },
    兑: { id: 43, name: '泽天夬', upperTrigram: '兑', lowerTrigram: '乾' },
    离: { id: 14, name: '火天大有', upperTrigram: '离', lowerTrigram: '乾' },
    震: { id: 34, name: '雷天大壮', upperTrigram: '震', lowerTrigram: '乾' },
    巽: { id: 9, name: '风天小畜', upperTrigram: '巽', lowerTrigram: '乾' },
    坎: { id: 5, name: '水天需', upperTrigram: '坎', lowerTrigram: '乾' },
    艮: { id: 26, name: '山天大畜', upperTrigram: '艮', lowerTrigram: '乾' },
    坤: { id: 11, name: '地天泰', upperTrigram: '坤', lowerTrigram: '乾' }
  },
  兑: {
    乾: { id: 10, name: '天泽履', upperTrigram: '乾', lowerTrigram: '兑' },
    兑: { id: 58, name: '兑为泽', upperTrigram: '兑', lowerTrigram: '兑' },
    离: { id: 38, name: '火泽睽', upperTrigram: '离', lowerTrigram: '兑' },
    震: { id: 54, name: '雷泽归妹', upperTrigram: '震', lowerTrigram: '兑' },
    巽: { id: 61, name: '风泽中孚', upperTrigram: '巽', lowerTrigram: '兑' },
    坎: { id: 60, name: '水泽节', upperTrigram: '坎', lowerTrigram: '兑' },
    艮: { id: 41, name: '山泽损', upperTrigram: '艮', lowerTrigram: '兑' },
    坤: { id: 19, name: '地泽临', upperTrigram: '坤', lowerTrigram: '兑' }
  },
  离: {
    乾: { id: 13, name: '天火同人', upperTrigram: '乾', lowerTrigram: '离' },
    兑: { id: 49, name: '泽火革', upperTrigram: '兑', lowerTrigram: '离' },
    离: { id: 30, name: '离为火', upperTrigram: '离', lowerTrigram: '离' },
    震: { id: 55, name: '雷火丰', upperTrigram: '震', lowerTrigram: '离' },
    巽: { id: 37, name: '风火家人', upperTrigram: '巽', lowerTrigram: '离' },
    坎: { id: 63, name: '水火既济', upperTrigram: '坎', lowerTrigram: '离' },
    艮: { id: 22, name: '山火贲', upperTrigram: '艮', lowerTrigram: '离' },
    坤: { id: 36, name: '地火明夷', upperTrigram: '坤', lowerTrigram: '离' }
  },
  震: {
    乾: { id: 25, name: '天雷无妄', upperTrigram: '乾', lowerTrigram: '震' },
    兑: { id: 17, name: '泽雷随', upperTrigram: '兑', lowerTrigram: '震' },
    离: { id: 21, name: '火雷噬嗑', upperTrigram: '离', lowerTrigram: '震' },
    震: { id: 51, name: '震为雷', upperTrigram: '震', lowerTrigram: '震' },
    巽: { id: 42, name: '风雷益', upperTrigram: '巽', lowerTrigram: '震' },
    坎: { id: 3, name: '水雷屯', upperTrigram: '坎', lowerTrigram: '震' },
    艮: { id: 27, name: '山雷颐', upperTrigram: '艮', lowerTrigram: '震' },
    坤: { id: 24, name: '地雷复', upperTrigram: '坤', lowerTrigram: '震' }
  },
  巽: {
    乾: { id: 44, name: '天风姤', upperTrigram: '乾', lowerTrigram: '巽' },
    兑: { id: 28, name: '泽风大过', upperTrigram: '兑', lowerTrigram: '巽' },
    离: { id: 50, name: '火风鼎', upperTrigram: '离', lowerTrigram: '巽' },
    震: { id: 32, name: '雷风恒', upperTrigram: '震', lowerTrigram: '巽' },
    巽: { id: 57, name: '巽为风', upperTrigram: '巽', lowerTrigram: '巽' },
    坎: { id: 48, name: '水风井', upperTrigram: '坎', lowerTrigram: '巽' },
    艮: { id: 18, name: '山风蛊', upperTrigram: '艮', lowerTrigram: '巽' },
    坤: { id: 46, name: '地风升', upperTrigram: '坤', lowerTrigram: '巽' }
  },
  坎: {
    乾: { id: 6, name: '天水讼', upperTrigram: '乾', lowerTrigram: '坎' },
    兑: { id: 47, name: '泽水困', upperTrigram: '兑', lowerTrigram: '坎' },
    离: { id: 64, name: '火水未济', upperTrigram: '离', lowerTrigram: '坎' },
    震: { id: 40, name: '雷水解', upperTrigram: '震', lowerTrigram: '坎' },
    巽: { id: 59, name: '风水涣', upperTrigram: '巽', lowerTrigram: '坎' },
    坎: { id: 29, name: '坎为水', upperTrigram: '坎', lowerTrigram: '坎' },
    艮: { id: 4, name: '山水蒙', upperTrigram: '艮', lowerTrigram: '坎' },
    坤: { id: 7, name: '地水师', upperTrigram: '坤', lowerTrigram: '坎' }
  },
  艮: {
    乾: { id: 33, name: '天山遯', upperTrigram: '乾', lowerTrigram: '艮' },
    兑: { id: 31, name: '泽山咸', upperTrigram: '兑', lowerTrigram: '艮' },
    离: { id: 56, name: '火山旅', upperTrigram: '离', lowerTrigram: '艮' },
    震: { id: 62, name: '雷山小过', upperTrigram: '震', lowerTrigram: '艮' },
    巽: { id: 53, name: '风山渐', upperTrigram: '巽', lowerTrigram: '艮' },
    坎: { id: 39, name: '水山蹇', upperTrigram: '坎', lowerTrigram: '艮' },
    艮: { id: 52, name: '艮为山', upperTrigram: '艮', lowerTrigram: '艮' },
    坤: { id: 15, name: '地山谦', upperTrigram: '坤', lowerTrigram: '艮' }
  },
  坤: {
    乾: { id: 12, name: '天地否', upperTrigram: '乾', lowerTrigram: '坤' },
    兑: { id: 45, name: '泽地萃', upperTrigram: '兑', lowerTrigram: '坤' },
    离: { id: 35, name: '火地晋', upperTrigram: '离', lowerTrigram: '坤' },
    震: { id: 16, name: '雷地豫', upperTrigram: '震', lowerTrigram: '坤' },
    巽: { id: 20, name: '风地观', upperTrigram: '巽', lowerTrigram: '坤' },
    坎: { id: 8, name: '水地比', upperTrigram: '坎', lowerTrigram: '坤' },
    艮: { id: 23, name: '山地剥', upperTrigram: '艮', lowerTrigram: '坤' },
    坤: { id: 2, name: '坤为地', upperTrigram: '坤', lowerTrigram: '坤' }
  }
};
```

- [ ] **Step 4: Implement hexagram helpers**

Create `src/domain/hexagrams.ts`:

```ts
import { KING_WEN_MATRIX, TRIGRAMS, type TrigramName } from './trigrams';
import type { CastLine, HexagramRef } from './types';

function toPattern(linesBottomToTop: readonly boolean[]): string {
  if (linesBottomToTop.length !== 6 && linesBottomToTop.length !== 3) {
    throw new Error(`Expected 3 or 6 lines, received ${linesBottomToTop.length}`);
  }

  return linesBottomToTop.map((line) => (line ? '1' : '0')).join('');
}

function trigramName(linesBottomToTop: readonly boolean[]): TrigramName {
  const pattern = toPattern(linesBottomToTop);
  const trigram = TRIGRAMS[pattern];

  if (!trigram) {
    throw new Error(`Unknown trigram pattern: ${pattern}`);
  }

  return trigram.name;
}

export function getHexagramByLines(linesBottomToTop: readonly boolean[]): HexagramRef {
  if (linesBottomToTop.length !== 6) {
    throw new Error(`A hexagram requires 6 lines, received ${linesBottomToTop.length}`);
  }

  const lowerTrigram = trigramName(linesBottomToTop.slice(0, 3));
  const upperTrigram = trigramName(linesBottomToTop.slice(3, 6));

  return KING_WEN_MATRIX[lowerTrigram][upperTrigram];
}

export function getMovingLinePositions(lines: readonly CastLine[]): number[] {
  return lines.filter((line) => line.isMoving).map((line) => line.position);
}

export function getOriginalPattern(lines: readonly CastLine[]): boolean[] {
  return lines.map((line) => line.isYang);
}

export function getChangedPattern(lines: readonly CastLine[]): boolean[] {
  return lines.map((line) => line.changedIsYang);
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/domain/hexagrams.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/trigrams.ts src/domain/hexagrams.ts src/domain/hexagrams.test.ts
git commit -m "feat: resolve hexagrams from cast lines"
```

## Task 4: Add Local Hexagram Catalog And Completeness Checks

**Files:**
- Create: `src/data/hexagramCatalog.ts`
- Create: `src/data/hexagramCatalog.test.ts`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Write failing data completeness tests**

Create `src/data/hexagramCatalog.test.ts`:

```ts
import { HEXAGRAM_CATALOG, getHexagramEntry } from './hexagramCatalog';

describe('hexagram catalog', () => {
  it('contains all 64 King Wen hexagrams', () => {
    expect(HEXAGRAM_CATALOG).toHaveLength(64);
    expect(new Set(HEXAGRAM_CATALOG.map((entry) => entry.id)).size).toBe(64);
  });

  it('contains complete traditional basis fields for every hexagram', () => {
    for (const entry of HEXAGRAM_CATALOG) {
      expect(entry.name).toMatch(/\S/);
      expect(entry.upperTrigram).toMatch(/\S/);
      expect(entry.lowerTrigram).toMatch(/\S/);
      expect(entry.pattern).toMatch(/^[01]{6}$/);
      expect(entry.judgment).toMatch(/\S/);
      expect(entry.image).toMatch(/\S/);
      expect(entry.keywords.length).toBeGreaterThanOrEqual(3);
      expect(entry.summary).toMatch(/\S/);
      expect(entry.lines).toHaveLength(6);

      for (const line of entry.lines) {
        expect(line.title).toMatch(/\S/);
        expect(line.original).toMatch(/\S/);
        expect(line.summary).toMatch(/\S/);
        expect(line.tags.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('finds a known hexagram by id', () => {
    expect(getHexagramEntry(1)).toMatchObject({
      id: 1,
      name: '乾为天',
      judgment: expect.stringContaining('元亨利贞')
    });
  });

  it('throws for missing catalog ids', () => {
    expect(() => getHexagramEntry(65)).toThrow('Missing hexagram catalog entry: 65');
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- src/data/hexagramCatalog.test.ts
```

Expected: FAIL because `src/data/hexagramCatalog.ts` does not exist.

- [ ] **Step 3: Create the catalog module with seed records**

Create `src/data/hexagramCatalog.ts` with this structure and the first two checked records:

```ts
import type { HexagramCatalogEntry } from '../domain/types';

export const HEXAGRAM_CATALOG: HexagramCatalogEntry[] = [
  {
    id: 1,
    name: '乾为天',
    upperTrigram: '乾',
    lowerTrigram: '乾',
    pattern: '111111',
    judgment: '乾。元亨利贞。',
    image: '天行健，君子以自强不息。',
    keywords: ['创造', '主动', '刚健', '开端'],
    summary: '乾卦主刚健进取，适合主动开局，但需要守正与节制。',
    lines: [
      {
        position: 1,
        title: '初九',
        original: '潜龙勿用。',
        summary: '时机未到，先积蓄力量，不宜急于表现。',
        tags: ['等待', '蓄势']
      },
      {
        position: 2,
        title: '九二',
        original: '见龙在田，利见大人。',
        summary: '能力开始显露，适合寻求可靠支持与正向合作。',
        tags: ['显露', '合作']
      },
      {
        position: 3,
        title: '九三',
        original: '君子终日乾乾，夕惕若，厉无咎。',
        summary: '处在压力和推进并存的位置，保持警惕可以避错。',
        tags: ['谨慎', '勤勉']
      },
      {
        position: 4,
        title: '九四',
        original: '或跃在渊，无咎。',
        summary: '可以试探性前进，但要保留退路。',
        tags: ['试探', '转机']
      },
      {
        position: 5,
        title: '九五',
        original: '飞龙在天，利见大人。',
        summary: '局势处在高点，适合发挥领导力并借助关键资源。',
        tags: ['高位', '成事']
      },
      {
        position: 6,
        title: '上九',
        original: '亢龙有悔。',
        summary: '过度强势会带来后悔，越到高处越要收敛。',
        tags: ['节制', '警惕']
      }
    ]
  },
  {
    id: 2,
    name: '坤为地',
    upperTrigram: '坤',
    lowerTrigram: '坤',
    pattern: '000000',
    judgment: '坤。元亨，利牝马之贞。',
    image: '地势坤，君子以厚德载物。',
    keywords: ['承载', '顺势', '包容', '稳定'],
    summary: '坤卦主顺势承载，适合稳扎稳打，以耐心和配合成事。',
    lines: [
      {
        position: 1,
        title: '初六',
        original: '履霜，坚冰至。',
        summary: '细小征兆会累积成大变化，早发现早处理。',
        tags: ['预警', '谨慎']
      },
      {
        position: 2,
        title: '六二',
        original: '直方大，不习无不利。',
        summary: '保持正直、稳定和宽厚，不刻意反而有利。',
        tags: ['守正', '稳定']
      },
      {
        position: 3,
        title: '六三',
        original: '含章可贞。或从王事，无成有终。',
        summary: '有能力但不必争功，配合大局可得善终。',
        tags: ['内敛', '配合']
      },
      {
        position: 4,
        title: '六四',
        original: '括囊，无咎无誉。',
        summary: '环境不明时少说少动，可以避开损失。',
        tags: ['收敛', '避险']
      },
      {
        position: 5,
        title: '六五',
        original: '黄裳，元吉。',
        summary: '以中正谦和处事，容易得到稳定好结果。',
        tags: ['中正', '吉']
      },
      {
        position: 6,
        title: '上六',
        original: '龙战于野，其血玄黄。',
        summary: '柔顺走到极端会转为冲突，需避免硬碰硬。',
        tags: ['冲突', '克制']
      }
    ]
  }
];

export function getHexagramEntry(id: number): HexagramCatalogEntry {
  const entry = HEXAGRAM_CATALOG.find((candidate) => candidate.id === id);

  if (!entry) {
    throw new Error(`Missing hexagram catalog entry: ${id}`);
  }

  return entry;
}
```

- [ ] **Step 4: Add the remaining catalog records from the fixed index**

Add one `HexagramCatalogEntry` for each row below. The `id`, `name`, `upperTrigram`, `lowerTrigram`, and `pattern` values must match this table exactly. For `judgment`, `image`, and each line `original`, use public-domain Zhouyi text. For `summary` and `tags`, write concise non-predictive interpretations that paraphrase the original text and avoid absolute claims.

| id | name | upperTrigram | lowerTrigram | pattern |
| --- | --- | --- | --- | --- |
| 1 | 乾为天 | 乾 | 乾 | 111111 |
| 2 | 坤为地 | 坤 | 坤 | 000000 |
| 3 | 水雷屯 | 坎 | 震 | 100010 |
| 4 | 山水蒙 | 艮 | 坎 | 010001 |
| 5 | 水天需 | 坎 | 乾 | 111010 |
| 6 | 天水讼 | 乾 | 坎 | 010111 |
| 7 | 地水师 | 坤 | 坎 | 010000 |
| 8 | 水地比 | 坎 | 坤 | 000010 |
| 9 | 风天小畜 | 巽 | 乾 | 111011 |
| 10 | 天泽履 | 乾 | 兑 | 110111 |
| 11 | 地天泰 | 坤 | 乾 | 111000 |
| 12 | 天地否 | 乾 | 坤 | 000111 |
| 13 | 天火同人 | 乾 | 离 | 101111 |
| 14 | 火天大有 | 离 | 乾 | 111101 |
| 15 | 地山谦 | 坤 | 艮 | 001000 |
| 16 | 雷地豫 | 震 | 坤 | 000100 |
| 17 | 泽雷随 | 兑 | 震 | 100110 |
| 18 | 山风蛊 | 艮 | 巽 | 011001 |
| 19 | 地泽临 | 坤 | 兑 | 110000 |
| 20 | 风地观 | 巽 | 坤 | 000011 |
| 21 | 火雷噬嗑 | 离 | 震 | 100101 |
| 22 | 山火贲 | 艮 | 离 | 101001 |
| 23 | 山地剥 | 艮 | 坤 | 000001 |
| 24 | 地雷复 | 坤 | 震 | 100000 |
| 25 | 天雷无妄 | 乾 | 震 | 100111 |
| 26 | 山天大畜 | 艮 | 乾 | 111001 |
| 27 | 山雷颐 | 艮 | 震 | 100001 |
| 28 | 泽风大过 | 兑 | 巽 | 011110 |
| 29 | 坎为水 | 坎 | 坎 | 010010 |
| 30 | 离为火 | 离 | 离 | 101101 |
| 31 | 泽山咸 | 兑 | 艮 | 001110 |
| 32 | 雷风恒 | 震 | 巽 | 011100 |
| 33 | 天山遯 | 乾 | 艮 | 001111 |
| 34 | 雷天大壮 | 震 | 乾 | 111100 |
| 35 | 火地晋 | 离 | 坤 | 000101 |
| 36 | 地火明夷 | 坤 | 离 | 101000 |
| 37 | 风火家人 | 巽 | 离 | 101011 |
| 38 | 火泽睽 | 离 | 兑 | 110101 |
| 39 | 水山蹇 | 坎 | 艮 | 001010 |
| 40 | 雷水解 | 震 | 坎 | 010100 |
| 41 | 山泽损 | 艮 | 兑 | 110001 |
| 42 | 风雷益 | 巽 | 震 | 100011 |
| 43 | 泽天夬 | 兑 | 乾 | 111110 |
| 44 | 天风姤 | 乾 | 巽 | 011111 |
| 45 | 泽地萃 | 兑 | 坤 | 000110 |
| 46 | 地风升 | 坤 | 巽 | 011000 |
| 47 | 泽水困 | 兑 | 坎 | 010110 |
| 48 | 水风井 | 坎 | 巽 | 011010 |
| 49 | 泽火革 | 兑 | 离 | 101110 |
| 50 | 火风鼎 | 离 | 巽 | 011101 |
| 51 | 震为雷 | 震 | 震 | 100100 |
| 52 | 艮为山 | 艮 | 艮 | 001001 |
| 53 | 风山渐 | 巽 | 艮 | 001011 |
| 54 | 雷泽归妹 | 震 | 兑 | 110100 |
| 55 | 雷火丰 | 震 | 离 | 101100 |
| 56 | 火山旅 | 离 | 艮 | 001101 |
| 57 | 巽为风 | 巽 | 巽 | 011011 |
| 58 | 兑为泽 | 兑 | 兑 | 110110 |
| 59 | 风水涣 | 巽 | 坎 | 010011 |
| 60 | 水泽节 | 坎 | 兑 | 110010 |
| 61 | 风泽中孚 | 巽 | 兑 | 110011 |
| 62 | 雷山小过 | 震 | 艮 | 001100 |
| 63 | 水火既济 | 坎 | 离 | 101010 |
| 64 | 火水未济 | 离 | 坎 | 010101 |

- [ ] **Step 5: Run the data completeness test**

Run:

```bash
npm test -- src/data/hexagramCatalog.test.ts
```

Expected: PASS only after all 64 entries have complete fields and six line records.

- [ ] **Step 6: Run all domain tests**

Run:

```bash
npm test -- src/domain src/data
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data/hexagramCatalog.ts src/data/hexagramCatalog.test.ts src/domain/types.ts
git commit -m "feat: add traceable iching catalog"
```

## Task 5: Generate Deterministic Interpretations

**Files:**
- Create: `src/domain/interpretation.ts`
- Create: `src/domain/interpretation.test.ts`

- [ ] **Step 1: Write failing interpretation tests**

Create `src/domain/interpretation.test.ts`:

```ts
import { buildCasting, createCoinToss } from './coinToss';
import { createInterpretation } from './interpretation';

describe('interpretation engine', () => {
  it('creates a traceable result for a casting with moving lines', () => {
    const casting = buildCasting('最近事业怎么推进？', 'career', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails'])
    ]);

    const result = createInterpretation(casting);

    expect(result.question).toBe('最近事业怎么推进？');
    expect(result.originalHexagram.name).toMatch(/\S/);
    expect(result.changedHexagram?.name).toMatch(/\S/);
    expect(result.movingLines).toHaveLength(1);
    expect(result.headline).toMatch(/\S/);
    expect(result.plainText).toContain('本卦');
    expect(result.plainText).toContain('动爻');
    expect(result.plainText).toContain('变卦');
    expect(result.advice.length).toBeGreaterThanOrEqual(2);
    expect(result.basis).toEqual(
      expect.arrayContaining([
        expect.stringContaining('卦辞'),
        expect.stringContaining('象辞'),
        expect.stringContaining('爻辞')
      ])
    );
  });

  it('uses only the original hexagram when there are no moving lines', () => {
    const casting = buildCasting('今日运势', 'general', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails'])
    ]);

    const result = createInterpretation(casting);

    expect(result.changedHexagram).toBeNull();
    expect(result.movingLines).toEqual([]);
    expect(result.plainText).toContain('本卦无动爻');
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- src/domain/interpretation.test.ts
```

Expected: FAIL because `src/domain/interpretation.ts` does not exist.

- [ ] **Step 3: Implement interpretation generation**

Create `src/domain/interpretation.ts`:

```ts
import { getHexagramEntry } from '../data/hexagramCatalog';
import { getChangedPattern, getHexagramByLines, getMovingLinePositions, getOriginalPattern } from './hexagrams';
import type { Casting, Interpretation, QuestionType } from './types';

const QUESTION_CONTEXT: Record<QuestionType, string> = {
  general: '放在整体运势里看',
  career: '放在事业推进里看',
  relationship: '放在关系互动里看',
  wealth: '放在财务机会里看',
  decision: '放在决策取舍里看'
};

export function createInterpretation(casting: Casting): Interpretation {
  const originalRef = getHexagramByLines(getOriginalPattern(casting.lines));
  const changedRef = getHexagramByLines(getChangedPattern(casting.lines));
  const originalHexagram = getHexagramEntry(originalRef.id);
  const movingPositions = getMovingLinePositions(casting.lines);
  const movingLines = movingPositions.map((position) => {
    const line = originalHexagram.lines.find((candidate) => candidate.position === position);

    if (!line) {
      throw new Error(`Missing line ${position} for hexagram ${originalHexagram.id}`);
    }

    return line;
  });
  const changedHexagram = movingLines.length > 0 ? getHexagramEntry(changedRef.id) : null;
  const context = QUESTION_CONTEXT[casting.questionType];
  const movingText =
    movingLines.length > 0
      ? `动爻落在${movingLines.map((line) => line.title).join('、')}，变化关键是${movingLines
          .map((line) => line.summary)
          .join('；')}。`
      : '本卦无动爻，以本卦卦辞和整体卦意为主。';
  const changedText = changedHexagram
    ? `变卦为「${changedHexagram.name}」，趋势会转向：${changedHexagram.summary}`
    : '';

  return {
    question: casting.question,
    questionType: casting.questionType,
    originalHexagram,
    changedHexagram,
    movingLines,
    headline: buildHeadline(casting.questionType, originalHexagram.keywords, movingLines.length),
    plainText: [
      `${context}，本卦为「${originalHexagram.name}」：${originalHexagram.summary}`,
      movingText,
      changedText
    ]
      .filter(Boolean)
      .join('\n'),
    advice: buildAdvice(casting.questionType, originalHexagram.keywords, movingLines.flatMap((line) => line.tags)),
    basis: buildBasis(originalHexagram, movingLines, changedHexagram)
  };
}

function buildHeadline(questionType: QuestionType, keywords: string[], movingCount: number): string {
  const prefix: Record<QuestionType, string> = {
    general: '整体宜看清节奏',
    career: '事业宜稳中推进',
    relationship: '关系宜先稳住互动',
    wealth: '财务宜重视风险边界',
    decision: '决策宜先定原则'
  };

  return `${prefix[questionType]}：${keywords.slice(0, 2).join('、')}，${movingCount > 0 ? '局势有变化点' : '局势偏稳定'}`;
}

function buildAdvice(questionType: QuestionType, keywords: string[], tags: string[]): string[] {
  const shared = [
    `围绕「${keywords.slice(0, 2).join('、')}」调整行动，不做绝对化判断。`,
    tags.includes('谨慎') || tags.includes('避险')
      ? '先排除明显风险，再决定是否加速。'
      : '先做小步验证，再扩大投入。'
  ];

  const contextual: Record<QuestionType, string> = {
    general: '今天适合把注意力放在可控事项上。',
    career: '事业上先明确资源、责任和下一步交付。',
    relationship: '关系里优先观察对方反馈，少用猜测代替沟通。',
    wealth: '财务上先守住本金和现金流，再看机会。',
    decision: '决策前列出不可接受的代价，再比较收益。'
  };

  return [...shared, contextual[questionType]];
}

function buildBasis(
  originalHexagram: Interpretation['originalHexagram'],
  movingLines: Interpretation['movingLines'],
  changedHexagram: Interpretation['changedHexagram']
): string[] {
  return [
    `本卦卦辞：${originalHexagram.judgment}`,
    `本卦象辞：${originalHexagram.image}`,
    ...movingLines.map((line) => `动爻爻辞：${line.title}，${line.original}`),
    changedHexagram ? `变卦卦辞：${changedHexagram.judgment}` : '本卦无动爻：不另取变卦'
  ];
}
```

- [ ] **Step 4: Run interpretation tests**

Run:

```bash
npm test -- src/domain/interpretation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/interpretation.ts src/domain/interpretation.test.ts
git commit -m "feat: generate traceable readings"
```

## Task 6: Add Casting Session State

**Files:**
- Create: `src/hooks/useCastingSession.ts`
- Create: `src/hooks/useCastingSession.test.ts`

- [ ] **Step 1: Write failing hook tests**

Create `src/hooks/useCastingSession.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { useCastingSession } from './useCastingSession';

describe('useCastingSession', () => {
  it('records manual tosses and creates a result after six tosses', () => {
    const { result } = renderHook(() => useCastingSession());

    act(() => {
      result.current.start('今日运势', 'general');
    });

    for (let index = 0; index < 6; index += 1) {
      act(() => {
        result.current.addManualToss([true, false, false]);
      });
    }

    expect(result.current.phase).toBe('result');
    expect(result.current.tosses).toHaveLength(6);
    expect(result.current.interpretation?.question).toBe('今日运势');
  });

  it('resets to question entry', () => {
    const { result } = renderHook(() => useCastingSession());

    act(() => {
      result.current.start('今日运势', 'general');
      result.current.reset();
    });

    expect(result.current.phase).toBe('question');
    expect(result.current.tosses).toEqual([]);
    expect(result.current.interpretation).toBeNull();
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- src/hooks/useCastingSession.test.ts
```

Expected: FAIL because `src/hooks/useCastingSession.ts` does not exist.

- [ ] **Step 3: Implement the session hook**

Create `src/hooks/useCastingSession.ts`:

```ts
import { useCallback, useMemo, useState } from 'react';
import { buildCasting, tossCoins, tossCoinsWithBits } from '../domain/coinToss';
import { createInterpretation } from '../domain/interpretation';
import type { CoinToss, Interpretation, QuestionType } from '../domain/types';

export type AppPhase = 'question' | 'casting' | 'result';

export interface CastingSession {
  phase: AppPhase;
  question: string;
  questionType: QuestionType;
  tosses: CoinToss[];
  interpretation: Interpretation | null;
  currentThrow: number;
  start: (question: string, questionType: QuestionType) => void;
  addRandomToss: () => void;
  addManualToss: (bits: readonly boolean[]) => void;
  reset: () => void;
}

export function useCastingSession(): CastingSession {
  const [phase, setPhase] = useState<AppPhase>('question');
  const [question, setQuestion] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('general');
  const [tosses, setTosses] = useState<CoinToss[]>([]);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);

  const completeIfReady = useCallback(
    (nextTosses: CoinToss[]) => {
      if (nextTosses.length === 6) {
        const casting = buildCasting(question, questionType, nextTosses);
        setInterpretation(createInterpretation(casting));
        setPhase('result');
      }
    },
    [question, questionType]
  );

  const appendToss = useCallback(
    (toss: CoinToss) => {
      setTosses((current) => {
        if (current.length >= 6) {
          return current;
        }

        const next = [...current, toss];
        completeIfReady(next);
        return next;
      });
    },
    [completeIfReady]
  );

  return useMemo(
    () => ({
      phase,
      question,
      questionType,
      tosses,
      interpretation,
      currentThrow: Math.min(tosses.length + 1, 6),
      start(nextQuestion: string, nextQuestionType: QuestionType) {
        setQuestion(nextQuestion.trim());
        setQuestionType(nextQuestionType);
        setTosses([]);
        setInterpretation(null);
        setPhase('casting');
      },
      addRandomToss() {
        appendToss(tossCoins());
      },
      addManualToss(bits: readonly boolean[]) {
        appendToss(tossCoinsWithBits(bits));
      },
      reset() {
        setPhase('question');
        setQuestion('');
        setQuestionType('general');
        setTosses([]);
        setInterpretation(null);
      }
    }),
    [appendToss, interpretation, phase, question, questionType, tosses]
  );
}
```

- [ ] **Step 4: Run hook tests**

Run:

```bash
npm test -- src/hooks/useCastingSession.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCastingSession.ts src/hooks/useCastingSession.test.ts
git commit -m "feat: manage casting session state"
```

## Task 7: Build Question Entry And Manual Casting Flow

**Files:**
- Create: `src/components/QuestionEntry.tsx`
- Create: `src/components/CastingStage.tsx`
- Create: `src/components/CoinAnimation.tsx`
- Create: `src/components/HexagramLines.tsx`
- Create: `src/components/PrivacyNotice.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Replace the app test with a manual-flow integration test**

Modify `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App', () => {
  it('lets a user choose a quick question and complete six manual tosses', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '今日运势' }));
    await user.click(screen.getByRole('button', { name: '开始起卦' }));

    for (let index = 0; index < 6; index += 1) {
      await user.click(screen.getByRole('button', { name: '手动掷一次' }));
    }

    expect(await screen.findByRole('heading', { name: /卦象结果/ })).toBeInTheDocument();
    expect(screen.getByText('今日运势')).toBeInTheDocument();
    expect(screen.getByText(/传统依据/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the failing integration test**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL because the app does not expose question entry or manual toss controls.

- [ ] **Step 3: Create question entry component**

Create `src/components/QuestionEntry.tsx`:

```tsx
import { useState } from 'react';
import type { QuestionType } from '../domain/types';

const QUICK_QUESTIONS: Array<{ label: string; question: string; type: QuestionType }> = [
  { label: '今日运势', question: '今日运势', type: 'general' },
  { label: '最近事业', question: '最近事业怎么推进？', type: 'career' },
  { label: '感情走向', question: '这段关系接下来如何相处？', type: 'relationship' },
  { label: '财运机会', question: '最近财运机会是否值得把握？', type: 'wealth' },
  { label: '决定可行', question: '这个决定现在是否可行？', type: 'decision' }
];

interface Props {
  onStart: (question: string, questionType: QuestionType) => void;
}

export function QuestionEntry({ onStart }: Props) {
  const [question, setQuestion] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('general');
  const canStart = question.trim().length > 0;

  return (
    <section className="questionPanel" aria-labelledby="question-title">
      <p className="eyebrow">先定所问</p>
      <h1 id="question-title">三钱成卦</h1>
      <div className="quickGrid" aria-label="快捷问题">
        {QUICK_QUESTIONS.map((item) => (
          <button
            className="quickButton"
            key={item.label}
            type="button"
            onClick={() => {
              setQuestion(item.question);
              setQuestionType(item.type);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="questionLabel" htmlFor="question">
        所问之事
      </label>
      <textarea
        id="question"
        className="questionInput"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="写下你此刻真正想问的事"
      />
      <button
        className="primaryButton"
        type="button"
        disabled={!canStart}
        onClick={() => onStart(question, questionType)}
      >
        开始起卦
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Create casting visual components**

Create `src/components/CoinAnimation.tsx`:

```tsx
import type { CoinToss } from '../domain/types';

interface Props {
  latestToss: CoinToss | undefined;
}

export function CoinAnimation({ latestToss }: Props) {
  return (
    <div className="coinTray" aria-label="铜钱结果">
      {[0, 1, 2].map((index) => (
        <span className="coin" data-face={latestToss?.faces[index] ?? 'idle'} key={index}>
          {latestToss ? (latestToss.faces[index] === 'heads' ? '阳' : '阴') : '钱'}
        </span>
      ))}
    </div>
  );
}
```

Create `src/components/HexagramLines.tsx`:

```tsx
import type { CastLine } from '../domain/types';

interface Props {
  lines: readonly CastLine[];
}

export function HexagramLines({ lines }: Props) {
  const topToBottom = [...lines].reverse();

  return (
    <ol className="hexagramLines" aria-label="六爻">
      {topToBottom.map((line) => (
        <li className="hexLineRow" key={line.position}>
          <span className="lineLabel">{line.position === 6 ? '上爻' : `${line.position}爻`}</span>
          <span className={line.isYang ? 'yangLine' : 'yinLine'} aria-label={line.isYang ? '阳爻' : '阴爻'} />
          {line.isMoving ? <span className="movingMark">动</span> : null}
        </li>
      ))}
    </ol>
  );
}
```

Create `src/components/PrivacyNotice.tsx`:

```tsx
export function PrivacyNotice() {
  return (
    <p className="privacyNotice">
      摄像头仅用于本机识别起卦手势，画面不会上传。摄像头不可用时可以直接手动掷钱。
    </p>
  );
}
```

- [ ] **Step 5: Create casting stage**

Create `src/components/CastingStage.tsx`:

```tsx
import { CoinAnimation } from './CoinAnimation';
import { HexagramLines } from './HexagramLines';
import { PrivacyNotice } from './PrivacyNotice';
import type { CastLine, CoinToss } from '../domain/types';

interface Props {
  question: string;
  currentThrow: number;
  tosses: CoinToss[];
  lines: CastLine[];
  onManualToss: () => void;
}

export function CastingStage({ question, currentThrow, tosses, lines, onManualToss }: Props) {
  return (
    <section className="castingPanel" aria-labelledby="casting-title">
      <p className="eyebrow">六次掷钱</p>
      <h1 id="casting-title">第 {currentThrow} 掷 / 共 6 掷</h1>
      <p className="questionEcho">{question}</p>
      <div className="cameraMock" aria-label="摄像头区域">
        <span>等待手势</span>
      </div>
      <CoinAnimation latestToss={tosses.at(-1)} />
      <HexagramLines lines={lines} />
      <button className="primaryButton" type="button" onClick={onManualToss}>
        手动掷一次
      </button>
      <PrivacyNotice />
    </section>
  );
}
```

- [ ] **Step 6: Wire app phases**

Modify `src/App.tsx`:

```tsx
import { CastingStage } from './components/CastingStage';
import { QuestionEntry } from './components/QuestionEntry';
import { ResultView } from './components/ResultView';
import { buildCasting } from './domain/coinToss';
import { useCastingSession } from './hooks/useCastingSession';

export default function App() {
  const session = useCastingSession();
  const casting =
    session.tosses.length > 0 && session.tosses.length <= 6
      ? buildCastingForDisplay(session.question, session.questionType, session.tosses)
      : null;

  return (
    <main className="appShell">
      {session.phase === 'question' ? <QuestionEntry onStart={session.start} /> : null}
      {session.phase === 'casting' ? (
        <CastingStage
          question={session.question}
          currentThrow={session.currentThrow}
          tosses={session.tosses}
          lines={casting?.lines ?? []}
          onManualToss={() => session.addRandomToss()}
        />
      ) : null}
      {session.phase === 'result' && session.interpretation ? (
        <ResultView interpretation={session.interpretation} tosses={session.tosses} onReset={session.reset} />
      ) : null}
    </main>
  );
}

function buildCastingForDisplay(
  question: Parameters<typeof buildCasting>[0],
  questionType: Parameters<typeof buildCasting>[1],
  tosses: Parameters<typeof buildCasting>[2]
) {
  if (tosses.length === 6) {
    return buildCasting(question, questionType, tosses);
  }

  return {
    lines: tosses.map((toss, index) => ({
      ...toss.line,
      position: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6,
      changedIsYang: toss.line.isMoving ? !toss.line.isYang : toss.line.isYang
    }))
  };
}
```

Create a temporary `src/components/ResultView.tsx` so the app compiles before Task 8:

```tsx
import type { CoinToss, Interpretation } from '../domain/types';

interface Props {
  interpretation: Interpretation;
  tosses: CoinToss[];
  onReset: () => void;
}

export function ResultView({ interpretation, tosses, onReset }: Props) {
  return (
    <section className="resultPanel" aria-labelledby="result-title">
      <p className="eyebrow">卦象结果</p>
      <h1 id="result-title">卦象结果：{interpretation.originalHexagram.name}</h1>
      <p>{interpretation.question}</p>
      <p>传统依据</p>
      <p>共 {tosses.length} 掷</p>
      <button className="primaryButton" type="button" onClick={onReset}>
        重新起卦
      </button>
    </section>
  );
}
```

- [ ] **Step 7: Add responsive UI styles**

Append to `src/styles.css`:

```css
.questionPanel,
.castingPanel,
.resultPanel {
  width: min(980px, 100%);
  margin: 0 auto;
  padding: 28px 0;
}

.quickGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  gap: 10px;
  margin: 24px 0;
}

.quickButton,
.primaryButton {
  min-height: 44px;
  border: 1px solid rgba(215, 170, 97, 0.45);
  border-radius: 8px;
  color: #f8ecd7;
  background: rgba(36, 29, 19, 0.8);
  cursor: pointer;
}

.primaryButton {
  width: 100%;
  margin-top: 16px;
  background: #b98235;
  color: #17110b;
  font-weight: 700;
}

.primaryButton:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.questionLabel {
  display: block;
  margin-bottom: 8px;
  color: #d7aa61;
}

.questionInput {
  width: 100%;
  min-height: 108px;
  resize: vertical;
  border: 1px solid rgba(215, 170, 97, 0.38);
  border-radius: 8px;
  padding: 14px;
  color: #f6efe0;
  background: rgba(8, 8, 8, 0.42);
}

.questionEcho,
.privacyNotice {
  color: #d8ccba;
  line-height: 1.7;
}

.cameraMock {
  display: grid;
  min-height: 220px;
  margin: 18px 0;
  place-items: center;
  border: 1px solid rgba(215, 170, 97, 0.3);
  border-radius: 8px;
  color: #d7aa61;
  background: rgba(0, 0, 0, 0.28);
}

.coinTray {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin: 20px 0;
}

.coin {
  display: grid;
  width: 58px;
  aspect-ratio: 1;
  place-items: center;
  border: 2px solid #d7aa61;
  border-radius: 50%;
  color: #2a1705;
  background: #d7aa61;
  box-shadow: 0 8px 26px rgba(215, 170, 97, 0.24);
}

.hexagramLines {
  display: grid;
  gap: 8px;
  width: min(360px, 100%);
  margin: 20px auto;
  padding: 0;
  list-style: none;
}

.hexLineRow {
  display: grid;
  grid-template-columns: 48px 1fr 36px;
  gap: 12px;
  align-items: center;
}

.lineLabel,
.movingMark {
  color: #d8ccba;
  font-size: 0.9rem;
}

.yangLine,
.yinLine {
  display: block;
  height: 12px;
  border-radius: 4px;
  background: #f1d08a;
}

.yinLine {
  background: linear-gradient(90deg, #f1d08a 0 42%, transparent 42% 58%, #f1d08a 58% 100%);
}
```

- [ ] **Step 8: Run integration test**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components src/styles.css
git commit -m "feat: add question and manual casting flow"
```

## Task 8: Build Full Result View

**Files:**
- Modify: `src/components/ResultView.tsx`
- Create: `src/components/ResultView.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing result view tests**

Create `src/components/ResultView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { buildCasting, createCoinToss } from '../domain/coinToss';
import { createInterpretation } from '../domain/interpretation';
import { ResultView } from './ResultView';

describe('ResultView', () => {
  it('renders direct reading and traditional basis', () => {
    const casting = buildCasting('今日运势', 'general', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails'])
    ]);
    const interpretation = createInterpretation(casting);

    render(<ResultView interpretation={interpretation} tosses={casting.tosses} onReset={() => undefined} />);

    expect(screen.getByRole('heading', { name: /卦象结果/ })).toBeInTheDocument();
    expect(screen.getByText('今日运势')).toBeInTheDocument();
    expect(screen.getByText('白话解读')).toBeInTheDocument();
    expect(screen.getByText('行动建议')).toBeInTheDocument();
    expect(screen.getByText('传统依据')).toBeInTheDocument();
    expect(screen.getAllByText(/第 \d 掷/)).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run failing result view test**

Run:

```bash
npm test -- src/components/ResultView.test.tsx
```

Expected: FAIL until `ResultView` renders all required sections.

- [ ] **Step 3: Implement full result view**

Modify `src/components/ResultView.tsx`:

```tsx
import type { CoinToss, Interpretation } from '../domain/types';

interface Props {
  interpretation: Interpretation;
  tosses: CoinToss[];
  onReset: () => void;
}

export function ResultView({ interpretation, tosses, onReset }: Props) {
  return (
    <section className="resultPanel" aria-labelledby="result-title">
      <p className="eyebrow">卦象结果</p>
      <h1 id="result-title">卦象结果：{interpretation.originalHexagram.name}</h1>
      <p className="questionEcho">{interpretation.question}</p>

      <section className="readingBlock" aria-labelledby="direct-title">
        <h2 id="direct-title">{interpretation.headline}</h2>
        <dl className="resultFacts">
          <div>
            <dt>本卦</dt>
            <dd>{interpretation.originalHexagram.name}</dd>
          </div>
          <div>
            <dt>变卦</dt>
            <dd>{interpretation.changedHexagram?.name ?? '无动爻'}</dd>
          </div>
          <div>
            <dt>动爻</dt>
            <dd>{interpretation.movingLines.map((line) => line.title).join('、') || '无'}</dd>
          </div>
        </dl>
      </section>

      <section className="readingBlock" aria-labelledby="plain-title">
        <h2 id="plain-title">白话解读</h2>
        {interpretation.plainText.split('\n').map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>

      <section className="readingBlock" aria-labelledby="advice-title">
        <h2 id="advice-title">行动建议</h2>
        <ul>
          {interpretation.advice.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="readingBlock" aria-labelledby="basis-title">
        <h2 id="basis-title">传统依据</h2>
        <ul>
          {interpretation.basis.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="readingBlock" aria-labelledby="toss-title">
        <h2 id="toss-title">起卦过程</h2>
        <ol className="tossList">
          {tosses.map((toss, index) => (
            <li key={`${index}-${toss.score}`}>
              第 {index + 1} 掷：{toss.faces.map((face) => (face === 'heads' ? '阳' : '阴')).join(' / ')}
              ，总分 {toss.score}
            </li>
          ))}
        </ol>
      </section>

      <button className="primaryButton" type="button" onClick={onReset}>
        重新起卦
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Add result styles**

Append to `src/styles.css`:

```css
.readingBlock {
  margin: 18px 0;
  padding: 18px;
  border: 1px solid rgba(215, 170, 97, 0.24);
  border-radius: 8px;
  background: rgba(8, 8, 8, 0.22);
}

.readingBlock h2 {
  margin: 0 0 12px;
  font-size: 1.2rem;
  letter-spacing: 0;
}

.readingBlock p,
.readingBlock li {
  color: #e2d5c2;
  line-height: 1.7;
}

.resultFacts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin: 0;
}

.resultFacts div {
  padding: 12px;
  border-radius: 8px;
  background: rgba(215, 170, 97, 0.12);
}

.resultFacts dt {
  color: #d7aa61;
  font-size: 0.9rem;
}

.resultFacts dd {
  margin: 4px 0 0;
  color: #f6efe0;
  font-weight: 700;
}

.tossList {
  padding-left: 1.3rem;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/components/ResultView.test.tsx src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ResultView.tsx src/components/ResultView.test.tsx src/styles.css
git commit -m "feat: render traceable result page"
```

## Task 9: Add Camera Gesture Adapter

**Files:**
- Create: `src/camera/gestureRecognizer.ts`
- Create: `src/camera/gestureRecognizer.test.ts`
- Modify: `src/components/CastingStage.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing gesture cooldown tests**

Create `src/camera/gestureRecognizer.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run failing gesture tests**

Run:

```bash
npm test -- src/camera/gestureRecognizer.test.ts
```

Expected: FAIL because `src/camera/gestureRecognizer.ts` does not exist.

- [ ] **Step 3: Implement camera and gesture adapter**

Create `src/camera/gestureRecognizer.ts`:

```ts
import {
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult
} from '@mediapipe/tasks-vision';

export type RecognizedGesture =
  | 'None'
  | 'Closed_Fist'
  | 'Open_Palm'
  | 'Pointing_Up'
  | 'Thumb_Down'
  | 'Thumb_Up'
  | 'Victory'
  | 'ILoveYou';

export interface GestureGate {
  update: (gesture: RecognizedGesture, timestamp: number) => boolean;
}

export function createGestureGate(cooldownMs: number): GestureGate {
  let previous: RecognizedGesture = 'None';
  let lastTriggerAt = Number.NEGATIVE_INFINITY;

  return {
    update(gesture, timestamp) {
      const canTrigger = previous === 'Closed_Fist' && gesture === 'Open_Palm' && timestamp - lastTriggerAt >= cooldownMs;
      previous = gesture;

      if (canTrigger) {
        lastTriggerAt = timestamp;
        return true;
      }

      return false;
    }
  };
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前浏览器不支持摄像头 API');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 960 },
      height: { ideal: 540 }
    },
    audio: false
  });

  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function createMediaPipeRecognizer(): Promise<GestureRecognizer> {
  const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');

  return GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task'
    },
    runningMode: 'VIDEO',
    numHands: 1
  });
}

export function getTopGesture(result: GestureRecognizerResult): RecognizedGesture {
  return (result.gestures[0]?.[0]?.categoryName as RecognizedGesture | undefined) ?? 'None';
}
```

- [ ] **Step 4: Run gesture tests**

Run:

```bash
npm test -- src/camera/gestureRecognizer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire camera into casting stage**

Modify `src/components/CastingStage.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  createGestureGate,
  createMediaPipeRecognizer,
  getTopGesture,
  startCamera,
  stopCamera
} from '../camera/gestureRecognizer';
import { CoinAnimation } from './CoinAnimation';
import { HexagramLines } from './HexagramLines';
import { PrivacyNotice } from './PrivacyNotice';
import type { CastLine, CoinToss } from '../domain/types';

interface Props {
  question: string;
  currentThrow: number;
  tosses: CoinToss[];
  lines: CastLine[];
  onManualToss: () => void;
}

export function CastingStage({ question, currentThrow, tosses, lines, onManualToss }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraState, setCameraState] = useState('正在准备摄像头');
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    const gate = createGestureGate(1700);

    async function run() {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      try {
        stream = await startCamera(video);
        const recognizer = await createMediaPipeRecognizer();
        setCameraState('握拳后张开，完成一次掷钱');

        const loop = () => {
          if (cancelled) {
            return;
          }

          const result = recognizer.recognizeForVideo(video, performance.now());
          const gesture = getTopGesture(result);

          if (gate.update(gesture, performance.now())) {
            setFlash(true);
            window.setTimeout(() => setFlash(false), 280);
            onManualToss();
          }

          frame = requestAnimationFrame(loop);
        };

        frame = requestAnimationFrame(loop);
      } catch (error) {
        setCameraState(error instanceof Error ? error.message : '摄像头不可用，请使用手动掷钱');
      }
    }

    run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stopCamera(stream);
    };
  }, [onManualToss]);

  return (
    <section className="castingPanel" aria-labelledby="casting-title">
      <p className="eyebrow">六次掷钱</p>
      <h1 id="casting-title">第 {currentThrow} 掷 / 共 6 掷</h1>
      <p className="questionEcho">{question}</p>
      <div className={flash ? 'cameraFrame cameraFrameActive' : 'cameraFrame'}>
        <video ref={videoRef} className="cameraVideo" muted playsInline aria-label="摄像头预览" />
        <span className="cameraHint">{cameraState}</span>
      </div>
      <CoinAnimation latestToss={tosses.at(-1)} />
      <HexagramLines lines={lines} />
      <button className="primaryButton" type="button" onClick={onManualToss}>
        手动掷一次
      </button>
      <PrivacyNotice />
    </section>
  );
}
```

- [ ] **Step 6: Add camera styles**

Modify the `.cameraMock` block in `src/styles.css` into these camera classes:

```css
.cameraFrame {
  position: relative;
  overflow: hidden;
  min-height: 220px;
  margin: 18px 0;
  border: 1px solid rgba(215, 170, 97, 0.3);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
}

.cameraFrameActive {
  box-shadow: 0 0 0 3px rgba(215, 170, 97, 0.38), 0 0 40px rgba(215, 170, 97, 0.28);
}

.cameraVideo {
  display: block;
  width: 100%;
  min-height: 220px;
  object-fit: cover;
  transform: scaleX(-1);
}

.cameraHint {
  position: absolute;
  left: 12px;
  bottom: 12px;
  max-width: calc(100% - 24px);
  padding: 8px 10px;
  border-radius: 8px;
  color: #f6efe0;
  background: rgba(0, 0, 0, 0.62);
}
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/camera src/components/CastingStage.tsx src/styles.css
git commit -m "feat: add camera gesture casting"
```

## Task 10: Polish Responsive Visual Experience And Verify

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/CoinAnimation.tsx`
- Modify: `src/components/HexagramLines.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add accessibility and layout assertions**

Modify `src/App.test.tsx` to include reset behavior:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App', () => {
  it('lets a user choose a quick question and complete six manual tosses', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '今日运势' }));
    await user.click(screen.getByRole('button', { name: '开始起卦' }));

    for (let index = 0; index < 6; index += 1) {
      await user.click(screen.getByRole('button', { name: '手动掷一次' }));
    }

    expect(await screen.findByRole('heading', { name: /卦象结果/ })).toBeInTheDocument();
    expect(screen.getByText('今日运势')).toBeInTheDocument();
    expect(screen.getByText(/传统依据/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重新起卦' }));
    expect(screen.getByRole('heading', { name: '三钱成卦' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Tune final CSS**

Edit `src/styles.css` so these responsive rules are present at the end:

```css
@media (min-width: 760px) {
  .castingPanel {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
    gap: 24px;
    align-items: start;
  }

  .castingPanel .eyebrow,
  .castingPanel h1,
  .castingPanel .questionEcho,
  .castingPanel .privacyNotice {
    grid-column: 1 / -1;
  }
}

@media (max-width: 520px) {
  .appShell {
    padding: 16px;
  }

  h1 {
    font-size: 2.45rem;
  }

  .coin {
    width: 48px;
  }

  .quickGrid {
    grid-template-columns: 1fr 1fr;
  }

  .quickButton,
  .primaryButton {
    min-height: 46px;
  }
}
```

- [ ] **Step 4: Run final verification**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 5: Start local dev server for manual QA**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite reports a local URL, usually `http://127.0.0.1:5173/`.

Open the URL in a browser and verify:

- The first screen shows question input and quick questions.
- Clicking “今日运势” fills the question.
- Clicking “开始起卦” opens the casting screen.
- The manual toss button completes six tosses and reaches the result page.
- The result page shows 本卦, 变卦 or 无动爻, 动爻, 白话解读, 行动建议, 传统依据, and 起卦过程.
- On a secure context or localhost, camera permission is requested and camera fallback text is visible if permission is denied.

- [ ] **Step 6: Commit**

```bash
git add src/App.test.tsx src/styles.css src/components/CoinAnimation.tsx src/components/HexagramLines.tsx
git commit -m "feat: polish responsive divination experience"
```

## Final Verification

Run:

```bash
npm test
npm run build
git status --short
```

Expected:

- `npm test` passes.
- `npm run build` passes.
- `git status --short` shows a clean worktree after the final commit.

## Spec Coverage Review

- Product positioning: covered by Task 7, Task 8, and Task 10.
- Question input and quick questions: covered by Task 7.
- Six camera-triggered tosses: covered by Task 9.
- Manual fallback: covered by Task 7 and Task 9.
- Three-coin rules: covered by Task 2.
- Original hexagram, moving lines, changed hexagram: covered by Task 3 and Task 5.
- Local catalog and traceable texts: covered by Task 4 and Task 8.
- Privacy: covered by Task 7 and Task 9.
- Responsive layout: covered by Task 10.
- Tests: covered by every task and final verification.
