import { DEFAULT_AI_MODEL } from './openaiReading';

export interface AiSettings {
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  apiKey: '',
  model: DEFAULT_AI_MODEL
};
