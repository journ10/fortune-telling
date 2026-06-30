import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App', () => {
  beforeEach(() => {
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
  });

  it('requires AI settings before casting starts', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(<App />);

    await user.click(screen.getByRole('button', { name: '最近事业' }));
    expect(screen.getByRole('textbox', { name: '所问之事' })).toHaveValue('最近事业怎么推进？');

    await user.click(screen.getByRole('button', { name: '今日运势' }));
    expect(screen.getByRole('button', { name: '配置 AI 后起卦' })).toBeDisabled();
    expect(screen.getByText(/AI 解卦为必填/)).toBeInTheDocument();

    expect(screen.queryByText(/MediaPipe CDN/)).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
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
    await user.clear(screen.getByLabelText('API URL'));
    await user.type(screen.getByLabelText('API URL'), 'https://gateway.example/openai/chat/completions');
    await user.type(screen.getByLabelText('API Key'), 'sk-user');
    await user.clear(screen.getByLabelText('模型'));
    await user.type(screen.getByLabelText('模型'), 'gpt-4o-mini');
    await user.click(screen.getByRole('button', { name: '今日运势' }));
    await user.click(screen.getByRole('button', { name: '开始起卦' }));

    for (let index = 0; index < 6; index += 1) {
      await user.click(screen.getByRole('button', { name: '手动掷一次' }));
    }

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
    await user.type(screen.getByLabelText('API Key'), 'sk-ant-user');
    await user.click(screen.getByRole('button', { name: '今日运势' }));
    await user.click(screen.getByRole('button', { name: '开始起卦' }));

    for (let index = 0; index < 6; index += 1) {
      await user.click(screen.getByRole('button', { name: '手动掷一次' }));
    }

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
    await user.type(screen.getByLabelText('API Key'), 'sk-deepseek-user');
    await user.click(screen.getByRole('button', { name: '今日运势' }));
    await user.click(screen.getByRole('button', { name: '开始起卦' }));

    for (let index = 0; index < 6; index += 1) {
      await user.click(screen.getByRole('button', { name: '手动掷一次' }));
    }

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

    await user.type(screen.getByLabelText('API Key'), 'sk-user');
    await user.click(screen.getByRole('button', { name: '今日运势' }));
    await user.click(screen.getByRole('button', { name: '开始起卦' }));

    for (let index = 0; index < 6; index += 1) {
      await user.click(screen.getByRole('button', { name: '手动掷一次' }));
    }

    expect(await screen.findByText('AI 解卦失败：model not found')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /卦象结果/ })).toBeInTheDocument();
    expect(screen.getByText('传统依据')).toBeInTheDocument();
    expect(screen.queryByText('白话解读')).not.toBeInTheDocument();
    expect(screen.queryByText('行动建议')).not.toBeInTheDocument();
    expect(screen.queryByText(/已回退/)).not.toBeInTheDocument();
  });
});
