// App smoke tests: the first screen is the table with zero config
// blocking, and both pointer and keyboard gestures enter the physical
// toss pipeline. Full flow coverage lives in casting/physics tests.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';

afterEach(() => {
  cleanup();
});

async function waitForPhysicsReady() {
  await waitFor(
    () => {
      expect(screen.queryByText('物理引擎加载中…')).not.toBeInTheDocument();
    },
    { timeout: 15000 }
  );
}

describe('App', () => {
  it('shows the tabletop as the first screen with no config gate', () => {
    render(<App />);

    expect(screen.getByTestId('tabletop-view')).toBeInTheDocument();
    expect(screen.getByText(/第 1 爻/)).toBeInTheDocument();
    // No AI settings dialog, no question wall blocks the table.
    expect(screen.queryByRole('dialog', { name: /AI/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /起卦结果/ })).not.toBeInTheDocument();
  });

  it('lets the user optionally record a question without blocking casting', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '问事（可选）' }));
    const textarea = await screen.findByLabelText(/所问何事/);
    await user.type(textarea, '今年事业如何');
    await user.click(screen.getByRole('button', { name: '记下' }));

    expect(screen.getByRole('button', { name: /所问：今年事业如何/ })).toBeInTheDocument();
    // Table is still fully interactive afterwards.
    expect(screen.getByText(/第 1 爻/)).toBeInTheDocument();
  });

  it('enters the physical toss pipeline from a keyboard hold', async () => {
    render(<App />);
    await waitForPhysicsReady();

    fireEvent.keyDown(window, { key: ' ' });
    expect(await screen.findByText('摇动中…松手掷出')).toBeInTheDocument();

    fireEvent.keyUp(window, { key: ' ' });
    expect(await screen.findByText('铜钱落定中…')).toBeInTheDocument();
  }, 20000);

  it('enters the physical toss pipeline from a pointer press-shake-release', async () => {
    render(<App />);
    await waitForPhysicsReady();

    const view = screen.getByTestId('tabletop-view');
    fireEvent.pointerDown(view, { pointerId: 1, clientX: 300, clientY: 260, button: 0 });
    expect(await screen.findByText('摇动中…松手掷出')).toBeInTheDocument();

    fireEvent.pointerMove(view, { pointerId: 1, clientX: 340, clientY: 230 });
    fireEvent.pointerMove(view, { pointerId: 1, clientX: 290, clientY: 280 });
    fireEvent.pointerUp(view, { pointerId: 1, clientX: 330, clientY: 240 });

    expect(await screen.findByText('铜钱落定中…')).toBeInTheDocument();
  }, 20000);
});
