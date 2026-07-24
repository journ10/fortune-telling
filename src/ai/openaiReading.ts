// AI 解读请求层（OpenAI-compatible）。
//
// AI 完全后置：本模块只消费已成卦的 CastingResult 与六次投掷证据，
// 起卦链路不知道它的存在。返回格式 { headline, plainText, advice[] }
// 经过严格 JSON 校验；任何失败都抛错给调用方，由 UI 保留传统结果。

import type { CastingEvidence } from '../casting/evidence';
import type { AiReading, CastingResult } from '../domain/types';
import type { AiProvider } from './aiSettings';

export const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  openai: 'gpt-5.5',
  anthropic: 'claude-sonnet-4-6',
  deepseek: 'deepseek-v4-flash'
};

export const DEFAULT_AI_URLS: Record<AiProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  deepseek: 'https://api.deepseek.com'
};

export interface AiReadingRequest {
  result: CastingResult;
  evidences: readonly CastingEvidence[];
}

interface AiReadingOptions {
  provider: AiProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
  fetcher?: OpenAiFetch;
}

type OpenAiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, 'ok' | 'status' | 'json' | 'text'>>;

interface OpenAiChatCompletionBody {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface AnthropicMessagesBody {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

export async function createAiReading(
  request: AiReadingRequest,
  options: AiReadingOptions
): Promise<AiReading> {
  const provider = options.provider;
  const apiKey = options.apiKey.trim();
  const model = options.model.trim() || DEFAULT_AI_MODELS[provider];
  const apiUrl = normalizeApiUrl(provider, options.apiUrl.trim() || DEFAULT_AI_URLS[provider]);

  if (!apiKey) {
    throw new Error('缺少 AI API Key');
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(
    apiUrl,
    buildProviderRequest(provider, apiKey, model, request, options.signal)
  );

  if (!response.ok) {
    throw new Error(await readProviderError(response));
  }

  const body = await response.json();
  const text = extractResponseText(provider, body);

  return parseAiReading(text);
}

function normalizeApiUrl(provider: AiProvider, rawUrl: string): string {
  const url = rawUrl.replace(/\/+$/, '');

  if (provider === 'anthropic') {
    if (url.endsWith('/messages')) {
      return url;
    }

    if (url.endsWith('/v1')) {
      return `${url}/messages`;
    }

    return `${url}/v1/messages`;
  }

  if (provider === 'deepseek') {
    if (url.endsWith('/chat/completions')) {
      return url;
    }

    return `${url}/chat/completions`;
  }

  if (url.endsWith('/chat/completions')) {
    return url;
  }

  if (url.endsWith('/v1')) {
    return `${url}/chat/completions`;
  }

  return `${url}/v1/chat/completions`;
}

function buildProviderRequest(
  provider: AiProvider,
  apiKey: string,
  model: string,
  request: AiReadingRequest,
  signal?: AbortSignal
): RequestInit {
  const payload = JSON.stringify(buildAiPromptPayload(request));

  if (provider === 'anthropic') {
    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey
      },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system: buildInstructions(),
        messages: [{ role: 'user', content: payload }]
      })
    };
  }

  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildInstructions() },
        { role: 'user', content: payload }
      ],
      response_format: { type: 'json_object' }
    })
  };
}

function buildInstructions(): string {
  return [
    '你是一个严谨的《周易》娱乐解读助手。',
    '只基于用户给定的问题、六次投掷记录、本卦、动爻、变卦、卦辞、象辞、爻辞与传统依据进行白话解读。',
    '不得编造或改写经典原文，引用卦辞爻辞时必须保持原文。',
    '不得声称结果必然发生，不提供医疗、法律、投资等高风险确定性建议。',
    '不回答与本次起卦无关的请求。',
    '输出中文 JSON，不要 Markdown，不要代码块。',
    'JSON 格式必须为：{"headline": string, "plainText": string, "advice": string[]}。',
    'plainText 用 2 到 4 段话组成，段落之间用换行符。advice 给 3 到 5 条可执行建议。'
  ].join('\n');
}

