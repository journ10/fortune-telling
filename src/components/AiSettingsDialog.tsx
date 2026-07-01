import { getDefaultProviderSettings, type AiProvider, type AiSettings } from '../ai/aiSettings';
import ModalLayer from './ModalLayer';

interface AiSettingsDialogProps {
  aiSettings: AiSettings;
  isAiConfigured: boolean;
  onAiSettingsChange: (settings: AiSettings) => void;
  onClose?: () => void;
  onSubmit: () => void;
}

export default function AiSettingsDialog({
  aiSettings,
  isAiConfigured,
  onAiSettingsChange,
  onClose,
  onSubmit
}: AiSettingsDialogProps) {
  const updateProvider = (provider: AiProvider) => {
    onAiSettingsChange({
      ...aiSettings,
      provider,
      ...getDefaultProviderSettings(provider)
    });
  };

  return (
    <ModalLayer
      title="AI 配置"
      onClose={onClose}
      footer={
        <button className="primaryButton" type="button" disabled={!isAiConfigured} onClick={onSubmit}>
          保存配置
        </button>
      }
    >
      <p className="modalCopy">
        AI 解读为必填。API URL 可以填 base URL 或完整 endpoint；Key 只保存在当前页面状态里。
      </p>

      <div className="formGrid">
        <label className="formField" htmlFor="ai-provider">
          <span>Provider</span>
          <select
            id="ai-provider"
            value={aiSettings.provider}
            onChange={(event) => updateProvider(event.target.value as AiProvider)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </label>

        <label className="formField" htmlFor="ai-api-url">
          <span>API URL</span>
          <input
            autoComplete="off"
            id="ai-api-url"
            spellCheck={false}
            type="url"
            value={aiSettings.apiUrl}
            onChange={(event) => onAiSettingsChange({ ...aiSettings, apiUrl: event.target.value })}
          />
        </label>

        <label className="formField" htmlFor="ai-api-key">
          <span>API Key</span>
          <input
            autoComplete="off"
            id="ai-api-key"
            spellCheck={false}
            type="password"
            value={aiSettings.apiKey}
            onChange={(event) => onAiSettingsChange({ ...aiSettings, apiKey: event.target.value })}
            placeholder="sk-..."
          />
        </label>

        <label className="formField" htmlFor="ai-model">
          <span>模型</span>
          <input
            autoComplete="off"
            id="ai-model"
            spellCheck={false}
            type="text"
            value={aiSettings.model}
            onChange={(event) => onAiSettingsChange({ ...aiSettings, model: event.target.value })}
          />
        </label>
      </div>
    </ModalLayer>
  );
}
