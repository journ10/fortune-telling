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
