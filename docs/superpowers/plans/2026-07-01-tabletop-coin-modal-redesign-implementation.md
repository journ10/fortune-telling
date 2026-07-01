# Tabletop Coin Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the UI so the main screen is only a physical tabletop with 3D coins, while API setup, question entry, progress, AI reading, raw hexagram facts, toss history, and traditional basis all appear in floating dialogs.

**Architecture:** Keep the existing domain and AI modules as the source of truth, and move presentation into a persistent `TabletopScene` plus a global `ModalLayer`. Generate each toss before animation, pass that predetermined result into the 3D scene, then record the toss only after the animation settles. Dialog state remains separate from casting state so closing a result dialog never leaks result panels into the tabletop.

**Tech Stack:** Vite, React 19, TypeScript, Vitest, React Testing Library, Three.js, plain CSS, existing MediaPipe gesture adapter where needed.

---

## Scope Check

This is one cohesive UI redesign. It touches several presentation components, but the work is not split into separate sub-projects because each task contributes to the same end-to-end flow: tabletop-only main scene plus modal-only interactions.

The domain engine, catalog data, and AI request format remain in place. The implementation does not add accounts, history, sharing, payments, a backend, or local AI reading fallback.

## File Structure

- Modify: `package.json`
  - Add `three` as a runtime dependency.
- Modify: `package-lock.json`
  - Updated by `npm install three`.
- Modify: `src/hooks/useCastingSession.ts`
  - Expose a `recordToss(toss: CoinToss)` method so UI can animate a predetermined toss before committing it.
- Modify: `src/hooks/useCastingSession.test.ts`
  - Add coverage for `recordToss`.
- Create: `src/components/ModalLayer.tsx`
  - Generic accessible dialog shell with overlay, focus target, close handling, and max-height content scrolling.
- Create: `src/components/AiSettingsDialog.tsx`
  - Provider, API URL, API Key, model fields, and save action.
- Create: `src/components/QuestionDialog.tsx`
  - Quick questions, custom question, and start action.
- Create: `src/components/CastProgressToast.tsx`
  - Short-lived progress/status overlay. It is a floating overlay, not a fixed panel.
- Create: `src/components/HexagramFacts.tsx`
  - Reusable raw hexagram facts, six-line display, toss list, and traditional basis helpers.
- Create: `src/components/ResultDialog.tsx`
  - Floating result dialog with tabs for AI reading, raw hexagram, toss process, and traditional basis.
- Create: `src/components/TabletopScene.tsx`
  - Persistent tabletop scene, coin interaction surface, WebGL/Three setup, jsdom-safe fallback, and toss animation completion callback.
- Modify: `src/App.tsx`
  - Replace stage-based page routing with persistent tabletop scene and modal orchestration.
- Modify: `src/App.test.tsx`
  - Update end-to-end behavior to assert modal-first flow and no local AI fallback.
- Create: `src/components/ResultDialog.test.tsx`
  - Replaces result-page expectations with result-dialog expectations.
- Create: `src/components/TabletopScene.test.tsx`
  - Verifies click/keyboard request behavior and fallback animation completion.
- Modify: `src/styles.css`
  - Replace page/card layout with full-screen tabletop, invisible coin interaction surface, modal layer, tabs, toasts, and responsive dialog styles.
- Delete after migration: `src/components/QuestionEntry.tsx`
- Delete after migration: `src/components/CastingStage.tsx`
- Delete after migration: `src/components/CoinAnimation.tsx`
- Delete after migration: `src/components/ResultView.tsx`
- Delete after migration: `src/components/ResultView.test.tsx`

## Task 1: Add Three.js Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install Three.js**

Run:

```bash
npm install three
```

Expected: `package.json` includes a concrete `three` version under `dependencies`, and `package-lock.json` changes.

- [ ] **Step 2: Run TypeScript lint**

Run:

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add three dependency"
```

## Task 2: Expose Predetermined Toss Recording

**Files:**
- Modify: `src/hooks/useCastingSession.ts`
- Modify: `src/hooks/useCastingSession.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `src/hooks/useCastingSession.test.ts`:

```ts
import { createCoinToss } from '../domain/coinToss';
```

```ts
it('records a predetermined toss so animation can settle before committing the line', () => {
  const { result } = renderHook(() => useCastingSession());
  const toss = createCoinToss(['heads', 'heads', 'tails']);

  act(() => {
    result.current.start('今日运势', 'general');
    result.current.recordToss(toss);
  });

  expect(result.current.phase).toBe('casting');
  expect(result.current.tosses).toEqual([toss]);
  expect(result.current.currentThrow).toBe(2);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- src/hooks/useCastingSession.test.ts
```

Expected: FAIL because `recordToss` does not exist on `CastingSession`.

- [ ] **Step 3: Implement `recordToss`**

In `src/hooks/useCastingSession.ts`, update the public interface:

```ts
export interface CastingSession {
  phase: AppPhase;
  question: string;
  questionType: QuestionType;
  tosses: CoinToss[];
  castingResult: CastingResult | null;
  currentThrow: number;
  start: (question: string, questionType: QuestionType) => void;
  recordToss: (toss: CoinToss) => void;
  addRandomToss: () => void;
  addManualToss: (bits: readonly boolean[]) => void;
  reset: () => void;
}
```

Add the callback:

```ts
const recordToss = useCallback((toss: CoinToss) => {
  dispatch({ type: 'addToss', toss });
}, []);
```

Update `addRandomToss` to reuse it:

```ts
const addRandomToss = useCallback(() => {
  recordToss(tossCoins());
}, [recordToss]);
```

Return it from `useMemo`:

```ts
recordToss,
```

Include `recordToss` in the `useMemo` dependency list.

- [ ] **Step 4: Run the hook tests**

Run:

```bash
npm test -- src/hooks/useCastingSession.test.ts
```

Expected: all tests in `useCastingSession.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCastingSession.ts src/hooks/useCastingSession.test.ts
git commit -m "feat: record predetermined coin tosses"
```

## Task 3: Add the Generic Modal Layer

**Files:**
- Create: `src/components/ModalLayer.tsx`
- Create: `src/components/ModalLayer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/ModalLayer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ModalLayer from './ModalLayer';

describe('ModalLayer', () => {
  it('renders an accessible dialog with a title and close action', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ModalLayer title="AI 配置" onClose={onClose}>
        <p>填写 API 信息</p>
      </ModalLayer>
    );

    expect(screen.getByRole('dialog', { name: 'AI 配置' })).toBeInTheDocument();
    expect(screen.getByText('填写 API 信息')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a blocking dialog open when no close handler is provided', () => {
    render(
      <ModalLayer title="所问之事">
        <p>请输入问题</p>
      </ModalLayer>
    );

    expect(screen.getByRole('dialog', { name: '所问之事' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- src/components/ModalLayer.test.tsx
```

