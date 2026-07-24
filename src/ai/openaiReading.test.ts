import { describe, expect, it, vi } from 'vitest';
import { buildCasting, createCoinToss } from '../domain/coinToss';
import { createCastingResult } from '../domain/interpretation';
import type { CoinFace } from '../domain/types';
import type { PhysicalTossInput } from '../physics/physicalTossInput';
import type { SettledToss } from '../physics/tossSimulation';
import { createCastingEvidence, type CastingEvidence } from '../casting/evidence';
import {
  buildAiPromptPayload,
  createAiReading,
  parseAiReading,
  type AiReadingRequest
} from './openaiReading';

const FACES: Array<[CoinFace, CoinFace, CoinFace]> = [
  ['heads', 'tails', 'tails'],
  ['heads', 'tails', 'tails'],
  ['heads', 'heads', 'heads'],
  ['heads', 'tails', 'tails'],
  ['heads', 'tails', 'tails'],
  ['heads', 'heads', 'tails']
];

function fakeInput(throwIndex: number): PhysicalTossInput {
  return {
    source: 'pointer',
    currentThrow: throwIndex,
    coins: [0, 1, 2].map((slot) => ({
      position: [slot, 1, 0],
      rotation: [0, 0, 0, 1],
      linearVelocity: [0, 1, 0],
      angularVelocity: [1, 0, 0]
    })) as PhysicalTossInput['coins'],
    energy: 0.4 + throwIndex * 0.05,
    durationMs: 200,
    perturbationSeed: 1000 + throwIndex,
    perturbationScale: 0.05
  };
}

function makeRequest(): AiReadingRequest {
  const casting = buildCasting('今日运势', 'general', FACES.map((faces) => createCoinToss(faces)));
  const evidences: CastingEvidence[] = FACES.map((faces, index) => {
    const settled: SettledToss = {
      faces,
      settledReason: index === 5 ? 'timeout-readable' : 'strict',
      settledTimeMs: 1800 + index
    };
    return createCastingEvidence(index + 1, fakeInput(index + 1), settled);
  });

  return { result: createCastingResult(casting), evidences };
}

function okFetcher(content: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }]
    }),
    text: async () => ''
  }));
}

const VALID_READING = {
  headline: 'AI：夬卦重在明断',
  plainText: '问题到了需要表态的时候。\n动爻提示先稳住表达方式。',
  advice: ['先确认边界', '避免情绪化推进', '保留复盘时间']
};

