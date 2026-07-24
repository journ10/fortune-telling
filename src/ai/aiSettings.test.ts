import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AI_SETTINGS,
  hasCompleteAiSettings,
  loadAiSettings,
  saveAiSettings,
  type AiSettings
} from './aiSettings';

const STORAGE_KEY = 'fortune-telling:ai-settings';

const COMPLETE: AiSettings = {
  provider: 'deepseek',
  apiUrl: 'https://api.deepseek.com',
  apiKey: 'sk-test',
  model: 'deepseek-v4-flash'
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('loadAiSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('returns defaults when stored JSON is corrupted', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json');
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('returns defaults when stored value has an invalid shape', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: 'unknown', apiKey: 1 }));
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(['openai']));
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('round-trips saved settings', () => {
    saveAiSettings(COMPLETE);
    expect(loadAiSettings()).toEqual(COMPLETE);
  });
});

describe('saveAiSettings', () => {
  it('silently ignores storage write failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => saveAiSettings(COMPLETE)).not.toThrow();
  });
});

describe('hasCompleteAiSettings', () => {
  it('requires key, url and model to be non-blank', () => {
    expect(hasCompleteAiSettings(COMPLETE)).toBe(true);
    expect(hasCompleteAiSettings({ ...COMPLETE, apiKey: '  ' })).toBe(false);
    expect(hasCompleteAiSettings({ ...COMPLETE, apiUrl: '' })).toBe(false);
    expect(hasCompleteAiSettings({ ...COMPLETE, model: '' })).toBe(false);
    expect(hasCompleteAiSettings(DEFAULT_AI_SETTINGS)).toBe(false);
  });
});
