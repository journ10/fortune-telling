import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as coinTossModule from './domain/coinToss';
import type { PhysicalTossInput } from './physics/physicalTossInput';

const physicalSimulationMock = vi.hoisted(() => ({
  calls: [] as Array<{
    input: PhysicalTossInput | null | undefined;
    pendingTossKey: string | number | null | undefined;
  }>,
  erroredKeys: new Set<string | number>(),
  mode: 'settle' as 'error' | 'settle',
  reset() {
    this.calls = [];
    this.erroredKeys = new Set();
    this.mode = 'settle';
  }
}));

vi.mock('./components/GestureControl', () => ({
  default: ({
    isCasting,
    onUseTabletopToss
  }: {
    isCasting: boolean;
    isTossing: boolean;
    onUseTabletopToss: () => void;
  }) =>
    isCasting ? (
      <aside aria-label="手势投掷" role="dialog">
        <button type="button" onClick={onUseTabletopToss}>
          模拟改用桌面投掷
        </button>
      </aside>
    ) : null
}));

vi.mock('./components/MotionTossControl', () => ({
  default: ({
    currentThrow,
    isCasting,
    onMotionDrive,
    onPhysicalTossRequest
  }: {
    currentThrow: number;
    isCasting: boolean;
    isTossing: boolean;
    onMotionDrive?: (energy: number) => void;
    onPhysicalTossRequest: (input: PhysicalTossInput) => void;
  }) => {
    const createCoin = (slot: number) => ({
      position: [slot * 0.2, 1 + slot * 0.05, -0.1] as [number, number, number],
      rotation: [0, slot * 0.25, 0, 1] as [number, number, number, number],
      linearVelocity: [0.2 + slot * 0.05, 2.2, -0.4] as [number, number, number],
      angularVelocity: [2.4 + slot, 0.6, 1.1] as [number, number, number]
    });

    return isCasting ? (
      <aside aria-label="体感投掷" role="dialog">
        <button type="button" onClick={() => onMotionDrive?.(0.91)}>
          模拟体感蓄力
        </button>
        <button
          type="button"
          onClick={() =>
            onPhysicalTossRequest({
              source: 'motion',
              currentThrow,
              coins: [createCoin(0), createCoin(1), createCoin(2)],
              energy: 0.91,
              durationMs: 820,
              perturbationSeed: 0x7788,
              perturbationScale: 0.05
            })
          }
        >
          模拟体感释放
        </button>
      </aside>
    ) : null;
  }
}));

vi.mock('./hooks/usePhysicalTossSimulation', async () => {
  const React = await import('react');
  const settleDelayMs = 2220;

  return {
    usePhysicalTossSimulation: ({
      pendingTossKey,
      input,
      onError,
      onSettled
    }: {
      input: PhysicalTossInput | null | undefined;
      onError?: (error: unknown) => void;
      pendingTossKey: string | number | null | undefined;
      onSettled: (faces: ['heads', 'tails', 'heads']) => void;
    }) => {
      const [faces, setFaces] = React.useState<['heads', 'tails', 'heads'] | null>(null);

      React.useEffect(() => {
        physicalSimulationMock.calls.push({ input, pendingTossKey });
      }, [input, pendingTossKey]);

      React.useEffect(() => {
        setFaces(null);

        if (!pendingTossKey) {
          return undefined;
        }

        if (physicalSimulationMock.mode === 'error') {
          if (!physicalSimulationMock.erroredKeys.has(pendingTossKey)) {
            physicalSimulationMock.erroredKeys.add(pendingTossKey);
            onError?.(new Error('mock physics startup failed'));
          }

          return undefined;
        }

        const timeoutId = window.setTimeout(() => {
          const settledFaces: ['heads', 'tails', 'heads'] = ['heads', 'tails', 'heads'];
          setFaces(settledFaces);
          onSettled(settledFaces);
        }, settleDelayMs);

        return () => {
          window.clearTimeout(timeoutId);
        };
      }, [onError, onSettled, pendingTossKey]);

      return faces
        ? {
            coins: [],
            elapsed: settleDelayMs / 1000,
            faces,
            phase: 'settled',
            settled: true,
            settledReason: 'strict'
          }
        : null;
    }
  };
});