Expected: FAIL because `src/components/ModalLayer.tsx` does not exist.

- [ ] **Step 3: Implement `ModalLayer`**

Create `src/components/ModalLayer.tsx`:

```tsx
import type { ReactNode } from 'react';

interface ModalLayerProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  className?: string;
}

export default function ModalLayer({
  title,
  children,
  onClose,
  footer,
  className
}: ModalLayerProps) {
  const classes = ['modalPanel', className].filter(Boolean).join(' ');

  return (
    <div className="modalOverlay" role="presentation">
      <section className={classes} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modalHeader">
          <h1 id="modal-title">{title}</h1>
          {onClose ? (
            <button className="iconButton" type="button" aria-label="关闭" onClick={onClose}>
              ×
            </button>
          ) : null}
        </header>
        <div className="modalBody">{children}</div>
        {footer ? <footer className="modalFooter">{footer}</footer> : null}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
npm test -- src/components/ModalLayer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ModalLayer.tsx src/components/ModalLayer.test.tsx
git commit -m "feat: add modal layer shell"
```

## Task 4: Move AI Settings Into a Floating Dialog

**Files:**
- Create: `src/components/AiSettingsDialog.tsx`
- Create: `src/components/AiSettingsDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/AiSettingsDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi } from 'vitest';
import type { AiSettings } from '../ai/aiSettings';
import { DEFAULT_AI_SETTINGS } from '../ai/aiSettings';
import AiSettingsDialog from './AiSettingsDialog';

function Harness({
  initialSettings = DEFAULT_AI_SETTINGS,
  onChange,
  onSubmit = () => undefined
}: {
  initialSettings?: AiSettings;
  onChange: (settings: AiSettings) => void;
  onSubmit?: () => void;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const isConfigured = Boolean(
    settings.apiKey.trim() && settings.apiUrl.trim() && settings.model.trim()
  );

  return (
    <AiSettingsDialog
      aiSettings={settings}
      isAiConfigured={isConfigured}
      onAiSettingsChange={(nextSettings) => {
        setSettings(nextSettings);
        onChange(nextSettings);
      }}
      onSubmit={onSubmit}
    />
  );
}

describe('AiSettingsDialog', () => {
  it('saves complete AI settings from the floating dialog', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(<Harness onChange={onChange} onSubmit={onSubmit} />);

    expect(screen.getByRole('dialog', { name: 'AI 配置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled();

    await user.type(screen.getByLabelText('API Key'), 'sk-user');

    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_AI_SETTINGS,
      apiKey: 'sk-user'
    });
    expect(screen.getByRole('button', { name: '保存配置' })).toBeEnabled();
  });

  it('switches provider defaults inside the dialog', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Harness onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Provider'), 'deepseek');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
        apiUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash'
      })
    );
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- src/components/AiSettingsDialog.test.tsx
```

Expected: FAIL because `AiSettingsDialog` does not exist.

- [ ] **Step 3: Implement `AiSettingsDialog`**

Create `src/components/AiSettingsDialog.tsx`:

```tsx
import { getDefaultProviderSettings, type AiProvider, type AiSettings } from '../ai/aiSettings';
import ModalLayer from './ModalLayer';

interface AiSettingsDialogProps {
  aiSettings: AiSettings;
  isAiConfigured: boolean;
  onAiSettingsChange: (settings: AiSettings) => void;
  onSubmit: () => void;
}

export default function AiSettingsDialog({
  aiSettings,
  isAiConfigured,
  onAiSettingsChange,
  onSubmit
}: AiSettingsDialogProps) {
  const updateProvider = (provider: AiProvider) => {
    onAiSettingsChange({
      ...aiSettings,
      provider,
      ...getDefaultProviderSettings(provider)
    });
  };

  return (
    <ModalLayer
      title="AI 配置"
      footer={
        <button className="primaryButton" type="button" disabled={!isAiConfigured} onClick={onSubmit}>
          保存配置
        </button>
      }
    >
      <p className="modalCopy">
        AI 解读为必填。API URL 可以填 base URL 或完整 endpoint；Key 只保存在当前页面状态里。
      </p>

      <div className="formGrid">
        <label className="formField" htmlFor="ai-provider">
          <span>Provider</span>
          <select
            id="ai-provider"
            value={aiSettings.provider}
            onChange={(event) => updateProvider(event.target.value as AiProvider)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </label>

        <label className="formField" htmlFor="ai-api-url">
          <span>API URL</span>
          <input
            autoComplete="off"
            id="ai-api-url"
            spellCheck={false}
            type="url"
            value={aiSettings.apiUrl}
            onChange={(event) => onAiSettingsChange({ ...aiSettings, apiUrl: event.target.value })}
          />
        </label>

        <label className="formField" htmlFor="ai-api-key">
          <span>API Key</span>
          <input
            autoComplete="off"
            id="ai-api-key"
            spellCheck={false}
            type="password"
            value={aiSettings.apiKey}
            onChange={(event) => onAiSettingsChange({ ...aiSettings, apiKey: event.target.value })}
            placeholder="sk-..."
          />
        </label>

        <label className="formField" htmlFor="ai-model">
          <span>模型</span>
          <input
            autoComplete="off"
            id="ai-model"
            spellCheck={false}
            type="text"
            value={aiSettings.model}
            onChange={(event) => onAiSettingsChange({ ...aiSettings, model: event.target.value })}
          />
        </label>
      </div>
    </ModalLayer>
  );
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
npm test -- src/components/AiSettingsDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AiSettingsDialog.tsx src/components/AiSettingsDialog.test.tsx
git commit -m "feat: move ai settings into modal"
```

## Task 5: Move Question Entry Into a Floating Dialog

**Files:**
- Create: `src/components/QuestionDialog.tsx`
- Create: `src/components/QuestionDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/QuestionDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import QuestionDialog from './QuestionDialog';

describe('QuestionDialog', () => {
  it('starts from a quick question', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(<QuestionDialog onStart={onStart} />);

    await user.click(screen.getByRole('button', { name: '最近事业' }));
    await user.click(screen.getByRole('button', { name: '开始起卦' }));

    expect(onStart).toHaveBeenCalledWith('最近事业怎么推进？', 'career');
  });

  it('requires a non-empty custom question', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(<QuestionDialog onStart={onStart} />);

    expect(screen.getByRole('button', { name: '开始起卦' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: '所问之事' }), '  这个决定现在是否可行？  ');
    await user.click(screen.getByRole('button', { name: '开始起卦' }));

    expect(onStart).toHaveBeenCalledWith('这个决定现在是否可行？', 'general');
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- src/components/QuestionDialog.test.tsx
```

