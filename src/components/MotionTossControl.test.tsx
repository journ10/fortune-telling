import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MotionTossControl from './MotionTossControl';

type PermissionResponse = 'granted' | 'denied' | 'prompt';

function stubDeviceMotionSupport(requestPermission?: () => Promise<PermissionResponse>) {
  vi.stubGlobal('DeviceMotionEvent', {
    requestPermission
  });
}

function dispatchDeviceMotionSample(
  timestamp: number,
  acceleration: Partial<DeviceMotionEventAcceleration>,
  rotationRate: Partial<DeviceMotionEventRotationRate> = {}
) {
  const event = new Event('devicemotion') as DeviceMotionEvent;

  Object.defineProperty(event, 'timeStamp', { value: timestamp });
  Object.defineProperty(event, 'acceleration', {
    value: {
      x: acceleration.x ?? null,
      y: acceleration.y ?? null,
      z: acceleration.z ?? null
    }
  });
  Object.defineProperty(event, 'accelerationIncludingGravity', {
    value: null
  });
  Object.defineProperty(event, 'rotationRate', {
    value: {
      alpha: rotationRate.alpha ?? null,
      beta: rotationRate.beta ?? null,
      gamma: rotationRate.gamma ?? null
    }
  });

  window.dispatchEvent(event);
}

describe('MotionTossControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows a floating motion enable prompt while casting', () => {
    stubDeviceMotionSupport();

    render(
      <MotionTossControl
        isCasting={true}
        isTossing={false}
        onMotionRelease={vi.fn()}
        onMotionShakeStart={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: '手机体感投掷' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '启用体感投掷' })).toBeInTheDocument();
  });

  it('returns null when casting is not active', () => {
    stubDeviceMotionSupport();

    render(
      <MotionTossControl
        isCasting={false}
        isTossing={false}
        onMotionRelease={vi.fn()}
        onMotionShakeStart={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog', { name: '手机体感投掷' })).not.toBeInTheDocument();
  });

  it('requests iOS motion permission before listening', async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn(async () => 'granted' as const);
    stubDeviceMotionSupport(requestPermission);

    render(
      <MotionTossControl
        isCasting={true}
        isTossing={false}
        onMotionRelease={vi.fn()}
        onMotionShakeStart={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '启用体感投掷' }));

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('status')).toHaveTextContent('体感监听已启用');
  });

  it('listens to devicemotion and releases with a digest after the quiet window', async () => {
    const user = userEvent.setup();
    const onMotionShakeStart = vi.fn();
    const onMotionRelease = vi.fn();
    stubDeviceMotionSupport();

    render(
      <MotionTossControl
        isCasting={true}
        isTossing={false}
        onMotionRelease={onMotionRelease}
        onMotionShakeStart={onMotionShakeStart}
      />
    );

    await user.click(screen.getByRole('button', { name: '启用体感投掷' }));

    act(() => {
      dispatchDeviceMotionSample(0, { x: 18, y: 0, z: 0 }, { alpha: 160 });
    });
    expect(onMotionShakeStart).toHaveBeenCalledTimes(1);

    act(() => {
      dispatchDeviceMotionSample(120, { x: 20, y: 3, z: 0 }, { alpha: 140 });
      dispatchDeviceMotionSample(820, { x: 0, y: 0, z: 0 }, { alpha: 0 });
    });

    await waitFor(() => {
      expect(onMotionRelease).toHaveBeenCalledTimes(1);
    });
    expect(onMotionRelease).toHaveBeenCalledWith(expect.any(Number));
    expect(onMotionRelease.mock.calls[0][0]).toBeGreaterThan(0);
  });

  it('does not start listening when motion permission is denied', async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn(async () => 'denied' as const);
    const onMotionShakeStart = vi.fn();
    stubDeviceMotionSupport(requestPermission);

    render(
      <MotionTossControl
        isCasting={true}
        isTossing={false}
        onMotionRelease={vi.fn()}
        onMotionShakeStart={onMotionShakeStart}
      />
    );

    await user.click(screen.getByRole('button', { name: '启用体感投掷' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('体感权限被拒绝');

    act(() => {
      dispatchDeviceMotionSample(0, { x: 18, y: 0, z: 0 }, { alpha: 160 });
    });

    expect(onMotionShakeStart).not.toHaveBeenCalled();
  });

  it('reports unsupported browsers without adding a motion listener', async () => {
    const user = userEvent.setup();
    const onMotionShakeStart = vi.fn();
    vi.stubGlobal('DeviceMotionEvent', undefined);

    render(
      <MotionTossControl
        isCasting={true}
        isTossing={false}
        onMotionRelease={vi.fn()}
        onMotionShakeStart={onMotionShakeStart}
      />
    );

    await user.click(screen.getByRole('button', { name: '启用体感投掷' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('当前浏览器不支持设备运动事件');

    act(() => {
      dispatchDeviceMotionSample(0, { x: 18, y: 0, z: 0 }, { alpha: 160 });
    });

    expect(onMotionShakeStart).not.toHaveBeenCalled();
  });
});
