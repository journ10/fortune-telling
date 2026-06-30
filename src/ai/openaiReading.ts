import type { CoinToss, Interpretation } from '../domain/types';
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

interface AiReadingPatch {
  headline: string;
  plainText: string;
  advice: string[];
}

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

export async function createAiInterpretation(
  interpretation: Interpretation,
  tosses: readonly CoinToss[],
  options: AiReadingOptions
): Promise<Interpretation> {
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
    buildProviderRequest(provider, apiKey, model, interpretation, tosses, options.signal)
  );

  if (!response.ok) {
    throw new Error(await readProviderError(response));
  }

  const body = await response.json();
  const text = extractResponseText(provider, body);
  const patch = parseAiReadingPatch(text);

  return {
    ...interpretation,
    headline: patch.headline,
    plainText: patch.plainText,
    advice: patch.advice
  };
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
  interpretation: Interpretation,
  tosses: readonly CoinToss[],
  signal?: AbortSignal
): RequestInit {
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
        messages: [
          {
            role: 'user',
            content: JSON.stringify(buildPromptPayload(interpretation, tosses))
          }
        ]
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
        {
          role: 'system',
          content: buildInstructions()
        },
        {
          role: 'user',
          content: JSON.stringify(buildPromptPayload(interpretation, tosses))
        }
      ],
      response_format: { type: 'json_object' }
    })
  };
}

function buildInstructions(): string {
  return [
    '你是一个严谨的《周易》娱乐解读助手。',
    '只能基于用户给定的问题、本卦、动爻、变卦、卦辞、象辞、爻辞和起卦过程进行白话解读。',
    '不得编造或改写经典原文，不得声称结果必然发生，不得提供医疗、法律、投资等高风险确定性建议。',
    '输出中文 JSON，不要 Markdown，不要代码块。',
    'JSON 格式必须为：{"headline": string, "plainText": string, "advice": string[]}。',
    'plainText 用 2 到 4 段话组成，段落之间用换行符。advice 给 3 到 5 条可执行建议。'
  ].join('\n');
}

function buildPromptPayload(interpretation: Interpretation, tosses: readonly CoinToss[]) {
  return {
    question: interpretation.question,
    questionType: interpretation.questionType,
    originalHexagram: {
      name: interpretation.originalHexagram.name,
      judgment: interpretation.originalHexagram.judgment,
      image: interpretation.originalHexagram.image,
      keywords: interpretation.originalHexagram.keywords,
      summary: interpretation.originalHexagram.summary
    },
    movingLines: interpretation.movingLines.map((line) => ({
      title: line.title,
      original: line.original,
      summary: line.summary,
      tags: line.tags
    })),
    changedHexagram: interpretation.changedHexagram
      ? {
          name: interpretation.changedHexagram.name,
          judgment: interpretation.changedHexagram.judgment,
          image: interpretation.changedHexagram.image,
          keywords: interpretation.changedHexagram.keywords,
          summary: interpretation.changedHexagram.summary
        }
      : null,
    traditionalBasis: interpretation.basis,
    tosses: tosses.map((toss, index) => ({
      throw: index + 1,
      faces: toss.faces,
      score: toss.score,
      lineName: toss.line.name
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

function parseAiReadingPatch(text: string): AiReadingPatch {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<AiReadingPatch>;

  if (!parsed.headline || !parsed.plainText || !Array.isArray(parsed.advice)) {
    throw new Error('AI 返回格式不完整');
  }

  return {
    headline: parsed.headline,
    plainText: parsed.plainText,
    advice: parsed.advice.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
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