Expected: FAIL because `QuestionDialog` does not exist.

- [ ] **Step 3: Implement `QuestionDialog`**

Create `src/components/QuestionDialog.tsx`:

```tsx
import { useState } from 'react';
import type { QuestionType } from '../domain/types';
import ModalLayer from './ModalLayer';

const QUICK_QUESTIONS: Array<{ label: string; question: string; type: QuestionType }> = [
  { label: '今日运势', question: '今日运势', type: 'general' },
  { label: '最近事业', question: '最近事业怎么推进？', type: 'career' },
  { label: '感情走向', question: '这段关系接下来如何相处？', type: 'relationship' },
  { label: '财运机会', question: '最近财运机会是否值得把握？', type: 'wealth' },
  { label: '决定可行', question: '这个决定现在是否可行？', type: 'decision' }
];

interface QuestionDialogProps {
  onStart: (question: string, questionType: QuestionType) => void;
}

export default function QuestionDialog({ onStart }: QuestionDialogProps) {
  const [question, setQuestion] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('general');
  const trimmedQuestion = question.trim();

  return (
    <ModalLayer
      title="所问之事"
      footer={
        <button
          className="primaryButton"
          type="button"
          disabled={!trimmedQuestion}
          onClick={() => onStart(trimmedQuestion, questionType)}
        >
          开始起卦
        </button>
      }
    >
      <div className="quickGrid" aria-label="快速问题">
        {QUICK_QUESTIONS.map((quickQuestion) => (
          <button
            className="quickButton"
            key={quickQuestion.type}
            type="button"
            onClick={() => {
              setQuestion(quickQuestion.question);
              setQuestionType(quickQuestion.type);
            }}
          >
            {quickQuestion.label}
          </button>
        ))}
      </div>

      <label className="formField" htmlFor="question-input">
        <span>所问之事</span>
        <textarea
          id="question-input"
          rows={4}
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            if (questionType !== 'general') {
              setQuestionType('general');
            }
          }}
          placeholder="写下一个清晰、具体的问题"
        />
      </label>
    </ModalLayer>
  );
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
npm test -- src/components/QuestionDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/QuestionDialog.tsx src/components/QuestionDialog.test.tsx
git commit -m "feat: move question entry into modal"
```

## Task 6: Build Result Dialog and Raw Hexagram Sections

**Files:**
- Create: `src/components/HexagramFacts.tsx`
- Create: `src/components/ResultDialog.tsx`
- Create: `src/components/ResultDialog.test.tsx`
- Delete after this task passes: `src/components/ResultView.tsx`
- Delete after this task passes: `src/components/ResultView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/ResultDialog.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { buildCasting, createCoinToss } from '../domain/coinToss';
import { createCastingResult } from '../domain/interpretation';
import type { AiInterpretation } from '../domain/types';
import ResultDialog from './ResultDialog';

function makeResult() {
  const casting = buildCasting('今日运势', 'general', [
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'heads', 'heads']),
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'heads', 'tails'])
  ]);
  const castingResult = createCastingResult(casting);
  const aiInterpretation: AiInterpretation = {
    ...castingResult,
    headline: 'AI：明断但不冒进',
    plainText: '本卦提示事情已经到了需要表态的时候。\n动爻提示表达方式要稳。',
    advice: ['先确认边界', '避免情绪化推进', '保留复盘时间']
  };

  return { casting, castingResult, aiInterpretation };
}

describe('ResultDialog', () => {
  it('renders AI reading first and keeps raw facts in tabs', async () => {
    const user = userEvent.setup();
    const { casting, castingResult, aiInterpretation } = makeResult();

    render(
      <ResultDialog
        aiStatus={{ state: 'ready', message: 'AI 解卦已生成；传统卦辞与爻辞未被改写。' }}
        aiInterpretation={aiInterpretation}
        castingResult={castingResult}
        tosses={casting.tosses}
        onClose={() => undefined}
        onReset={() => undefined}
        onRetryAi={() => undefined}
        onEditAiSettings={() => undefined}
      />
    );

    expect(screen.getByRole('dialog', { name: 'AI 解读' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI：明断但不冒进' })).toBeInTheDocument();
    expect(screen.getByText('先确认边界')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '原始卦象' }));
    expect(screen.getByText('泽天夬')).toBeInTheDocument();
    expect(screen.getByText('兑为泽')).toBeInTheDocument();
    expect(screen.getByText('九三')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '起卦过程' }));
    expect(screen.getAllByText(/第 \d 掷/)).toHaveLength(6);

    await user.click(screen.getByRole('tab', { name: '传统依据' }));
    expect(screen.getByText(/本卦卦辞：夬。扬于王庭/)).toBeInTheDocument();
  });

  it('does not render local reading sections when AI fails', () => {
    const { casting, castingResult } = makeResult();

    render(
      <ResultDialog
        aiStatus={{ state: 'error', message: 'AI 解卦失败：model not found' }}
        aiInterpretation={null}
        castingResult={castingResult}
        tosses={casting.tosses}
        onClose={() => undefined}
        onReset={() => undefined}
        onRetryAi={() => undefined}
        onEditAiSettings={() => undefined}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'AI 解读' });
    expect(within(dialog).getByText('AI 解卦失败：model not found')).toBeInTheDocument();
    expect(screen.queryByText('白话解读')).not.toBeInTheDocument();
    expect(screen.queryByText('行动建议')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试 AI 解读' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改 AI 配置' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- src/components/ResultDialog.test.tsx
```

Expected: FAIL because `ResultDialog` does not exist.

- [ ] **Step 3: Implement `HexagramFacts`**

Create `src/components/HexagramFacts.tsx`:

