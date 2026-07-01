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

function getVisibleTabPanel(): HTMLElement {
  const visiblePanels = screen.getAllByRole('tabpanel');
  expect(visiblePanels).toHaveLength(1);
  return visiblePanels[0];
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
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(4);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    const aiTab = within(dialog).getByRole('tab', { name: 'AI 解读' });
    expect(aiTab).toHaveAttribute('aria-selected', 'true');
    expect(aiTab).toHaveAttribute('tabIndex', '0');
    expect(aiTab).toHaveAttribute('id', 'result-tab-ai');
    expect(aiTab).toHaveAttribute('aria-controls', 'result-panel-ai');
    const summaryTab = within(dialog).getByRole('tab', { name: '原始卦象' });
    expect(summaryTab).toHaveAttribute('aria-selected', 'false');
    expect(summaryTab).toHaveAttribute('tabIndex', '-1');
    let visiblePanel = getVisibleTabPanel();
    expect(visiblePanel).toHaveAttribute('id', 'result-panel-ai');
    expect(visiblePanel).toHaveAttribute('aria-labelledby', 'result-tab-ai');
    expect(within(visiblePanel).getByRole('heading', { name: 'AI：明断但不冒进' })).toBeInTheDocument();
    expect(within(visiblePanel).getByText('先确认边界')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: '原始卦象' }));
    expect(summaryTab).toHaveAttribute('aria-selected', 'true');
    expect(summaryTab).toHaveAttribute('tabIndex', '0');
    expect(summaryTab).toHaveAttribute('id', 'result-tab-summary');
    expect(summaryTab).toHaveAttribute('aria-controls', 'result-panel-summary');
    visiblePanel = getVisibleTabPanel();
    expect(visiblePanel).toHaveAttribute('id', 'result-panel-summary');
    expect(visiblePanel).toHaveAttribute('aria-labelledby', 'result-tab-summary');
    expect(within(visiblePanel).getByText('泽天夬')).toBeInTheDocument();
    expect(within(visiblePanel).getByText('兑为泽')).toBeInTheDocument();
    expect(within(visiblePanel).getByText('九三')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: '起卦过程' }));
    visiblePanel = getVisibleTabPanel();
    expect(within(visiblePanel).getAllByText(/第 \d 掷/)).toHaveLength(6);

    await user.click(within(dialog).getByRole('tab', { name: '传统依据' }));
    visiblePanel = getVisibleTabPanel();
    expect(within(visiblePanel).getByText(/本卦卦辞：夬。扬于王庭/)).toBeInTheDocument();
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

  it('renders loading AI state without local reading sections or error actions', () => {
    renderResultDialog({
      aiStatus: { state: 'loading', message: 'AI 解卦生成中...' },
      aiInterpretation: null
    });

    const dialog = screen.getByRole('dialog', { name: 'AI 解读' });
    const visiblePanel = getVisibleTabPanel();
    const status = within(dialog).getByRole('status');

    expect(status).toHaveTextContent('AI 解卦生成中...');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(
      within(visiblePanel).getByText(
        '正在把所问之事、本卦、动爻、变卦与传统依据发送给你配置的 Provider。'
      )
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('白话解读')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('行动建议')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '重试 AI 解读' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '修改 AI 配置' })).not.toBeInTheDocument();
  });

  it('keeps every tab aria-controls target mounted while the AI tab is active', () => {
    renderResultDialog();

    const dialog = screen.getByRole('dialog', { name: 'AI 解读' });
    const tabControls = within(dialog)
      .getAllByRole('tab')
      .map((tab) => tab.getAttribute('aria-controls'));

    expect(tabControls).toHaveLength(4);
    for (const controlsId of tabControls) {
      expect(controlsId).toBeTruthy();
      expect(document.getElementById(controlsId as string)).toBeInTheDocument();
    }
  });

  it('moves selection and focus with tab keyboard navigation', async () => {
    const user = userEvent.setup();
    renderResultDialog();

    const dialog = screen.getByRole('dialog', { name: 'AI 解读' });
    const aiTab = within(dialog).getByRole('tab', { name: 'AI 解读' });
    const summaryTab = within(dialog).getByRole('tab', { name: '原始卦象' });
    const basisTab = within(dialog).getByRole('tab', { name: '传统依据' });

    aiTab.focus();
    expect(aiTab).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(summaryTab).toHaveAttribute('aria-selected', 'true');
    expect(summaryTab).toHaveAttribute('tabIndex', '0');
    expect(summaryTab).toHaveFocus();
    expect(within(getVisibleTabPanel()).getByText('泽天夬')).toBeInTheDocument();

    await user.keyboard('{End}');
    expect(basisTab).toHaveAttribute('aria-selected', 'true');
    expect(basisTab).toHaveAttribute('tabIndex', '0');
    expect(basisTab).toHaveFocus();
    expect(within(getVisibleTabPanel()).getByText(/本卦卦辞：夬。扬于王庭/)).toBeInTheDocument();

    await user.keyboard('{Home}');
    expect(aiTab).toHaveAttribute('aria-selected', 'true');
    expect(aiTab).toHaveAttribute('tabIndex', '0');
    expect(aiTab).toHaveFocus();
    expect(within(getVisibleTabPanel()).getByRole('heading', { name: 'AI：明断但不冒进' })).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(basisTab).toHaveAttribute('aria-selected', 'true');
    expect(basisTab).toHaveAttribute('tabIndex', '0');
    expect(basisTab).toHaveFocus();
    expect(within(getVisibleTabPanel()).getByText(/本卦卦辞：夬。扬于王庭/)).toBeInTheDocument();
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
    const visiblePanel = getVisibleTabPanel();

    expect(within(visiblePanel).getByText('无变卦')).toBeInTheDocument();
    expect(within(visiblePanel).getByText('无动爻')).toBeInTheDocument();
  });
});
