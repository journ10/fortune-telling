import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { buildCasting, createCoinToss } from '../domain/coinToss';
import { createCastingResult } from '../domain/interpretation';
import type { AiInterpretation } from '../domain/types';
import { ResultView } from './ResultView';

describe('ResultView', () => {
  it('renders changed-hexagram reading, traceable basis, tosses, and reset action', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
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

    render(
      <ResultView
        aiInterpretation={aiInterpretation}
        castingResult={castingResult}
        tosses={casting.tosses}
        onReset={onReset}
      />
    );

    expect(screen.getByRole('heading', { name: /卦象结果/ })).toBeInTheDocument();
    expect(screen.getByText('今日运势')).toBeInTheDocument();
    expect(screen.getByText('白话解读')).toBeInTheDocument();
    expect(screen.getByText('行动建议')).toBeInTheDocument();
    expect(screen.getByText('传统依据')).toBeInTheDocument();
    expect(screen.getByText('本卦卦象')).toBeInTheDocument();
    const hexagramLines = screen.getByRole('list', { name: '六爻' });
    expect(hexagramLines).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '卦象结果：泽天夬' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI：明断但不冒进' })).toBeInTheDocument();
    expect(screen.getByText(/本卦提示事情已经到了需要表态/)).toBeInTheDocument();
    expect(screen.getByText('先确认边界')).toBeInTheDocument();
    expect(screen.getByText('泽天夬')).toBeInTheDocument();
    expect(screen.getByText('兑为泽')).toBeInTheDocument();
    expect(screen.getByText('九三')).toBeInTheDocument();
    expect(screen.getByText(/本卦卦辞：夬。扬于王庭/)).toBeInTheDocument();
    expect(screen.getByText(/本卦象辞：泽上于天/)).toBeInTheDocument();
    expect(screen.getByText(/动爻爻辞：九三/)).toBeInTheDocument();
    expect(screen.getByText('第 3 掷：正、正、正，总分 9')).toBeInTheDocument();
    expect(screen.getAllByText(/第 \d 掷/)).toHaveLength(6);
    expect(within(hexagramLines).getAllByRole('listitem')).toHaveLength(6);

    await user.click(screen.getByRole('button', { name: '重新起卦' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('renders no changed hexagram or moving lines when the casting is stable', () => {
    const casting = buildCasting('今日运势', 'general', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails'])
    ]);
    const castingResult = createCastingResult(casting);

    render(
      <ResultView
        aiInterpretation={null}
        castingResult={castingResult}
        tosses={casting.tosses}
        onReset={() => undefined}
      />
    );

    expect(screen.getByText('无变卦')).toBeInTheDocument();
    expect(screen.getByText('无动爻')).toBeInTheDocument();
    expect(screen.getAllByText(/第 \d 掷/)).toHaveLength(6);
  });

  it('keeps original hexagram facts visible but withholds local reading text when AI fails', () => {
    const casting = buildCasting('今日运势', 'general', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails'])
    ]);
    const castingResult = createCastingResult(casting);

    render(
      <ResultView
        aiStatus={{ state: 'error', message: 'AI 解卦失败：model not found' }}
        aiInterpretation={null}
        castingResult={castingResult}
        tosses={casting.tosses}
        onReset={() => undefined}
      />
    );

    expect(screen.getByRole('heading', { name: '卦象结果：泽天夬' })).toBeInTheDocument();
    expect(screen.getByText('传统依据')).toBeInTheDocument();
    expect(screen.getByText('AI 解卦失败：model not found')).toBeInTheDocument();
    expect(screen.getByText(/不使用本地模板补写解读/)).toBeInTheDocument();
    expect(screen.queryByText('白话解读')).not.toBeInTheDocument();
    expect(screen.queryByText('行动建议')).not.toBeInTheDocument();
  });
});
