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
      model: 'gpt-4o-mini',
      fetcher
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
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

  it('rejects empty user keys before sending a request', async () => {
    const { interpretation, tosses } = makeInterpretation();
    const fetcher = vi.fn();

    await expect(
      createAiInterpretation(interpretation, tosses, {
        apiKey: '   ',
        model: 'gpt-4o-mini',
        fetcher
      })
    ).rejects.toThrow('缺少 OpenAI API Key');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
