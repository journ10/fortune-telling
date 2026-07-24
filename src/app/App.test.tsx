// App smoke tests: the first screen is the table with zero config
// blocking, and both pointer and keyboard gestures enter the physical
// toss pipeline. Full flow coverage lives in casting/physics tests.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubCoarsePointerWithMotion(requestPermission?: () => Promise<'granted' | 'denied'>) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  }));
  vi.stubGlobal(
    'DeviceMotionEvent',
    requestPermission ? { requestPermission } : class {}
  );
}

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

  it('does not offer motion toss on desktop pointers', () => {
    render(<App />);

    expect(screen.queryByTestId('motion-panel')).not.toBeInTheDocument();
  });

  it('offers shake casting on touch devices and activates it after permission', async () => {
    const user = userEvent.setup();
    stubCoarsePointerWithMotion(() => Promise.resolve('granted'));
    render(<App />);

    const enable = await screen.findByRole('button', { name: '开启摇晃投掷' });
    await user.click(enable);

    const panel = await screen.findByTestId('motion-panel');
    await waitFor(() => {
      expect(panel).toHaveTextContent('摇晃手机开始，或按住桌面拖动');
    });
    // Touch chamber remains available as a parallel path.
    expect(screen.getByTestId('tabletop-view')).toBeInTheDocument();
  });

  it('keeps the touch path usable when motion permission is denied', async () => {
    const user = userEvent.setup();
    stubCoarsePointerWithMotion(() => Promise.resolve('denied'));
    render(<App />);

    const enable = await screen.findByRole('button', { name: '开启摇晃投掷' });
    await user.click(enable);

    expect(await screen.findByText(/权限未开启，可直接按住桌面拖动抛出/)).toBeInTheDocument();
    // Casting is not blocked: the table and HUD are still there.
    expect(screen.getByText(/第 1 爻/)).toBeInTheDocument();
  });

  it('works on touch devices without motion sensors at all', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));
    vi.stubGlobal('DeviceMotionEvent', undefined);
    render(<App />);

    expect(screen.queryByTestId('motion-panel')).not.toBeInTheDocument();
    await waitForPhysicsReady();
    expect(screen.getByText(/按住桌面摇动铜钱/)).toBeInTheDocument();
  });
});
