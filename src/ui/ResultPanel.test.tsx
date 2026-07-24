// ResultPanel AI 区块测试：四种 aiStatus 的渲染与重试入口。
// 传统结果区（本卦/动爻/变卦/传统依据/投掷证据）在任何 AI 状态下都完整渲染。

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCasting, createCoinToss } from '../domain/coinToss';
import { createCastingResult } from '../domain/interpretation';
import type { CoinFace } from '../domain/types';
import ResultPanel, { type AiReadingStatus } from './ResultPanel';

const FACES: Array<[CoinFace, CoinFace, CoinFace]> = [
  ['heads', 'tails', 'tails'],
  ['heads', 'tails', 'tails'],
  ['heads', 'heads', 'heads'],
  ['heads', 'tails', 'tails'],
  ['heads', 'tails', 'tails'],
  ['heads', 'heads', 'tails']
];

const RESULT = createCastingResult(
  buildCasting('今日运势', 'general', FACES.map((faces) => createCoinToss(faces)))
);
const TOSSES = FACES.map((faces) => createCoinToss(faces));

function renderPanel(aiStatus: AiReadingStatus, overrides: Partial<Parameters<typeof ResultPanel>[0]> = {}) {
  return render(
    <ResultPanel
      result={RESULT}
      tosses={TOSSES}
      evidences={[]}
      aiStatus={aiStatus}
      onClose={() => undefined}
      onReset={() => undefined}
      {...overrides}
    />
  );
}

afterEach(cleanup);

describe('ResultPanel AI 区块', () => {
  it('unconfigured：引导配置，传统结果完整渲染', () => {
    renderPanel({ kind: 'unconfigured' }, { onOpenAiSettings: () => undefined });

    expect(screen.getByTestId('ai-unconfigured')).toBeInTheDocument();
    expect(screen.getByText(/传统结果已完整可用/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '配置 AI' })).toBeInTheDocument();
    // 传统结果层级不变：本卦标题仍是主角。
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(RESULT.originalHexagram.name);
    expect(screen.getByText('传统依据')).toBeInTheDocument();
  });

  it('reading：展示生成中提示', () => {
    renderPanel({ kind: 'reading' });

    expect(screen.getByTestId('ai-reading')).toHaveTextContent('AI 解读生成中');
    expect(screen.getByText('传统依据')).toBeInTheDocument();
  });

  it('ready：渲染标题、分段正文与建议列表', () => {
    renderPanel({
      kind: 'ready',
      reading: {
        headline: '夬卦重在明断',
        plainText: '第一段话。\n第二段话。',
        advice: ['先确认边界', '保留复盘时间']
      }
    });

    const section = screen.getByTestId('ai-ready');
    expect(section).toHaveTextContent('夬卦重在明断');
    expect(section).toHaveTextContent('第一段话。');
    expect(section).toHaveTextContent('第二段话。');
    expect(screen.getByText('先确认边界')).toBeInTheDocument();
    expect(screen.getByText('保留复盘时间')).toBeInTheDocument();
  });

  it('error：展示可行动文案，重试与设置按钮可用', async () => {
    const user = userEvent.setup();
    const onRetryAi = vi.fn();
    const onOpenAiSettings = vi.fn();

    renderPanel(
      { kind: 'error', message: 'server exploded' },
      { onRetryAi, onOpenAiSettings }
    );

    const section = screen.getByTestId('ai-error');
    expect(section).toHaveTextContent('server exploded');
    expect(section).toHaveTextContent('传统结果完整保留');

    await user.click(screen.getByRole('button', { name: '重试 AI 解读' }));
    expect(onRetryAi).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '打开 AI 设置' }));
    expect(onOpenAiSettings).toHaveBeenCalledTimes(1);

    // 错误不抢占结果页标题。
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(RESULT.originalHexagram.name);
  });
});