const SIMULATED_PHYSICS_SETTLE_MS = 2220;
const READY_TOSS_BUTTON_NAME = '拖动铜钱，松手掷出';

async function advanceTossSettlement() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SIMULATED_PHYSICS_SETTLE_MS);
  });
}

async function saveAiSettings(
  user: ReturnType<typeof userEvent.setup>,
  {
    provider,
    apiUrl,
    apiKey = 'sk-user',
    model
  }: {
    provider?: 'openai' | 'anthropic' | 'deepseek';
    apiUrl?: string;
    apiKey?: string;
    model?: string;
  } = {}
) {
  if (provider) {
    await user.selectOptions(screen.getByLabelText('Provider'), provider);
  }

  if (apiUrl !== undefined) {
    await user.clear(screen.getByLabelText('API URL'));
    await user.type(screen.getByLabelText('API URL'), apiUrl);
  }

  await user.clear(screen.getByLabelText('API Key'));
  await user.type(screen.getByLabelText('API Key'), apiKey);

  if (model !== undefined) {
    await user.clear(screen.getByLabelText('模型'));
    await user.type(screen.getByLabelText('模型'), model);
  }

  await user.click(screen.getByRole('button', { name: '保存配置' }));
}

async function startCastingWithDefaultQuestion(user: ReturnType<typeof userEvent.setup>) {
  expect(await screen.findByRole('dialog', { name: '所问之事' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '今日运势' }));
  expect(screen.getByRole('textbox', { name: '所问之事' })).toHaveValue('今日运势');

  await user.click(screen.getByRole('button', { name: '开始起卦' }));
}

function getRequestedPhysicalInputs(): PhysicalTossInput[] {
  return physicalSimulationMock.calls
    .map((call) => call.input)
    .filter((input): input is PhysicalTossInput => Boolean(input));
}

async function settleOneToss() {
  const tossButton = screen.getByRole('button', { name: READY_TOSS_BUTTON_NAME });

  fireEvent.pointerDown(tossButton, { clientX: 220, clientY: 260 });
  fireEvent.pointerMove(tossButton, { clientX: 300, clientY: 210 });
  fireEvent.pointerUp(tossButton, { clientX: 370, clientY: 170 });

  expect(screen.getByRole('button', { name: '投掷落定中' })).toBeDisabled();
  await advanceTossSettlement();
  expect(screen.getByRole('button', { name: READY_TOSS_BUTTON_NAME })).toBeEnabled();
}

async function settleSixTosses() {
  vi.useFakeTimers();

  for (let index = 0; index < 5; index += 1) {
    await settleOneToss();
  }

  const tossButton = screen.getByRole('button', { name: READY_TOSS_BUTTON_NAME });
  fireEvent.pointerDown(tossButton, { clientX: 220, clientY: 260 });
  fireEvent.pointerMove(tossButton, { clientX: 300, clientY: 210 });
  fireEvent.pointerUp(tossButton, { clientX: 370, clientY: 170 });

  expect(screen.getByRole('button', { name: '投掷落定中' })).toBeDisabled();
  await advanceTossSettlement();
  expect(screen.getByRole('button', { name: '查看结果' })).toBeEnabled();

  vi.useRealTimers();
}