```tsx
import { buildCasting } from '../domain/coinToss';
import type { CastingResult, CoinToss } from '../domain/types';
import HexagramLines from './HexagramLines';

interface HexagramFactsProps {
  castingResult: CastingResult;
  tosses: CoinToss[];
  view: 'summary' | 'process' | 'basis';
}

function formatCoinFaces(toss: CoinToss): string {
  return toss.faces.map((face) => (face === 'heads' ? '正' : '反')).join('、');
}

function formatMovingLines(castingResult: CastingResult): string {
  if (castingResult.movingLines.length === 0) {
    return '无动爻';
  }

  return castingResult.movingLines.map((line) => line.title).join('、');
}

export default function HexagramFacts({ castingResult, tosses, view }: HexagramFactsProps) {
  const changedHexagramName = castingResult.changedHexagram?.name ?? '无变卦';
  const lines = buildCasting(castingResult.question, castingResult.questionType, tosses).lines;

  if (view === 'process') {
    return (
      <ol className="tossList">
        {tosses.map((toss, index) => (
          <li key={`${index}-${toss.faces.join('-')}`}>
            第 {index + 1} 掷：{formatCoinFaces(toss)}，总分 {toss.score}
          </li>
        ))}
      </ol>
    );
  }

  if (view === 'basis') {
    return (
      <ul className="basisList">
        {castingResult.basis.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="hexagramFacts">
      <dl className="resultFacts">
        <div>
          <dt>所问之事</dt>
          <dd>{castingResult.question}</dd>
        </div>
        <div>
          <dt>本卦</dt>
          <dd>{castingResult.originalHexagram.name}</dd>
        </div>
        <div>
          <dt>变卦</dt>
          <dd>{changedHexagramName}</dd>
        </div>
        <div>
          <dt>动爻</dt>
          <dd>{formatMovingLines(castingResult)}</dd>
        </div>
      </dl>
      <HexagramLines lines={lines} />
    </div>
  );
}
```

- [ ] **Step 4: Implement `ResultDialog`**

Create `src/components/ResultDialog.tsx`:

```tsx
import { useState } from 'react';
import type { AiReadingStatus } from '../ai/aiStatus';
import type { AiInterpretation, CastingResult, CoinToss } from '../domain/types';
import HexagramFacts from './HexagramFacts';
import ModalLayer from './ModalLayer';

type ResultTab = 'ai' | 'summary' | 'process' | 'basis';

interface ResultDialogProps {
  aiStatus?: AiReadingStatus | null;
  aiInterpretation: AiInterpretation | null;
  castingResult: CastingResult;
  tosses: CoinToss[];
  onClose: () => void;
  onReset: () => void;
  onRetryAi: () => void;
  onEditAiSettings: () => void;
}

const TABS: Array<{ id: ResultTab; label: string }> = [
  { id: 'ai', label: 'AI 解读' },
  { id: 'summary', label: '原始卦象' },
  { id: 'process', label: '起卦过程' },
  { id: 'basis', label: '传统依据' }
];

export default function ResultDialog({
  aiStatus,
  aiInterpretation,
  castingResult,
  tosses,
  onClose,
  onReset,
  onRetryAi,
  onEditAiSettings
}: ResultDialogProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>('ai');

  return (
    <ModalLayer
      title="AI 解读"
      onClose={onClose}
      className="resultModal"
      footer={
        <>
          <button className="secondaryButton" type="button" onClick={onReset}>
            重新起卦
          </button>
          {aiStatus?.state === 'error' ? (
            <>
              <button className="secondaryButton" type="button" onClick={onEditAiSettings}>
                修改 AI 配置
              </button>
              <button className="primaryButton" type="button" onClick={onRetryAi}>
                重试 AI 解读
              </button>
            </>
          ) : null}
        </>
      }
    >
      {aiStatus ? <p className={`aiStatus aiStatus-${aiStatus.state}`}>{aiStatus.message}</p> : null}

      <div className="tabList" role="tablist" aria-label="结果内容">
        {TABS.map((tab) => (
          <button
            aria-controls={`result-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className="tabButton"
            id={`result-tab-${tab.id}`}
            key={tab.id}
            role="tab"
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        aria-labelledby={`result-tab-${activeTab}`}
        className="tabPanel"
        id={`result-panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === 'ai' && aiInterpretation ? (
          <div className="aiReadingBlock">
            <h2>{aiInterpretation.headline}</h2>
            {aiInterpretation.plainText.split('\n').map((paragraph, index) => (
              <p key={`${index}-${paragraph}`}>{paragraph}</p>
            ))}
            <h3>行动建议</h3>
            <ul>
              {aiInterpretation.advice.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {activeTab === 'ai' && !aiInterpretation ? (
          <div className="aiReadingBlock">
            <h2>{aiStatus?.state === 'error' ? 'AI 解卦未生成' : '等待 AI 解卦'}</h2>
            <p>
              {aiStatus?.state === 'loading'
                ? '正在把所问之事、本卦、动爻、变卦与传统依据发送给你配置的 Provider。'
                : '本页只保留卦象事实，不使用本地模板补写解读。'}
            </p>
          </div>
        ) : null}

        {activeTab === 'summary' ? (
          <HexagramFacts castingResult={castingResult} tosses={tosses} view="summary" />
        ) : null}
        {activeTab === 'process' ? (
          <HexagramFacts castingResult={castingResult} tosses={tosses} view="process" />
        ) : null}
        {activeTab === 'basis' ? (
          <HexagramFacts castingResult={castingResult} tosses={tosses} view="basis" />
        ) : null}
      </section>
    </ModalLayer>
  );
}
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
npm test -- src/components/ResultDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Remove old result page component and test**

Run:

```bash
git rm src/components/ResultView.tsx src/components/ResultView.test.tsx
```

Expected: both files are staged for deletion.

- [ ] **Step 7: Commit**

```bash
git add src/components/HexagramFacts.tsx src/components/ResultDialog.tsx src/components/ResultDialog.test.tsx
git commit -m "feat: move results into modal tabs"
```

## Task 7: Add Tabletop Scene With WebGL Fallback

**Files:**
- Create: `src/components/TabletopScene.tsx`
- Create: `src/components/TabletopScene.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/TabletopScene.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { createCoinToss } from '../domain/coinToss';
import TabletopScene from './TabletopScene';

describe('TabletopScene', () => {
  it('uses the coin surface as the only visible interaction target', async () => {
    const user = userEvent.setup();
    const onTossRequest = vi.fn();

    render(
      <TabletopScene
        currentThrow={1}
        pendingToss={null}
        resultAvailable={false}
        onOpenResult={() => undefined}
        onTossRequest={onTossRequest}
        onTossSettled={() => undefined}
      />
    );

    await user.click(screen.getByRole('button', { name: '投掷铜钱' }));

    expect(onTossRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('开始起卦')).not.toBeInTheDocument();
    expect(screen.queryByText('AI 解读')).not.toBeInTheDocument();
  });

  it('settles a pending toss in non-WebGL environments', async () => {
    const onTossSettled = vi.fn();

    render(
      <TabletopScene
        currentThrow={2}
        pendingToss={createCoinToss(['heads', 'tails', 'tails'])}
        resultAvailable={false}
        onOpenResult={() => undefined}
        onTossRequest={() => undefined}
        onTossSettled={onTossSettled}
      />
    );

    await waitFor(() => expect(onTossSettled).toHaveBeenCalledTimes(1));
  });

  it('reopens a finished result by interacting with the coins', async () => {
    const user = userEvent.setup();
    const onOpenResult = vi.fn();

    render(
      <TabletopScene
        currentThrow={6}
        pendingToss={null}
        resultAvailable
        onOpenResult={onOpenResult}
        onTossRequest={() => undefined}
        onTossSettled={() => undefined}
      />
    );

    await user.click(screen.getByRole('button', { name: '查看结果' }));
    expect(onOpenResult).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- src/components/TabletopScene.test.tsx
```

Expected: FAIL because `TabletopScene` does not exist.

- [ ] **Step 3: Implement the DOM shell and WebGL guard**

Create `src/components/TabletopScene.tsx` with this public shape:

```tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CoinToss } from '../domain/types';

interface TabletopSceneProps {
  currentThrow: number;
  pendingToss: CoinToss | null;
  resultAvailable: boolean;
  onOpenResult: () => void;
  onTossRequest: () => void;
  onTossSettled: () => void;
}

function canUseWebGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function TabletopScene({
  currentThrow,
  pendingToss,
  resultAvailable,
  onOpenResult,
  onTossRequest,
  onTossSettled
}: TabletopSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const supportsWebGlRef = useRef<boolean | null>(null);

  if (supportsWebGlRef.current === null && typeof document !== 'undefined') {
    supportsWebGlRef.current = canUseWebGl();
  }

  useEffect(() => {
    if (!pendingToss || supportsWebGlRef.current) {
      return undefined;
    }

    const timeout = window.setTimeout(onTossSettled, 20);
    return () => window.clearTimeout(timeout);
  }, [onTossSettled, pendingToss]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !supportsWebGlRef.current) {
      return undefined;
    }

    const cleanup = createThreeScene(mount, () => {
      if (pendingToss) {
        animatePredeterminedToss(pendingToss, onTossSettled);
      }
    });

    return cleanup;
  }, [onTossSettled, pendingToss]);

  const ariaLabel = resultAvailable ? '查看结果' : '投掷铜钱';

  return (
    <section className="tabletopScene" aria-label="铜钱桌面">
      <div ref={mountRef} className="tabletopCanvas" aria-hidden="true" />
      <div className="fallbackCoins" aria-hidden="true">
        <span className="fallbackCoin" />
        <span className="fallbackCoin" />
        <span className="fallbackCoin" />
      </div>
      <button
        className="coinInteractionSurface"
        type="button"
        aria-label={ariaLabel}
        disabled={Boolean(pendingToss)}
        onClick={resultAvailable ? onOpenResult : onTossRequest}
      >
        <span className="srOnly">第 {currentThrow} 掷</span>
      </button>
    </section>
  );
}
```

Add these helper function signatures in the same file:

```tsx
function createThreeScene(mount: HTMLDivElement, onReady: () => void): () => void {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / Math.max(mount.clientHeight, 1), 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mount.appendChild(renderer.domElement);

  camera.position.set(0, 4.2, 6.2);
  camera.lookAt(0, 0, 0);

  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 7),
    new THREE.MeshStandardMaterial({ color: '#2a1b11', roughness: 0.78, metalness: 0.02 })
  );
  table.rotation.x = -Math.PI / 2;
  scene.add(table);

  const light = new THREE.DirectionalLight('#ffe0a3', 2.2);
  light.position.set(2, 5, 3);
  scene.add(light);
  scene.add(new THREE.AmbientLight('#6b4d34', 1.1));

  const coins = [createCoinMesh(), createCoinMesh(), createCoinMesh()];
  coins.forEach((coin, index) => {
    coin.position.set((index - 1) * 1.2, 0.08, 0);
    scene.add(coin);
  });

  let frame = 0;
  const render = () => {
    frame = window.requestAnimationFrame(render);
    renderer.render(scene, camera);
  };

  render();
  onReady();

  return () => {
    window.cancelAnimationFrame(frame);
    renderer.dispose();
    mount.removeChild(renderer.domElement);
  };
}

