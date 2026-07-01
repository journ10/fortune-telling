import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi } from 'vitest';
import ModalLayer from './ModalLayer';

function RestoringFocusHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open dialog
      </button>
      {isOpen ? (
        <ModalLayer title="Restores focus" onClose={() => setIsOpen(false)}>
          <button type="button">Inside dialog</button>
        </ModalLayer>
      ) : null}
    </>
  );
}

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

  it('uses distinct title labels for multiple dialogs', () => {
    render(
      <>
        <ModalLayer title="AI 配置">
          <p>填写 API 信息</p>
        </ModalLayer>
        <ModalLayer title="所问之事">
          <p>请输入问题</p>
        </ModalLayer>
      </>
    );

    expect(screen.getByRole('dialog', { name: 'AI 配置' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '所问之事' })).toBeInTheDocument();
  });

  it('focuses the first focusable control when it opens', () => {
    render(
      <ModalLayer title="Focusable dialog">
        <button type="button">First action</button>
        <button type="button">Second action</button>
      </ModalLayer>
    );

    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();
  });

  it('focuses the dialog panel when there are no focusable controls', () => {
    render(
      <ModalLayer title="Static dialog">
        <p>No actions here</p>
      </ModalLayer>
    );

    const dialog = screen.getByRole('dialog', { name: 'Static dialog' });

    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(dialog).toHaveFocus();
  });

  it('traps Tab and Shift+Tab inside the modal', async () => {
    const user = userEvent.setup();

    render(
      <>
        <button type="button">Background action</button>
        <ModalLayer title="Trapped dialog" onClose={vi.fn()}>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </ModalLayer>
      </>
    );

    const closeButton = screen.getByRole('button', { name: '关闭' });
    const firstAction = screen.getByRole('button', { name: 'First action' });
    const lastAction = screen.getByRole('button', { name: 'Last action' });

    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastAction).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(firstAction).toHaveFocus();

    await user.tab();
    expect(lastAction).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Background action' })).not.toHaveFocus();
  });

  it('closes with Escape only when a close handler is provided', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <ModalLayer title="Closable dialog" onClose={onClose}>
        <button type="button">Inside dialog</button>
      </ModalLayer>
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <ModalLayer title="Blocking dialog">
        <button type="button">Inside dialog</button>
      </ModalLayer>
    );

    await user.keyboard('{Escape}');

    expect(screen.getByRole('dialog', { name: 'Blocking dialog' })).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the previously focused element when it closes', async () => {
    const user = userEvent.setup();

    render(<RestoringFocusHarness />);

    const opener = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(opener);

    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Restores focus' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
