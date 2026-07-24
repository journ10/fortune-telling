import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MotionTossPanel from './MotionTossPanel';

afterEach(() => {
  cleanup();
});

describe('MotionTossPanel', () => {
  it('renders nothing when sensors are unsupported (touch chamber already covers it)', () => {
    const { container } = render(
      <MotionTossPanel
        permission="unsupported"
        listening={false}
        charging={false}
        readyToRelease={false}
        chargeEnergy={0}
        onRequestPermission={() => undefined}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers a 44px-friendly enable button in the prompt state', async () => {
    const onRequest = vi.fn();
    render(
      <MotionTossPanel
        permission="prompt"
        listening={false}
        charging={false}
        readyToRelease={false}
        chargeEnergy={0}
        onRequestPermission={onRequest}
      />
    );

    const button = screen.getByRole('button', { name: '开启摇晃投掷' });
    await userEvent.click(button);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('explains the touch fallback when permission is denied', () => {
    render(
      <MotionTossPanel
        permission="denied"
        listening={false}
        charging={false}
        readyToRelease={false}
        chargeEnergy={0}
        onRequestPermission={() => undefined}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(/按住桌面拖动抛出/);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('guides the user to be still once enough shake energy is accumulated', () => {
    render(
      <MotionTossPanel
        permission="granted"
        listening
        charging
        readyToRelease
        chargeEnergy={0.9}
        onRequestPermission={() => undefined}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('静止手机以掷出');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows the waiting state while shaking below release energy', () => {
    render(
      <MotionTossPanel
        permission="granted"
        listening
        charging
        readyToRelease={false}
        chargeEnergy={0.4}
        onRequestPermission={() => undefined}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('摇晃手机蓄势中');
  });
});