describe('App', () => {
  beforeEach(() => {
    physicalSimulationMock.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const storage = new Map<string, string>();
    const storageMock = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      })
    };
    vi.stubGlobal('localStorage', storageMock);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storageMock
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens with the AI settings dialog when API settings are missing', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    expect(screen.getByRole('dialog', { name: 'AI 配置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled();
    expect(screen.getByRole('button', { name: READY_TOSS_BUTTON_NAME })).toBeInTheDocument();
    expect(document.querySelector('.tabletopScene')).toBeInTheDocument();
    expect(document.querySelector('.questionPanel')).not.toBeInTheDocument();
    expect(document.querySelector('.resultPanel')).not.toBeInTheDocument();
    expect(document.querySelector('.castingPanel')).not.toBeInTheDocument();
    expect(screen.queryByText('三钱成卦')).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('collects AI settings and question through floating dialogs before tabletop casting', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);

    expect(screen.queryByRole('dialog', { name: '所问之事' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: READY_TOSS_BUTTON_NAME })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('第 1 掷 / 共 6 掷');
    expect(screen.queryByText('AI Provider')).not.toBeInTheDocument();
  });

  it('does not use tossCoins for pointer, motion, or camera-driven casting UI', async () => {
    const user = userEvent.setup();
    const tossCoinsSpy = vi.spyOn(coinTossModule, 'tossCoins');
    vi.stubGlobal('fetch', vi.fn());

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);

    fireEvent.click(screen.getByRole('button', { name: '模拟改用桌面投掷' }));
    expect(tossCoinsSpy).not.toHaveBeenCalled();
    expect(getRequestedPhysicalInputs()).toHaveLength(0);

    const tossButton = screen.getByRole('button', { name: '拖动铜钱，松手掷出' });
    fireEvent.pointerDown(tossButton, { clientX: 200, clientY: 240 });
    fireEvent.pointerMove(tossButton, { clientX: 290, clientY: 210 });
    fireEvent.pointerUp(tossButton, { clientX: 360, clientY: 160 });

    expect(tossCoinsSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '投掷落定中' })).toBeDisabled();
  });

  it('clears a physical toss request when physics startup fails', async () => {
    const user = userEvent.setup();
    const tossCoinsSpy = vi.spyOn(coinTossModule, 'tossCoins');
    physicalSimulationMock.mode = 'error';
    vi.stubGlobal('fetch', vi.fn());

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);

    const tossButton = screen.getByRole('button', { name: READY_TOSS_BUTTON_NAME });
    fireEvent.pointerDown(tossButton, { clientX: 220, clientY: 260 });
    fireEvent.pointerMove(tossButton, { clientX: 300, clientY: 210 });
    fireEvent.pointerUp(tossButton, { clientX: 370, clientY: 170 });

    expect(await screen.findByRole('button', { name: READY_TOSS_BUTTON_NAME })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('第 1 掷 / 共 6 掷');
    expect(tossCoinsSpy).not.toHaveBeenCalled();
  });

  it('uses the camera fallback only to return to tabletop tossing', async () => {
    const user = userEvent.setup();
    const tossCoinsSpy = vi.spyOn(coinTossModule, 'tossCoins');
    vi.stubGlobal('fetch', vi.fn());

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);

    fireEvent.click(screen.getByRole('button', { name: '模拟改用桌面投掷' }));

    expect(getRequestedPhysicalInputs()).toHaveLength(0);
    expect(tossCoinsSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: READY_TOSS_BUTTON_NAME })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('第 1 掷 / 共 6 掷');
  });

  it('maps a motion physical toss request into a physical pending toss', async () => {
    const user = userEvent.setup();
    const tossCoinsSpy = vi.spyOn(coinTossModule, 'tossCoins');
    vi.stubGlobal('DeviceMotionEvent', function DeviceMotionEvent() {});
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        media: '(pointer: coarse)',
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn()
      }))
    });
    vi.stubGlobal('fetch', vi.fn());

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);

    const motionDriveButton = await screen.findByRole('button', { name: '模拟体感蓄力' });
    vi.useFakeTimers();
    fireEvent.click(motionDriveButton);
    fireEvent.click(screen.getByRole('button', { name: '模拟体感释放' }));

    const [input] = getRequestedPhysicalInputs();
    expect(input).toMatchObject({
      currentThrow: 1,
      source: 'motion'
    });
    expect(input.energy).toBeGreaterThan(0.4);
    expect(input.durationMs).toBeGreaterThan(520);
    expect(input.coins).toHaveLength(3);
    expect(new Set(input.coins.map((coin) => coin.position.join(','))).size).toBe(3);
    expect(tossCoinsSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '投掷落定中' })).toBeDisabled();
    await advanceTossSettlement();

    expect(screen.getByRole('status')).toHaveTextContent('第 2 掷 / 共 6 掷');
  });

  it('uses the user provided OpenAI settings for a Chat Completions AI reading', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                headline: 'AI：守正而后动',
                plainText: '这次卦象提示先看清局势，再决定推进节奏。',
                advice: ['先确认目标', '保留余地', '三日后复盘']
              })
            }
          }
        ]
      }),
      text: async () => ''
    }));
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    expect(screen.getByLabelText('Provider')).toHaveValue('openai');
    await saveAiSettings(user, {
      apiUrl: 'https://gateway.example/openai/chat/completions',
      apiKey: 'sk-user',
      model: 'gpt-4o-mini'
    });
    await startCastingWithDefaultQuestion(user);
    await settleSixTosses();

    expect(await screen.findByRole('heading', { name: 'AI：守正而后动' })).toBeInTheDocument();
    expect(screen.getByText(/AI 解卦已生成/)).toBeInTheDocument();
    expect(localStorage.getItem('fortune-telling.aiSettings')).toBeNull();

    expect(fetcher).toHaveBeenCalledWith(
      'https://gateway.example/openai/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-user'
        })
      })
    );
  });

  it('switches provider defaults and sends an Anthropic Messages request', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              headline: 'Claude：变中求稳',
              plainText: '这次解读保留传统依据，只把建议讲得更贴近问题。',
              advice: ['先收束问题', '降低承诺', '复盘再推进']
            })
          }
        ]
      }),
      text: async () => ''
    }));
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    await user.selectOptions(screen.getByLabelText('Provider'), 'anthropic');
    expect(screen.getByLabelText('API URL')).toHaveValue('https://api.anthropic.com/v1/messages');
    expect(screen.getByLabelText('模型')).toHaveValue('claude-sonnet-4-6');
    await saveAiSettings(user, { apiKey: 'sk-ant-user' });
    await startCastingWithDefaultQuestion(user);
    await settleSixTosses();

    expect(await screen.findByRole('heading', { name: 'Claude：变中求稳' })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'anthropic-version': '2023-06-01',
          'x-api-key': 'sk-ant-user'
        })
      })
    );
  });

  it('switches provider defaults and sends a DeepSeek chat request', async () => {
    const user = userEvent.setup();
    const fetchCalls: Array<[RequestInfo | URL, RequestInit?]> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push([input, init]);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  headline: 'DeepSeek：顺势而断',
                  plainText: 'DeepSeek 使用 OpenAI-compatible 格式完成解读。',
                  advice: ['守住问题边界', '看清动爻变化', '再决定下一步']
                })
              }
            }
          ]
        }),
        text: async () => ''
      };
    });
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    await user.selectOptions(screen.getByLabelText('Provider'), 'deepseek');
    expect(screen.getByLabelText('API URL')).toHaveValue('https://api.deepseek.com');
    expect(screen.getByLabelText('模型')).toHaveValue('deepseek-v4-flash');
    await saveAiSettings(user, { apiKey: 'sk-deepseek-user' });
    await startCastingWithDefaultQuestion(user);
    await settleSixTosses();

    expect(await screen.findByRole('heading', { name: 'DeepSeek：顺势而断' })).toBeInTheDocument();
    const request = JSON.parse(fetchCalls[0][1]?.body as string);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-deepseek-user'
        })
      })
    );
    expect(request.messages[0]).toEqual(expect.objectContaining({ role: 'system' }));
  });

  it('does not fall back to a local reading when AI interpretation fails', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => JSON.stringify({ error: { message: 'model not found' } })
    }));
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);
    await settleSixTosses();

    expect(await screen.findByText('AI 解卦失败：model not found')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'AI 解读' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 解卦未生成' })).toBeInTheDocument();
    expect(screen.queryByText('白话解读')).not.toBeInTheDocument();
    expect(screen.queryByText('行动建议')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改 AI 配置' })).toBeInTheDocument();
  });

  it('ignores unsaved incomplete result-time AI settings when restarting from a failed result', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => JSON.stringify({ error: { message: 'model not found' } })
    }));
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);
    await settleSixTosses();
    expect(await screen.findByText('AI 解卦失败：model not found')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '修改 AI 配置' }));
    expect(screen.getByRole('dialog', { name: 'AI 配置' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('API Key'));

    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '关闭' }));

    expect(screen.getByRole('dialog', { name: 'AI 解读' })).toBeInTheDocument();
    expect(screen.getByText('AI 解卦失败：model not found')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '所问之事' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重新起卦' }));

    expect(screen.getByRole('dialog', { name: '所问之事' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'AI 配置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'AI 解读' })).not.toBeInTheDocument();
  });

  it('resets an AI failure and returns to the question dialog without requiring AI settings again', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => JSON.stringify({ error: { message: 'model not found' } })
    }));
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);
    await settleSixTosses();
    expect(await screen.findByText('AI 解卦失败：model not found')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重新起卦' }));

    expect(screen.getByRole('dialog', { name: '所问之事' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'AI 配置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'AI 解读' })).not.toBeInTheDocument();
    expect(screen.queryByText('AI 解卦失败：model not found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: READY_TOSS_BUTTON_NAME })).toBeInTheDocument();
  });

  it('returns to the completed result and retries AI after editing settings from an error', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => JSON.stringify({ error: { message: 'model not found' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  headline: 'AI：重试成功',
                  plainText: '更新配置后，AI 重新生成了解读。',
                  advice: ['确认配置', '保持问题边界', '再行动']
                })
              }
            }
          ]
        }),
        text: async () => ''
      });
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);
    await settleSixTosses();
    expect(await screen.findByText('AI 解卦失败：model not found')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '修改 AI 配置' }));
    expect(screen.getByRole('dialog', { name: 'AI 配置' })).toBeInTheDocument();
    await saveAiSettings(user, { apiKey: 'sk-user-2' });

    expect(screen.queryByRole('dialog', { name: '所问之事' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'AI：重试成功' })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reopens the result dialog from the tabletop after the result dialog closes', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                headline: 'AI：结果可回看',
                plainText: '关闭结果后，桌面上的结果入口仍可再次打开。',
                advice: ['先看结果', '再做记录', '按需重新起卦']
              })
            }
          }
        ]
      }),
      text: async () => ''
    }));
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);
    await settleSixTosses();
    expect(await screen.findByRole('heading', { name: 'AI：结果可回看' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog', { name: 'AI 解读' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看结果' }));
    expect(screen.getByRole('dialog', { name: 'AI 解读' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI：结果可回看' })).toBeInTheDocument();
  });

  it('resets the completed result and returns to the question dialog without requiring AI settings again', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                headline: 'AI：可以重起',
                plainText: '完成一次起卦后，重新起卦会清空旧结果。',
                advice: ['保留配置', '重新提问', '重新投掷']
              })
            }
          }
        ]
      }),
      text: async () => ''
    }));
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    await saveAiSettings(user, { apiKey: 'sk-user' });
    await startCastingWithDefaultQuestion(user);
    await settleSixTosses();
    expect(await screen.findByRole('heading', { name: 'AI：可以重起' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重新起卦' }));

    expect(screen.getByRole('dialog', { name: '所问之事' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'AI 配置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'AI 解读' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'AI：可以重起' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: READY_TOSS_BUTTON_NAME })).toBeInTheDocument();
  });
});
