import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi } from 'vitest';
import type { AiSettings } from '../ai/aiSettings';
import { DEFAULT_AI_SETTINGS } from '../ai/aiSettings';
import AiSettingsDialog from './AiSettingsDialog';

function Harness({
  initialSettings = DEFAULT_AI_SETTINGS,
  onChange,
  onSubmit = () => undefined
}: {
  initialSettings?: AiSettings;
  onChange: (settings: AiSettings) => void;
  onSubmit?: () => void;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const isConfigured = Boolean(
    settings.apiKey.trim() && settings.apiUrl.trim() && settings.model.trim()
  );

  return (
    <AiSettingsDialog
      aiSettings={settings}
      isAiConfigured={isConfigured}
      onAiSettingsChange={(nextSettings) => {
        setSettings(nextSettings);
        onChange(nextSettings);
      }}
      onSubmit={onSubmit}
    />
  );
}

describe('AiSettingsDialog', () => {
  it('saves complete AI settings from the floating dialog', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(<Harness onChange={onChange} onSubmit={onSubmit} />);

    expect(screen.getByRole('dialog', { name: 'AI 配置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled();

    await user.type(screen.getByLabelText('API Key'), 'sk-user');

    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_AI_SETTINGS,
      apiKey: 'sk-user'
    });
    expect(screen.getByRole('button', { name: '保存配置' })).toBeEnabled();
  });

  it('switches provider defaults inside the dialog', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Harness onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Provider'), 'deepseek');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
        apiUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash'
      })
    );
  });
});