function createCoinMesh(): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 72);
  const material = new THREE.MeshStandardMaterial({
    color: '#b87429',
    roughness: 0.62,
    metalness: 0.72
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function animatePredeterminedToss(toss: CoinToss, onSettled: () => void): void {
  window.setTimeout(() => {
    void toss;
    onSettled();
  }, 980);
}
```

This first implementation uses a simple 3D coin mesh and deterministic settle callback. Task 10 improves visible coin depth and tabletop presentation without changing the component contract.

- [ ] **Step 4: Run the focused test**

Run:

```bash
npm test -- src/components/TabletopScene.test.tsx
```

Expected: PASS in jsdom through the fallback path.

- [ ] **Step 5: Commit**

```bash
git add src/components/TabletopScene.tsx src/components/TabletopScene.test.tsx
git commit -m "feat: add tabletop coin scene"
```

## Task 8: Add Progress Toast

**Files:**
- Create: `src/components/CastProgressToast.tsx`
- Create: `src/components/CastProgressToast.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/CastProgressToast.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import CastProgressToast from './CastProgressToast';

describe('CastProgressToast', () => {
  it('renders compact casting progress without becoming a persistent panel', () => {
    render(<CastProgressToast currentThrow={3} isAnimating={false} />);

    expect(screen.getByRole('status')).toHaveTextContent('第 3 掷 / 共 6 掷');
  });

  it('announces the settling animation state', () => {
    render(<CastProgressToast currentThrow={4} isAnimating />);

    expect(screen.getByRole('status')).toHaveTextContent('铜钱落定中');
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- src/components/CastProgressToast.test.tsx
```

Expected: FAIL because `CastProgressToast` does not exist.

- [ ] **Step 3: Implement `CastProgressToast`**

Create `src/components/CastProgressToast.tsx`:

```tsx
interface CastProgressToastProps {
  currentThrow: number;
  isAnimating: boolean;
}

export default function CastProgressToast({ currentThrow, isAnimating }: CastProgressToastProps) {
  return (
    <p className="castProgressToast" role="status" aria-live="polite">
      {isAnimating ? '铜钱落定中' : `第 ${currentThrow} 掷 / 共 6 掷`}
    </p>
  );
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
npm test -- src/components/CastProgressToast.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CastProgressToast.tsx src/components/CastProgressToast.test.tsx
git commit -m "feat: add casting progress toast"
```

## Task 9: Orchestrate Tabletop and Modal Flow in App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Delete after this task passes: `src/components/QuestionEntry.tsx`
- Delete after this task passes: `src/components/CastingStage.tsx`
- Delete after this task passes: `src/components/CoinAnimation.tsx`

- [ ] **Step 1: Replace app tests with modal flow expectations**

Update `src/App.test.tsx` so the first test verifies the forced AI dialog:

```tsx
it('opens with an AI settings dialog when API settings are missing', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);

  render(<App />);

  expect(screen.getByRole('dialog', { name: 'AI 配置' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '投掷铜钱' })).toBeInTheDocument();
  expect(screen.queryByText('三钱成卦')).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});
```

Add this test for question and casting:

```tsx
it('collects API settings and question through floating dialogs before casting', async () => {
  const user = userEvent.setup();
  vi.stubGlobal('fetch', vi.fn());

  render(<App />);

  await user.type(screen.getByLabelText('API Key'), 'sk-user');
  await user.click(screen.getByRole('button', { name: '保存配置' }));

  expect(screen.getByRole('dialog', { name: '所问之事' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '今日运势' }));
  await user.click(screen.getByRole('button', { name: '开始起卦' }));

  expect(screen.queryByRole('dialog', { name: '所问之事' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '投掷铜钱' })).toBeInTheDocument();
  expect(screen.queryByText('AI Provider')).not.toBeInTheDocument();
});
```

Update the successful AI reading test to click the coin surface six times:

```tsx
for (let index = 0; index < 6; index += 1) {
  await user.click(screen.getByRole('button', { name: '投掷铜钱' }));
  await screen.findByRole('status');
}

expect(await screen.findByRole('dialog', { name: 'AI 解读' })).toBeInTheDocument();
expect(await screen.findByRole('heading', { name: 'AI：守正而后动' })).toBeInTheDocument();
```

Keep the existing provider request assertions, but update labels to use modal fields.

Update the AI failure test to assert no local reading:

```tsx
expect(await screen.findByText('AI 解卦失败：model not found')).toBeInTheDocument();
expect(screen.getByRole('dialog', { name: 'AI 解读' })).toBeInTheDocument();
expect(screen.queryByText('白话解读')).not.toBeInTheDocument();
expect(screen.queryByText('行动建议')).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: '修改 AI 配置' })).toBeInTheDocument();
```

- [ ] **Step 2: Run app tests to verify they fail**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL because `App.tsx` still renders page-stage components.

- [ ] **Step 3: Implement app modal orchestration**

Replace `src/App.tsx` with this structure:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_AI_SETTINGS } from './ai/aiSettings';
import type { AiReadingStatus } from './ai/aiStatus';
import { createAiInterpretation } from './ai/openaiReading';
import AiSettingsDialog from './components/AiSettingsDialog';
import CastProgressToast from './components/CastProgressToast';
import QuestionDialog from './components/QuestionDialog';
import ResultDialog from './components/ResultDialog';
import TabletopScene from './components/TabletopScene';
import { tossCoins } from './domain/coinToss';
import type { AiInterpretation, CoinToss, QuestionType } from './domain/types';
import { useCastingSession } from './hooks/useCastingSession';

type ActiveDialog = 'ai-settings' | 'question' | 'result' | null;

export default function App() {
  const session = useCastingSession();
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [aiSettings, setAiSettings] = useState(DEFAULT_AI_SETTINGS);
  const [aiInterpretation, setAiInterpretation] = useState<AiInterpretation | null>(null);
  const [aiStatus, setAiStatus] = useState<AiReadingStatus | null>(null);
  const [pendingToss, setPendingToss] = useState<CoinToss | null>(null);
  const [aiRequestNonce, setAiRequestNonce] = useState(0);

  const isAiConfigured = Boolean(
    aiSettings.apiKey.trim() && aiSettings.apiUrl.trim() && aiSettings.model.trim()
  );

  useEffect(() => {
    if (!isAiConfigured) {
      setActiveDialog('ai-settings');
      return;
    }

    if (session.phase === 'question') {
      setActiveDialog('question');
    }
  }, [isAiConfigured, session.phase]);

  useEffect(() => {
    if (session.phase !== 'result' || !session.castingResult) {
      setAiInterpretation(null);
      setAiStatus(null);
      return;
    }

    setActiveDialog('result');

    const apiKey = aiSettings.apiKey.trim();
    const apiUrl = aiSettings.apiUrl.trim();
    const model = aiSettings.model.trim();
    if (!apiKey || !apiUrl || !model) {
      setAiInterpretation(null);
      setAiStatus({
        state: 'error',
        message: 'AI 解卦需要 API URL、API Key 和模型。'
      });
      return;
    }

    const controller = new AbortController();
    setAiInterpretation(null);
    setAiStatus({
      state: 'loading',
      message: 'AI 正在基于传统依据解卦，卦辞和爻辞保持原文。'
    });

    createAiInterpretation(session.castingResult, session.tosses, {
      apiKey,
      apiUrl,
      model,
      provider: aiSettings.provider,
      signal: controller.signal
    })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        setAiInterpretation(result);
        setAiStatus({
          state: 'ready',
          message: 'AI 解卦已生成；传统卦辞与爻辞未被改写。'
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : '未知错误';
        setAiStatus({
          state: 'error',
          message: `AI 解卦失败：${message}`
        });
      });

    return () => controller.abort();
  }, [
    aiRequestNonce,
    aiSettings.apiKey,
    aiSettings.apiUrl,
    aiSettings.model,
    aiSettings.provider,
    session.castingResult,
    session.phase,
    session.tosses
  ]);

  const startCasting = (question: string, questionType: QuestionType) => {
    session.start(question, questionType);
    setActiveDialog(null);
  };

  const requestToss = useCallback(() => {
    if (session.phase !== 'casting' || pendingToss) {
      return;
    }

    setPendingToss(tossCoins());
  }, [pendingToss, session.phase]);

  const settleToss = useCallback(() => {
    if (!pendingToss) {
      return;
    }

    session.recordToss(pendingToss);
    setPendingToss(null);
  }, [pendingToss, session]);

  const reset = () => {
    setPendingToss(null);
    setAiInterpretation(null);
    setAiStatus(null);
    session.reset();
  };

  return (
    <main className="appShell">
      <TabletopScene
        currentThrow={session.currentThrow}
        pendingToss={pendingToss}
        resultAvailable={session.phase === 'result' && Boolean(session.castingResult)}
        onOpenResult={() => setActiveDialog('result')}
        onTossRequest={requestToss}
        onTossSettled={settleToss}
      />

      {session.phase === 'casting' ? (
        <CastProgressToast currentThrow={session.currentThrow} isAnimating={Boolean(pendingToss)} />
      ) : null}

      {activeDialog === 'ai-settings' ? (
        <AiSettingsDialog
          aiSettings={aiSettings}
          isAiConfigured={isAiConfigured}
          onAiSettingsChange={setAiSettings}
          onSubmit={() => setActiveDialog('question')}
        />
      ) : null}

      {activeDialog === 'question' && isAiConfigured ? <QuestionDialog onStart={startCasting} /> : null}

      {activeDialog === 'result' && session.castingResult ? (
        <ResultDialog
          aiStatus={aiStatus}
          aiInterpretation={aiInterpretation}
          castingResult={session.castingResult}
          tosses={session.tosses}
          onClose={() => setActiveDialog(null)}
          onReset={reset}
          onRetryAi={() => setAiRequestNonce((value) => value + 1)}
          onEditAiSettings={() => setActiveDialog('ai-settings')}
        />
      ) : null}
    </main>
  );
}
```

- [ ] **Step 4: Run app tests**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Remove old stage components**

Run:

```bash
git rm src/components/QuestionEntry.tsx src/components/CastingStage.tsx src/components/CoinAnimation.tsx
```

Expected: the old page/stage components are staged for deletion.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: orchestrate tabletop modal flow"
```

## Task 10: Replace Page CSS With Tabletop and Dialog Styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add visual assertions to app tests**

Add these assertions to the first `App.test.tsx` test:

```tsx
expect(document.querySelector('.tabletopScene')).toBeInTheDocument();
expect(document.querySelector('.questionPanel')).not.toBeInTheDocument();
expect(document.querySelector('.resultPanel')).not.toBeInTheDocument();
expect(document.querySelector('.castingPanel')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run app tests**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS. The style classes do not affect behavior yet, but the old page panels must be absent from rendered output.

- [ ] **Step 3: Replace obsolete CSS blocks**

In `src/styles.css`, remove the page-layout classes that no component uses after Task 9:

- `.questionPanel`
- `.castingPanel`
- `.resultPanel`
- `.cameraFrame`
- `.cameraVideo`
- `.gestureScanner`
- `.gestureRing`
- `.gestureCore`
- `.cameraHint`
- `.gestureStatus`
- `.coinTray`
- `.coin`
- `.oracleColumn`
- `.aiReadingColumn`

Keep and adapt shared classes:

- `.primaryButton`
- `.secondaryButton`
- `.quickGrid`
- `.quickButton`
- `.hexagramLines`
- `.hexLineRow`
- `.yangLine`
- `.yinLine`
- `.lineLabel`
- `.movingMark`
- `.srOnly`
- `.aiStatus`

Add these tabletop and modal styles:

```css
:root {
  color: #f4ead6;
  background: #15100b;
  font-family: "Songti SC", "Noto Serif CJK SC", "Microsoft YaHei", system-ui, sans-serif;
}

.appShell {
  position: relative;
  overflow: hidden;
  min-width: 320px;
  min-height: 100vh;
  background:
    radial-gradient(circle at 50% 44%, rgba(238, 184, 91, 0.16), transparent 24rem),
    linear-gradient(145deg, #24160d 0%, #15100b 48%, #0b0a08 100%);
}

.tabletopScene {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.tabletopScene::before {
  position: absolute;
  inset: 0;
  content: "";
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(0deg, rgba(0, 0, 0, 0.16) 1px, transparent 1px),
    radial-gradient(circle at 50% 45%, rgba(161, 92, 36, 0.32), transparent 35rem);
  background-size: 96px 96px, 96px 96px, auto;
  opacity: 0.55;
}

.tabletopCanvas,
.fallbackCoins,
.coinInteractionSurface {
  position: absolute;
  inset: 0;
}

.fallbackCoins {
  display: grid;
  grid-template-columns: repeat(3, 86px);
  place-content: center;
  gap: 22px;
  pointer-events: none;
}

.fallbackCoin {
  display: block;
  width: 86px;
  aspect-ratio: 1;
  border: 9px solid #b9782f;
  border-radius: 50%;
  background:
    linear-gradient(145deg, #d7a14f, #7d451e),
    radial-gradient(circle, transparent 0 18%, #2c180d 19% 28%, transparent 29%);
  box-shadow:
    inset 0 8px 16px rgba(255, 224, 153, 0.28),
    inset 0 -10px 18px rgba(54, 26, 9, 0.44),
    0 24px 34px rgba(0, 0, 0, 0.42);
}

.fallbackCoin::after {
  display: block;
  width: 24px;
  aspect-ratio: 1;
  margin: 22px auto;
  content: "";
  background: #21130c;
  box-shadow: inset 0 2px 5px rgba(255, 230, 178, 0.24);
}

.coinInteractionSurface {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.coinInteractionSurface:disabled {
  cursor: wait;
}

.coinInteractionSurface:focus-visible {
  outline: 2px solid rgba(242, 214, 145, 0.9);
  outline-offset: -18px;
}

.modalOverlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(5, 4, 3, 0.48);
  backdrop-filter: blur(12px);
}

.modalPanel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(720px, 100%);
  max-height: min(82vh, 820px);
  border: 1px solid rgba(232, 190, 106, 0.26);
  border-radius: 8px;
  color: #f4ead6;
  background: rgba(19, 16, 12, 0.93);
  box-shadow: 0 34px 100px rgba(0, 0, 0, 0.5);
}

.resultModal {
  width: min(940px, 100%);
}

.modalHeader,
.modalFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(232, 190, 106, 0.14);
}

.modalFooter {
  justify-content: flex-end;
  border-top: 1px solid rgba(232, 190, 106, 0.14);
  border-bottom: 0;
}

.modalHeader h1 {
  margin: 0;
  color: #fff5df;
  font-size: 1.45rem;
  line-height: 1.25;
  letter-spacing: 0;
}

.modalBody {
  overflow: auto;
  padding: 20px;
}

.modalCopy {
  margin: 0 0 16px;
  color: #cdbfa9;
  line-height: 1.7;
}

.iconButton {
  display: grid;
  width: 38px;
  aspect-ratio: 1;
  place-items: center;
  border: 1px solid rgba(232, 190, 106, 0.24);
  border-radius: 50%;
  color: #f4ead6;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.formGrid,
.formField {
  display: grid;
  gap: 12px;
}

.formGrid {
  grid-template-columns: 1fr;
}

.formField {
  color: #f2d691;
  font-weight: 800;
}

.formField input,
.formField select,
.formField textarea {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid rgba(210, 198, 175, 0.24);
  border-radius: 8px;
  color: #f4ead6;
  background: rgba(0, 0, 0, 0.28);
  line-height: 1.5;
}

.formField textarea {
  min-height: 132px;
  resize: vertical;
}

.castProgressToast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 10;
  margin: 0;
  padding: 10px 14px;
  border: 1px solid rgba(232, 190, 106, 0.24);
  border-radius: 999px;
  color: #fff5df;
  background: rgba(19, 16, 12, 0.72);
  transform: translateX(-50%);
  backdrop-filter: blur(10px);
}

.tabList {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
}

.tabButton {
  min-height: 38px;
  padding: 0 13px;
  border: 1px solid rgba(232, 190, 106, 0.24);
  border-radius: 8px;
  color: #f4ead6;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.tabButton[aria-selected="true"] {
  color: #20130a;
  background: #d7aa61;
  border-color: #f2d691;
}

.tabPanel {
  min-height: 220px;
}

@media (max-width: 620px) {
  .modalOverlay {
    align-items: end;
    padding: 12px;
  }

  .modalPanel {
    max-height: 88vh;
  }

  .fallbackCoins {
    grid-template-columns: repeat(3, 62px);
    gap: 14px;
  }

  .fallbackCoin {
    width: 62px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
    animation-duration: 1ms !important;
  }
}
```

- [ ] **Step 4: Run lint and component tests**

Run:

```bash
npm run lint
```

Expected: exit code 0.

Run:

```bash
npm test -- src/App.test.tsx src/components/ResultDialog.test.tsx src/components/TabletopScene.test.tsx
```

Expected: all listed tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/App.test.tsx
git commit -m "style: redesign tabletop modal interface"
```

## Task 11: Preserve Optional Gesture Trigger Without Visible Camera UI

**Files:**
- Modify: `src/components/TabletopScene.tsx`
- Create: `src/components/TabletopScene.gesture.test.tsx`

- [ ] **Step 1: Write the focused gesture test**

Create `src/components/TabletopScene.gesture.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import TabletopScene from './TabletopScene';

describe('TabletopScene gesture-neutral trigger', () => {
  it('allows keyboard users to trigger the same coin toss surface', async () => {
    const user = userEvent.setup();
    const onTossRequest = vi.fn();

    render(
      <TabletopScene
        currentThrow={1}
        pendingToss={null}
        resultAvailable={false}
        onOpenResult={() => undefined}
        onTossRequest={onTossRequest}
        onTossSettled={() => undefined}
      />
    );

    screen.getByRole('button', { name: '投掷铜钱' }).focus();
    await user.keyboard('[Enter]');

    expect(onTossRequest).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
npm test -- src/components/TabletopScene.gesture.test.tsx
```

Expected: PASS because the coin surface is already a real button.

- [ ] **Step 3: Verify visible camera UI is absent**

Run:

```bash
rg -n "摄像头|cameraFrame|cameraVideo|gestureScanner|手势识别区" src/components src/App.tsx
```

Expected: no matches in rendered components. Keep `src/camera/gestureRecognizer.ts` and `src/camera/gestureRecognizer.test.ts` unchanged because they are non-rendered adapters and the accepted design does not require visible camera preview.

- [ ] **Step 4: Commit**

```bash
git add src/components/TabletopScene.gesture.test.tsx
git commit -m "test: cover coin surface keyboard trigger"
```

## Task 12: Full Verification and Cleanup

**Files:**
- Verify all changed source, tests, and docs.

- [ ] **Step 1: Check for obsolete imports and component references**

Run:

```bash
rg -n "QuestionEntry|CastingStage|CoinAnimation|ResultView|questionPanel|castingPanel|resultPanel|coinTray|cameraFrame" src
```

Expected: no matches.

- [ ] **Step 2: Check the no-local-fallback requirement**

Run:

```bash
rg -n "兜底|本地模板|白话解读|行动建议|AI 解卦失败" src
```

Expected: matches may exist only in AI failure copy, tests proving no fallback, and result dialog labels for successful AI content. There must be no deterministic local function that generates `plainText` or `advice`.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Run TypeScript build/lint**

Run:

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 5: Build production bundle**

Run:

```bash
npm run build
```

Expected: exit code 0 and Vite emits `dist/`.

- [ ] **Step 6: Commit final cleanup if needed**

If verification required cleanup changes, commit them:

```bash
git add src package.json package-lock.json
git commit -m "chore: verify tabletop modal redesign"
```

If no cleanup changes exist, do not create an empty commit.

## Spec Coverage Map

- Physical tabletop as the only main screen: Task 7 creates `TabletopScene`; Task 10 removes page panels and adds full-screen tabletop styles.
- AI API information in a top-layer floating dialog: Task 4 creates `AiSettingsDialog`; Task 9 forces it open when configuration is incomplete.
- Question entry in a floating dialog: Task 5 creates `QuestionDialog`; Task 9 opens it after API configuration.
- 3D coin visual and realistic toss pipeline: Task 1 adds Three.js; Task 7 creates the 3D scene contract; Task 9 generates a predetermined toss before animation and records it after settlement.
- No fixed controls or result panels on the tabletop: Task 9 removes stage/page components; Task 10 removes obsolete panel classes and asserts old panels are absent.
- AI-only interpretation with no local fallback: Task 6 and Task 9 assert AI failures do not render local reading sections; Task 12 searches for fallback-generating code.
- Raw hexagram preservation: Task 6 creates `HexagramFacts` and `ResultDialog` tabs for original hexagram, toss process, and traditional basis.
- Accessibility and responsive modal behavior: Task 3 creates accessible dialog semantics; Task 10 adds modal sizing, internal scrolling, focus-visible styling, and reduced-motion CSS.

## Implementation Notes

- Do not persist API keys to `localStorage`, `sessionStorage`, or files.
- Do not add a fallback AI interpretation in `src/domain/interpretation.ts`; that module should keep producing raw facts and traditional basis only.
- The tabletop may contain an accessible button overlay, but it must have no visible text. Visible controls live in dialogs.
- `CastProgressToast` is the only allowed non-dialog text on the tabletop during casting, and it must be short-lived and compact.
- The first Three.js implementation can use scripted animation. Real physics is not required to satisfy the accepted spec as long as the motion has visible lift, spin, contact, and settle behavior in browser QA.
- If WebGL is unavailable, render the CSS fallback coins and still complete tosses. The fallback must not show forms or result panels on the tabletop.
