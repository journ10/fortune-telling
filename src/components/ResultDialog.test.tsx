import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { AiReadingStatus } from '../ai/aiStatus';
import { buildCasting, createCoinToss } from '../domain/coinToss';
import { createCastingResult } from '../domain/interpretation';
import type { AiInterpretation, Casting, CastingResult } from '../domain/types';
import ResultDialog from './ResultDialog';

interface ResultDialogFixture {
  aiInterpretation: AiInterpretation | null;
  casting: Casting;
  castingResult: CastingResult;
}

function buildResultDialogFixture(): ResultDialogFixture {
  const tosses = [
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'heads', 'heads']),
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'heads', 'tails'])
  ];
  const casting = buildCasting('今日运势', 'general', tosses);
  const castingResult = createCastingResult(casting);
  const aiInterpretation: AiInterpretation = {
    ...castingResult,
    headline: 'AI：明断但不冒进',
    plainText: '本卦提示事情已经到了需要表态的时候。\n动爻提示表达方式要稳。',
    advice: ['先确认边界', '避免情绪化推进', '保留复盘时间']
  };

  return { aiInterpretation, casting, castingResult };
}

interface RenderResultDialogOptions {
  aiInterpretation?: AiInterpretation | null;
  aiStatus?: AiReadingStatus | null;
  fixture?: ResultDialogFixture;
}

function renderResultDialog({
  aiInterpretation,
  aiStatus,
  fixture = buildResultDialogFixture()
}: RenderResultDialogOptions = {}) {
  render(
    <ResultDialog
      aiStatus={aiStatus}
      aiInterpretation={aiInterpretation === undefined ? fixture.aiInterpretation : aiInterpretation}
      castingResult={fixture.castingResult}
      tosses={fixture.casting.tosses}
      onClose={vi.fn()}
      onReset={vi.fn()}
      onRetryAi={vi.fn()}
      onEditAiSettings={vi.fn()}
    />
  );

  return fixture;
}

describe('ResultDialog', () => {
  it('renders a successful AI result with traceable raw hexagram tabs', async () => {
    const user = userEvent.setup();

    renderResultDialog({
      aiStatus: {
        state: 'ready',
        message: 'AI 解卦已生成；传统卦辞与爻辞未被改写。'
      }
    });

    const dialog = screen.getByRole('dialog', { name: 'AI 解读' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('AI 解卦已生成；传统卦辞与爻辞未被改写。')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'AI：明断但不冒进' })).toBeInTheDocument();
    expect(within(dialog).getByText('先确认边界')).toBeInTheDocument();
    const aiTab = within(dialog).getByRole('tab', { name: 'AI 解读' });
    expect(aiTab).toHaveAttribute('id', 'result-tab-ai');
    expect(aiTab).toHaveAttribute('aria-controls', 'result-panel-ai');
    expect(within(dialog).getByRole('tabpanel')).toHaveAttribute('id', 'result-panel-ai');
    expect(within(dialog).getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'result-tab-ai'
    );

    await user.click(within(dialog).getByRole('tab', { name: '原始卦象' }));
    const summaryTab = within(dialog).getByRole('tab', { name: '原始卦象' });
    expect(summaryTab).toHaveAttribute('id', 'result-tab-summary');
    expect(summaryTab).toHaveAttribute('aria-controls', 'result-panel-summary');
    expect(within(dialog).getByRole('tabpanel')).toHaveAttribute('id', 'result-panel-summary');
    expect(within(dialog).getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'result-tab-summary'
    );
    expect(within(dialog).getByText('泽天夬')).toBeInTheDocument();
    expect(within(dialog).getByText('兑为泽')).toBeInTheDocument();
    expect(within(dialog).getByText('九三')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: '起卦过程' }));
    expect(within(dialog).getAllByText(/第 \d 掷/)).toHaveLength(6);

    await user.click(within(dialog).getByRole('tab', { name: '传统依据' }));
    expect(within(dialog).getByText(/本卦卦辞：夬。扬于王庭/)).toBeInTheDocument();
  });

  it('renders AI failure actions without local reading sections', () => {
    renderResultDialog({
      aiStatus: { state: 'error', message: 'AI 解卦失败：model not found' },
      aiInterpretation: null
    });

    const dialog = screen.getByRole('dialog', { name: 'AI 解读' });
    expect(within(dialog).getByText('AI 解卦失败：model not found')).toBeInTheDocument();
    expect(within(dialog).queryByText('白话解读')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('行动建议')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '重试 AI 解读' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '修改 AI 配置' })).toBeInTheDocument();
  });

  it('renders stable casting facts without changed hexagram or moving lines', async () => {
    const user = userEvent.setup();
    const tosses = [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails'])
    ];
    const casting = buildCasting('今日运势', 'general', tosses);
    const castingResult = createCastingResult(casting);

    renderResultDialog({
      aiInterpretation: null,
      aiStatus: null,
      fixture: { aiInterpretation: null, casting, castingResult }
    });

    const dialog = screen.getByRole('dialog', { name: 'AI 解读' });
    await user.click(within(dialog).getByRole('tab', { name: '原始卦象' }));

    expect(within(dialog).getByText('无变卦')).toBeInTheDocument();
    expect(within(dialog).getByText('无动爻')).toBeInTheDocument();
  });
});
