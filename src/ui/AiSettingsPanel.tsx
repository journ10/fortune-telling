// Optional AI settings panel. AI is fully late-bound: this panel is never
// shown unless the user opens it, and casting/results work without it.

import { getDefaultProviderSettings, type AiProvider, type AiSettings } from '../ai/aiSettings';

interface AiSettingsPanelProps {
  aiSettings: AiSettings;
  onAiSettingsChange: (settings: AiSettings) => void;
  onClose: () => void;
}

export default function AiSettingsPanel({
  aiSettings,
  onAiSettingsChange,
  onClose
}: AiSettingsPanelProps) {
  const updateProvider = (provider: AiProvider) => {
    onAiSettingsChange({ ...aiSettings, provider, ...getDefaultProviderSettings(provider) });
  };

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <div
        className="modalCard"
        role="dialog"
        aria-label="AI 设置（可选）"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modalHeader">
          <h2>AI 设置（可选）</h2>
          <button type="button" className="ghostButton" onClick={onClose} aria-label="关闭">
            关闭
          </button>
        </header>
        <p className="mutedText">
          AI 解读为可选项，未配置不影响起卦与传统结果。设置保存在本机浏览器
          localStorage 中；前端直连 AI 服务会暴露 API Key，仅适合个人自用，
          请勿在共享设备上填写。
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
              placeholder="sk-..."
              onChange={(event) => onAiSettingsChange({ ...aiSettings, apiKey: event.target.value })}
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
        <footer className="modalFooter">
          <button type="button" className="primaryButton" onClick={onClose}>
            保存并关闭
          </button>
        </footer>
      </div>
    </div>
  );
}
