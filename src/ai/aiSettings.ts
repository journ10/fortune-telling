import { DEFAULT_AI_MODELS, DEFAULT_AI_URLS } from './openaiReading';

export type AiProvider = 'openai' | 'anthropic' | 'deepseek';

export interface AiSettings {
  provider: AiProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'openai',
  apiUrl: DEFAULT_AI_URLS.openai,
  apiKey: '',
  model: DEFAULT_AI_MODELS.openai
};

const STORAGE_KEY = 'fortune-telling:ai-settings';
const PROVIDERS: readonly AiProvider[] = ['openai', 'anthropic', 'deepseek'];

export function getDefaultProviderSettings(provider: AiProvider): Pick<AiSettings, 'apiUrl' | 'model'> {
  return {
    apiUrl: DEFAULT_AI_URLS[provider],
    model: DEFAULT_AI_MODELS[provider]
  };
}

export function hasCompleteAiSettings(settings: AiSettings): boolean {
  return Boolean(settings.apiKey.trim() && settings.apiUrl.trim() && settings.model.trim());
}

function isAiSettings(value: unknown): value is AiSettings {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    PROVIDERS.includes(candidate.provider as AiProvider) &&
    typeof candidate.apiUrl === 'string' &&
    typeof candidate.apiKey === 'string' &&
    typeof candidate.model === 'string'
  );
}

/** 读取持久化的 AI 设置；损坏或缺失时回落到默认值。 */
export function loadAiSettings(): AiSettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);

    if (!raw) {
      return DEFAULT_AI_SETTINGS;
    }

    const parsed: unknown = JSON.parse(raw);

    return isAiSettings(parsed) ? parsed : DEFAULT_AI_SETTINGS;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

/** 持久化 AI 设置到 localStorage（仅存本机浏览器）。 */
export function saveAiSettings(settings: AiSettings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式等场景下写入失败：静默降级为仅会话内有效。
  }
}
