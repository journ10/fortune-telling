import { DEFAULT_AI_MODELS, DEFAULT_AI_URLS } from './openaiReading';

export type AiProvider = 'openai' | 'anthropic';

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

export function getDefaultProviderSettings(provider: AiProvider): Pick<AiSettings, 'apiUrl' | 'model'> {
  return {
    apiUrl: DEFAULT_AI_URLS[provider],
    model: DEFAULT_AI_MODELS[provider]
  };
}
