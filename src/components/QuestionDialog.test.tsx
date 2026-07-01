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
