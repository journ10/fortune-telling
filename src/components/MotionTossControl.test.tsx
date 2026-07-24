import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMotionPerturbationSeed } from '../motion/deviceMotionToss';
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
        currentThrow={1}
        isCasting={true}
        isTossing={false}
        onPhysicalTossRequest={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: '手机体感投掷' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '启用体感投掷' })).toBeInTheDocument();
  });

  it('uses crypto entropy for motion perturbation seeds when available', () => {
    const getRandomValues = vi.fn((array: Uint32Array) => {
      array[0] = 0x12345678;
      return array;
    });
    const now = vi.spyOn(performance, 'now').mockReturnValue(0xabcdef);
    vi.stubGlobal('crypto', { getRandomValues });

    expect(createMotionPerturbationSeed()).toBe(0x12345678);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(now).not.toHaveBeenCalled();
  });

  it('returns null when casting is not active', () => {
    stubDeviceMotionSupport();

    render(
      <MotionTossControl
        currentThrow={1}
        isCasting={false}
        isTossing={false}
        onPhysicalTossRequest={vi.fn()}
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
        currentThrow={1}
        isCasting={true}
        isTossing={false}
        onPhysicalTossRequest={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '启用体感投掷' }));

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('status')).toHaveTextContent('体感监听已启用');
  });

  it('listens to devicemotion and releases with a physical toss request after the quiet window', async () => {
    const user = userEvent.setup();
    const onMotionDrive = vi.fn();
    const onPhysicalTossRequest = vi.fn();
    stubDeviceMotionSupport();

    render(
      <MotionTossControl
        currentThrow={1}
        isCasting={true}
        isTossing={false}
        onMotionDrive={onMotionDrive}
        onPhysicalTossRequest={onPhysicalTossRequest}
      />
    );

    await user.click(screen.getByRole('button', { name: '启用体感投掷' }));

    act(() => {
      dispatchDeviceMotionSample(0, { x: 18, y: 0, z: 0 }, { alpha: 160 });
    });
    expect(onMotionDrive).toHaveBeenCalled();

    act(() => {
      dispatchDeviceMotionSample(120, { x: 20, y: 3, z: 0 }, { alpha: 140 });
      dispatchDeviceMotionSample(820, { x: 0, y: 0, z: 0 }, { alpha: 0 });
    });

    await waitFor(() => {
      expect(onPhysicalTossRequest).toHaveBeenCalledTimes(1);
    });
    expect(onPhysicalTossRequest.mock.calls[0][0]).toMatchObject({
      source: 'motion',
      currentThrow: 1,
      durationMs: 820
    });
    expect(onPhysicalTossRequest.mock.calls[0][0].energy).toBeGreaterThan(0);
    expect(onPhysicalTossRequest.mock.calls[0][0].coins).toHaveLength(3);
  });

  it('resets after release so another motion toss can start in the same casting', async () => {
    const user = userEvent.setup();
    const onPhysicalTossRequest = vi.fn();
    stubDeviceMotionSupport();

    const { rerender } = render(
      <MotionTossControl
        currentThrow={1}
        isCasting={true}
        isTossing={false}
        onPhysicalTossRequest={onPhysicalTossRequest}
      />
    );

    await user.click(screen.getByRole('button', { name: '启用体感投掷' }));

    act(() => {
      dispatchDeviceMotionSample(0, { x: 18, y: 0, z: 0 }, { alpha: 160 });
      dispatchDeviceMotionSample(820, { x: 0, y: 0, z: 0 }, { alpha: 0 });
    });

    expect(onPhysicalTossRequest).toHaveBeenCalledTimes(1);

    rerender(
      <MotionTossControl
        currentThrow={2}
        isCasting={true}
        isTossing={false}
        onPhysicalTossRequest={onPhysicalTossRequest}
      />
    );

    act(() => {
      dispatchDeviceMotionSample(1000, { x: 19, y: 0, z: 0 }, { alpha: 170 });
      dispatchDeviceMotionSample(1820, { x: 0, y: 0, z: 0 }, { alpha: 0 });
    });

    expect(onPhysicalTossRequest).toHaveBeenCalledTimes(2);
    expect(onPhysicalTossRequest.mock.calls[1][0]).toMatchObject({
      source: 'motion',
      currentThrow: 2
    });
  });

  it('ignores pending-toss motion without poisoning the next motion toss', async () => {
    const user = userEvent.setup();
    const onPhysicalTossRequest = vi.fn();
    stubDeviceMotionSupport();

    const { rerender } = render(
      <MotionTossControl
        currentThrow={1}
        isCasting={true}
        isTossing={false}
        onPhysicalTossRequest={onPhysicalTossRequest}
      />
    );

    await user.click(screen.getByRole('button', { name: '启用体感投掷' }));

    rerender(
      <MotionTossControl
        currentThrow={1}
        isCasting={true}
        isTossing={true}
        onPhysicalTossRequest={onPhysicalTossRequest}
      />
    );

    act(() => {
      dispatchDeviceMotionSample(0, { x: 18, y: 0, z: 0 }, { alpha: 160 });
      dispatchDeviceMotionSample(820, { x: 0, y: 0, z: 0 }, { alpha: 0 });
    });

    expect(onPhysicalTossRequest).not.toHaveBeenCalled();

    rerender(
      <MotionTossControl
        currentThrow={2}
        isCasting={true}
        isTossing={false}
        onPhysicalTossRequest={onPhysicalTossRequest}
      />
    );

    act(() => {
      dispatchDeviceMotionSample(1000, { x: 19, y: 0, z: 0 }, { alpha: 170 });
      dispatchDeviceMotionSample(1820, { x: 0, y: 0, z: 0 }, { alpha: 0 });
    });

    expect(onPhysicalTossRequest).toHaveBeenCalledTimes(1);
    expect(onPhysicalTossRequest.mock.calls[0][0]).toMatchObject({
      source: 'motion',
      currentThrow: 2
    });
  });

  it('does not start listening when motion permission is denied', async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn(async () => 'denied' as const);
    const onPhysicalTossRequest = vi.fn();
    stubDeviceMotionSupport(requestPermission);

    render(
      <MotionTossControl
        currentThrow={1}
        isCasting={true}
        isTossing={false}
        onPhysicalTossRequest={onPhysicalTossRequest}
      />
    );

    await user.click(screen.getByRole('button', { name: '启用体感投掷' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('体感权限被拒绝');

    act(() => {
      dispatchDeviceMotionSample(0, { x: 18, y: 0, z: 0 }, { alpha: 160 });
    });

    expect(onPhysicalTossRequest).not.toHaveBeenCalled();
  });

  it('reports unsupported browsers without adding a motion listener', async () => {
    const user = userEvent.setup();
    const onPhysicalTossRequest = vi.fn();
    vi.stubGlobal('DeviceMotionEvent', undefined);

    render(
      <MotionTossControl
        currentThrow={1}
        isCasting={true}
        isTossing={false}
        onPhysicalTossRequest={onPhysicalTossRequest}
      />
    );

    await user.click(screen.getByRole('button', { name: '启用体感投掷' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('当前浏览器不支持设备运动事件');

    act(() => {
      dispatchDeviceMotionSample(0, { x: 18, y: 0, z: 0 }, { alpha: 160 });
    });

    expect(onPhysicalTossRequest).not.toHaveBeenCalled();
  });
});
