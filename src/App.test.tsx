import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App', () => {
  it('lets a user choose a quick question and complete six manual tosses', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '最近事业' }));
    expect(screen.getByRole('textbox', { name: '所问之事' })).toHaveValue('最近事业怎么推进？');

    await user.click(screen.getByRole('button', { name: '今日运势' }));
    await user.click(screen.getByRole('button', { name: '开始起卦' }));

    expect(screen.getByText(/MediaPipe CDN/)).toBeInTheDocument();

    for (let index = 0; index < 6; index += 1) {
      await user.click(screen.getByRole('button', { name: '手动掷一次' }));

      if (index === 0) {
        expect(screen.getByRole('list', { name: '六爻' })).toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
      }
    }

    expect(await screen.findByRole('heading', { name: /卦象结果/ })).toBeInTheDocument();
    expect(screen.getByText('今日运势')).toBeInTheDocument();
    expect(screen.getByText(/传统依据/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重新起卦' }));
    expect(screen.getByRole('heading', { name: '三钱成卦' })).toBeInTheDocument();
  });
});
