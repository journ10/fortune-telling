import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { buildCasting, createCoinToss } from '../domain/coinToss';
import { createInterpretation } from '../domain/interpretation';
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
    const interpretation = createInterpretation(casting);

    render(<ResultView interpretation={interpretation} tosses={casting.tosses} onReset={onReset} />);

    expect(screen.getByRole('heading', { name: /卦象结果/ })).toBeInTheDocument();
    expect(screen.getByText('今日运势')).toBeInTheDocument();
    expect(screen.getByText('白话解读')).toBeInTheDocument();
    expect(screen.getByText('行动建议')).toBeInTheDocument();
    expect(screen.getByText('传统依据')).toBeInTheDocument();
    expect(screen.getByText('本卦卦象')).toBeInTheDocument();
    const hexagramLines = screen.getByRole('list', { name: '六爻' });
    expect(hexagramLines).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '卦象结果：泽天夬' })).toBeInTheDocument();
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
    const interpretation = createInterpretation(casting);

    render(<ResultView interpretation={interpretation} tosses={casting.tosses} onReset={() => undefined} />);

    expect(screen.getByText('无变卦')).toBeInTheDocument();
    expect(screen.getByText('无动爻')).toBeInTheDocument();
    expect(screen.getAllByText(/第 \d 掷/)).toHaveLength(6);
  });
});
