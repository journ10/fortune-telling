import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMediaPipeRecognizer,
  startCamera,
  stopCamera,
  type RecognizedGesture
} from '../camera/gestureRecognizer';
import GestureControl from './GestureControl';

type MockRecognizer = Awaited<ReturnType<typeof createMediaPipeRecognizer>> & {
  close: ReturnType<typeof vi.fn>;
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

function createMockRecognizer(): MockRecognizer {
  return {
    close: vi.fn(),
    recognizeForVideo: vi.fn(() => ({ gestures: [] }))
  } as unknown as MockRecognizer;
}

vi.mock('../camera/gestureRecognizer', () => ({
  createGestureGate: vi.fn(() => ({
    update: vi.fn((_gesture: RecognizedGesture, _timestamp: number) => false)
  })),
  createMediaPipeRecognizer: vi.fn(async () => ({
    close: vi.fn(),
    recognizeForVideo: vi.fn(() => ({ gestures: [] }))
  })),
  getTopGesture: vi.fn(() => 'None'),
  startCamera: vi.fn(async () => ({ getTracks: () => [] })),
  stopCamera: vi.fn()
}));

describe('GestureControl', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a floating camera enable prompt while casting', () => {
    render(<GestureControl isCasting={true} isTossing={false} onGestureToss={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: '手势投掷' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '启用摄像头' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '手动投掷' })).toBeInTheDocument();
  });

  it('returns null when casting is not active', () => {
    render(<GestureControl isCasting={false} isTossing={false} onGestureToss={vi.fn()} />);

    expect(screen.queryByRole('dialog', { name: '手势投掷' })).not.toBeInTheDocument();
  });

  it('hides the prompt when manual tossing is selected', async () => {
    const user = userEvent.setup();

    render(<GestureControl isCasting={true} isTossing={false} onGestureToss={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '手动投掷' }));

    expect(screen.queryByRole('dialog', { name: '手势投掷' })).not.toBeInTheDocument();
  });

  it('starts the camera and recognizer when enabled', async () => {
    const user = userEvent.setup();

    render(<GestureControl isCasting={true} isTossing={false} onGestureToss={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '启用摄像头' }));

    await waitFor(() => {
      expect(startCamera).toHaveBeenCalledTimes(1);
    });
    expect(createMediaPipeRecognizer).toHaveBeenCalledTimes(1);
    expect(screen.getByText('摄像头已启用')).toBeInTheDocument();
    expect(screen.getByText(/握拳后张开手/)).toBeInTheDocument();
  });

  it('renders an error with retry and manual paths when camera startup fails', async () => {
    const user = userEvent.setup();
    vi.mocked(startCamera).mockRejectedValueOnce(new Error('摄像头权限被拒绝'));

    render(<GestureControl isCasting={true} isTossing={false} onGestureToss={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '启用摄像头' }));

    expect(await screen.findByText('摄像头权限被拒绝')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试摄像头' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '手动投掷' })).toBeInTheDocument();
  });

  it('renders an error and stops the camera when recognizer startup fails', async () => {
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    vi.mocked(startCamera).mockResolvedValueOnce(stream);
    vi.mocked(createMediaPipeRecognizer).mockRejectedValueOnce(new Error('识别模型加载失败'));

    render(<GestureControl isCasting={true} isTossing={false} onGestureToss={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '启用摄像头' }));

    expect(await screen.findByText('识别模型加载失败')).toBeInTheDocument();
    expect(stopCamera).toHaveBeenCalledWith(stream);
    expect(screen.getByRole('button', { name: '重试摄像头' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '手动投掷' })).toBeInTheDocument();
  });

  it('ignores stale camera startup errors after manual dismiss', async () => {
    const user = userEvent.setup();
    const cameraStartup = createDeferred<MediaStream>();
    vi.mocked(startCamera).mockReturnValueOnce(cameraStartup.promise);

    render(<GestureControl isCasting={true} isTossing={false} onGestureToss={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '启用摄像头' }));
    await user.click(screen.getByRole('button', { name: '手动投掷' }));

    expect(screen.queryByRole('dialog', { name: '手势投掷' })).not.toBeInTheDocument();

    await act(async () => {
      cameraStartup.reject(new Error('stale camera failure'));
      await cameraStartup.promise.catch(() => undefined);
    });

    expect(screen.queryByRole('dialog', { name: '手势投掷' })).not.toBeInTheDocument();
    expect(screen.queryByText('stale camera failure')).not.toBeInTheDocument();
  });

  it('does not clean up a newer active session when a stale recognizer resolves', async () => {
    const user = userEvent.setup();
    const firstStream = { getTracks: () => [] } as unknown as MediaStream;
    const secondStream = { getTracks: () => [] } as unknown as MediaStream;
    const firstRecognizerStartup = createDeferred<Awaited<ReturnType<typeof createMediaPipeRecognizer>>>();
    const firstRecognizer = createMockRecognizer();
    const secondRecognizer = createMockRecognizer();
    const onGestureToss = vi.fn();

    vi.mocked(startCamera)
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValueOnce(secondStream);
    vi.mocked(createMediaPipeRecognizer)
      .mockReturnValueOnce(firstRecognizerStartup.promise)
      .mockResolvedValueOnce(secondRecognizer);

    const { rerender } = render(
      <GestureControl isCasting={true} isTossing={false} onGestureToss={onGestureToss} />
    );

    await user.click(screen.getByRole('button', { name: '启用摄像头' }));
    await waitFor(() => {
      expect(createMediaPipeRecognizer).toHaveBeenCalledTimes(1);
    });

    rerender(<GestureControl isCasting={false} isTossing={false} onGestureToss={onGestureToss} />);
    await waitFor(() => {
      expect(stopCamera).toHaveBeenCalledWith(firstStream);
    });

    rerender(<GestureControl isCasting={true} isTossing={false} onGestureToss={onGestureToss} />);
    await user.click(screen.getByRole('button', { name: '启用摄像头' }));

    await waitFor(() => {
      expect(screen.getByText('摄像头已启用')).toBeInTheDocument();
    });

    await act(async () => {
      firstRecognizerStartup.resolve(firstRecognizer);
      await firstRecognizerStartup.promise;
    });

    expect(firstRecognizer.close).toHaveBeenCalledTimes(1);
    expect(secondRecognizer.close).not.toHaveBeenCalled();
    expect(stopCamera).not.toHaveBeenCalledWith(secondStream);
    expect(screen.getByText('摄像头已启用')).toBeInTheDocument();
  });
});