const SETTLED_REASON_LABEL: Record<CastingEvidence['settledReason'], string> = {
  strict: '自然静止',
  'timeout-readable': '超时判读（物理朝向）'
};

/** 组装发给 AI 的全部上下文：问题、六次投掷证据、卦象与传统依据。 */
export function buildAiPromptPayload(request: AiReadingRequest) {
  const { result, evidences } = request;

  return {
    question: result.question,
    questionType: result.questionType,
    originalHexagram: {
      name: result.originalHexagram.name,
      judgment: result.originalHexagram.judgment,
      image: result.originalHexagram.image,
      keywords: result.originalHexagram.keywords,
      summary: result.originalHexagram.summary
    },
    movingLines: result.movingLines.map((line) => ({
      position: line.position,
      title: line.title,
      original: line.original,
      summary: line.summary,
      tags: line.tags
    })),
    changedHexagram: result.changedHexagram
      ? {
          name: result.changedHexagram.name,
          judgment: result.changedHexagram.judgment,
          image: result.changedHexagram.image,
          keywords: result.changedHexagram.keywords,
          summary: result.changedHexagram.summary
        }
      : null,
    traditionalBasis: result.basis,
    tosses: evidences.map((evidence) => ({
      throw: evidence.throwIndex,
      faces: evidence.faces,
      score: evidence.score,
      lineName: evidence.lineName,
      isMoving: evidence.isMoving,
      input: {
        source: evidence.inputSource,
        energy: evidence.inputSummary.energy,
        durationMs: evidence.inputSummary.durationMs
      },
      settlement: {
        reason: SETTLED_REASON_LABEL[evidence.settledReason],
        timeMs: evidence.settledTimeMs
      }
    }))
  };
}

function extractResponseText(provider: AiProvider, body: unknown): string {
  if (provider === 'anthropic') {
    const anthropicBody = body as AnthropicMessagesBody;
    const text = anthropicBody.content
      ?.filter((content) => content.type === 'text' && content.text)
      .map((content) => content.text)
      .join('\n');

    if (text?.trim()) {
      return text;
    }

    throw new Error('AI 没有返回可读取的文本');
  }

  const openAiBody = body as OpenAiChatCompletionBody;
  const text = openAiBody.choices?.[0]?.message?.content;
  if (text?.trim()) {
    return text;
  }
  throw new Error('AI 没有返回可读取的文本');
}

/** 严格校验 AI 输出；任何格式问题都抛出可展示的原因。 */
export function parseAiReading(text: string): AiReading {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  let parsed: Partial<AiReading>;

  try {
    parsed = JSON.parse(cleaned) as Partial<AiReading>;
  } catch {
    throw new Error('AI 返回内容不是有效 JSON');
  }

  const missing: string[] = [];
  if (typeof parsed.headline !== 'string' || !parsed.headline.trim()) {
    missing.push('headline');
  }
  if (typeof parsed.plainText !== 'string' || !parsed.plainText.trim()) {
    missing.push('plainText');
  }
  if (!Array.isArray(parsed.advice)) {
    missing.push('advice');
  }

  if (missing.length > 0) {
    throw new Error(`AI 返回格式不完整，缺少：${missing.join('、')}`);
  }

  return {
    headline: (parsed.headline as string).trim(),
    plainText: (parsed.plainText as string).trim(),
    advice: (parsed.advice as unknown[]).filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0
    )
  };
}

async function readProviderError(response: Pick<Response, 'status' | 'text'>): Promise<string> {
  try {
    const text = await response.text();
    if (!text.trim()) {
      return `AI 请求失败，状态码 ${response.status}`;
    }

    try {
      const body = JSON.parse(text) as OpenAiChatCompletionBody | AnthropicMessagesBody;
      return body.error?.message ?? text;
    } catch {
      return text;
    }
  } catch {
    return `AI 请求失败，状态码 ${response.status}`;
  }
}