describe('createAiReading', () => {
  it('requests an OpenAI-compatible reading and returns only the AI contract fields', async () => {
    const request = makeRequest();
    const fetchCalls: Array<[RequestInfo | URL, RequestInit?]> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push([input, init]);
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(VALID_READING) } }] }),
        text: async () => ''
      };
    });

    const reading = await createAiReading(request, {
      provider: 'openai',
      apiKey: 'sk-user',
      apiUrl: 'https://gateway.example/openai/chat/completions',
      model: 'gpt-4o-mini',
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
    const body = JSON.parse(fetchCalls[0][1]?.body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toEqual([
      expect.objectContaining({ role: 'system', content: expect.stringContaining('周易') }),
      expect.objectContaining({ role: 'user', content: expect.stringContaining('今日运势') })
    ]);

    expect(reading).toEqual({
      headline: 'AI：夬卦重在明断',
      plainText: '问题到了需要表态的时候。\n动爻提示先稳住表达方式。',
      advice: ['先确认边界', '避免情绪化推进', '保留复盘时间']
    });
    // AI 契约不含任何传统结果字段。
    expect('originalHexagram' in reading).toBe(false);
    expect('basis' in reading).toBe(false);
  });

  it('requests an Anthropic Messages reading with provider headers', async () => {
    const request = makeRequest();
    const fetchCalls: Array<[RequestInfo | URL, RequestInit?]> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push([input, init]);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: JSON.stringify(VALID_READING) }]
        }),
        text: async () => ''
      };
    });

    const reading = await createAiReading(request, {
      provider: 'anthropic',
      apiKey: 'sk-ant-user',
      apiUrl: 'https://gateway.example/anthropic/v1/messages',
      model: 'claude-sonnet-4-6',
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
    const body = JSON.parse(fetchCalls[0][1]?.body as string);
    expect(body.max_tokens).toBe(1200);
    expect(body.system).toContain('周易');
    expect(reading.headline).toBe('AI：夬卦重在明断');
  });

  it('normalizes base URLs per provider', async () => {
    const request = makeRequest();

    const openAiFetch = okFetcher(VALID_READING);
    await createAiReading(request, {
      provider: 'openai',
      apiKey: 'sk',
      apiUrl: 'https://api.openai.com',
      model: 'gpt-4o-mini',
      fetcher: openAiFetch
    });
    expect(openAiFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.any(Object)
    );

    const anthropicFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: JSON.stringify(VALID_READING) }] }),
      text: async () => ''
    }));
    await createAiReading(request, {
      provider: 'anthropic',
      apiKey: 'sk',
      apiUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-6',
      fetcher: anthropicFetch
    });
    expect(anthropicFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.any(Object)
    );

    const deepseekFetch = okFetcher(VALID_READING);
    await createAiReading(request, {
      provider: 'deepseek',
      apiKey: 'sk',
      apiUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      fetcher: deepseekFetch
    });
    expect(deepseekFetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.any(Object)
    );
  });

  it('rejects empty API keys before sending any request', async () => {
    const fetcher = vi.fn();

    await expect(
      createAiReading(makeRequest(), {
        provider: 'openai',
        apiKey: '   ',
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        fetcher
      })
    ).rejects.toThrow('缺少 AI API Key');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces provider error text for non-OK responses', async () => {
    const fetcher = vi.fn(async () => new Response('proxy upstream denied', { status: 502 }));

    await expect(
      createAiReading(makeRequest(), {
        provider: 'openai',
        apiKey: 'sk-user',
        apiUrl: 'https://gateway.example/openai/chat/completions',
        model: 'gpt-4o-mini',
        fetcher
      })
    ).rejects.toThrow('proxy upstream denied');
  });

  it('surfaces provider JSON error messages', async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => JSON.stringify({ error: { message: 'Invalid API key' } })
    }));

    await expect(
      createAiReading(makeRequest(), {
        provider: 'openai',
        apiKey: 'sk-bad',
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        fetcher
      })
    ).rejects.toThrow('Invalid API key');
  });

  it('passes the abort signal through to the fetcher', async () => {
    const controller = new AbortController();
    let seenSignal: AbortSignal | null | undefined;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenSignal = init?.signal;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(VALID_READING) } }] }),
        text: async () => ''
      };
    });

    await createAiReading(makeRequest(), {
      provider: 'openai',
      apiKey: 'sk-user',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      signal: controller.signal,
      fetcher
    });

    expect(seenSignal).toBe(controller.signal);
  });

  it('propagates fetcher abort rejections to the caller', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => {
      controller.abort();
      throw new DOMException('The operation was aborted.', 'AbortError');
    });

    await expect(
      createAiReading(makeRequest(), {
        provider: 'openai',
        apiKey: 'sk-user',
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        signal: controller.signal,
        fetcher
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('buildAiPromptPayload', () => {
  it('includes question, hexagrams, moving lines, traditional basis and per-toss evidence', () => {
    const request = makeRequest();
    const payload = buildAiPromptPayload(request);

    expect(payload.question).toBe('今日运势');
    expect(payload.questionType).toBe('general');
    expect(payload.originalHexagram.name).toBe(request.result.originalHexagram.name);
    expect(payload.originalHexagram.judgment).toBe(request.result.originalHexagram.judgment);
    expect(payload.traditionalBasis).toEqual(request.result.basis);

    // 第 3 爻全 heads = 老阳（动）→ 有动爻与变卦。
    expect(payload.movingLines.length).toBeGreaterThan(0);
    expect(payload.movingLines[0]).toEqual(
      expect.objectContaining({
        position: expect.any(Number),
        title: expect.any(String),
        original: expect.any(String)
      })
    );
    expect(payload.changedHexagram?.name).toBe(request.result.changedHexagram?.name);

    expect(payload.tosses).toHaveLength(6);
    expect(payload.tosses[0]).toEqual({
      throw: 1,
      faces: FACES[0],
      score: request.evidences[0].score,
      lineName: request.evidences[0].lineName,
      isMoving: request.evidences[0].isMoving,
      input: {
        source: 'pointer',
        energy: request.evidences[0].inputSummary.energy,
        durationMs: 200
      },
      settlement: { reason: '自然静止', timeMs: 1800 }
    });
    expect(payload.tosses[5].settlement.reason).toBe('超时判读（物理朝向）');
  });
});

describe('parseAiReading', () => {
  it('parses a valid JSON reading', () => {
    expect(parseAiReading(JSON.stringify(VALID_READING))).toEqual(VALID_READING);
  });

  it('strips Markdown code fences before parsing', () => {
    expect(parseAiReading(`\`\`\`json\n${JSON.stringify(VALID_READING)}\n\`\`\``)).toEqual(
      VALID_READING
    );
  });

  it('rejects non-JSON content', () => {
    expect(() => parseAiReading('这不是 JSON')).toThrow('AI 返回内容不是有效 JSON');
  });

  it('rejects JSON missing required fields', () => {
    expect(() => parseAiReading(JSON.stringify({ headline: '只有标题' }))).toThrow(
      '缺少：plainText、advice'
    );
    expect(() =>
      parseAiReading(JSON.stringify({ headline: 't', plainText: 'p', advice: 'not-array' }))
    ).toThrow('缺少：advice');
  });

  it('filters empty advice entries', () => {
    const reading = parseAiReading(
      JSON.stringify({ headline: 't', plainText: 'p', advice: ['保留', '', 3, '  '] })
    );
    expect(reading.advice).toEqual(['保留']);
  });
});
