import { describe, expect, it, vi } from 'vitest';
import { buildCasting, createCoinToss } from '../domain/coinToss';
import { createInterpretation } from '../domain/interpretation';
import { createAiInterpretation } from './openaiReading';

function makeInterpretation() {
  const casting = buildCasting('今日运势', 'general', [
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'heads', 'heads']),
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'tails', 'tails']),
    createCoinToss(['heads', 'heads', 'tails'])
  ]);

  return {
    tosses: casting.tosses,
    interpretation: createInterpretation(casting)
  };
}

describe('createAiInterpretation', () => {
  it('requests an OpenAI Chat Completions reading and preserves the traditional basis', async () => {
    const { interpretation, tosses } = makeInterpretation();
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
                  headline: 'AI：夬卦重在明断',
                  plainText: '问题到了需要表态的时候。\n动爻提示先稳住表达方式。',
                  advice: ['先确认边界', '避免情绪化推进', '保留复盘时间']
                })
              }
            }
          ]
        }),
        text: async () => ''
      };
    });

    const result = await createAiInterpretation(interpretation, tosses, {
      apiKey: 'sk-user',
      apiUrl: 'https://gateway.example/openai/chat/completions',
      model: 'gpt-4o-mini',
      provider: 'openai',
      fetcher
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://gateway.example/openai/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-user',
          'Content-Type': 'application/json'
        })
      })
    );
    const request = JSON.parse(fetchCalls[0][1]?.body as string);
    expect(request.model).toBe('gpt-4o-mini');
    expect(request.messages).toEqual([
      expect.objectContaining({ role: 'developer', content: expect.stringContaining('周易') }),
      expect.objectContaining({ role: 'user', content: expect.stringContaining('今日运势') })
    ]);
    expect(result.headline).toBe('AI：夬卦重在明断');
    expect(result.plainText).toContain('问题到了需要表态的时候');
    expect(result.advice).toEqual(['先确认边界', '避免情绪化推进', '保留复盘时间']);
    expect(result.originalHexagram).toBe(interpretation.originalHexagram);
    expect(result.changedHexagram).toBe(interpretation.changedHexagram);
    expect(result.movingLines).toBe(interpretation.movingLines);
    expect(result.basis).toBe(interpretation.basis);
  });

  it('requests an Anthropic Messages reading with the selected URL and provider headers', async () => {
    const { interpretation, tosses } = makeInterpretation();
    const fetchCalls: Array<[RequestInfo | URL, RequestInit?]> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push([input, init]);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                headline: 'Claude：以夬为断',
                plainText: '卦象强调先明辨，再行动。',
                advice: ['说清立场', '保留证据', '不急于扩大冲突']
              })
            }
          ]
        }),
        text: async () => ''
      };
    });

    const result = await createAiInterpretation(interpretation, tosses, {
      apiKey: 'sk-ant-user',
      apiUrl: 'https://gateway.example/anthropic/v1/messages',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      fetcher
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://gateway.example/anthropic/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': 'sk-ant-user'
        })
      })
    );
    const request = JSON.parse(fetchCalls[0][1]?.body as string);
    expect(request.model).toBe('claude-sonnet-4-6');
    expect(request.max_tokens).toBe(1200);
    expect(request.system).toContain('周易');
    expect(request.messages).toEqual([
      expect.objectContaining({ role: 'user', content: expect.stringContaining('今日运势') })
    ]);
    expect(result.headline).toBe('Claude：以夬为断');
    expect(result.basis).toBe(interpretation.basis);
  });

  it('rejects empty user keys before sending a request', async () => {
    const { interpretation, tosses } = makeInterpretation();
    const fetcher = vi.fn();

    await expect(
      createAiInterpretation(interpretation, tosses, {
        apiKey: '   ',
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        provider: 'openai',
        fetcher
      })
    ).rejects.toThrow('缺少 AI API Key');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
