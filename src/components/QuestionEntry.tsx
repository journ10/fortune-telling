import { useState } from 'react';
import type { AiSettings } from '../ai/aiSettings';
import type { QuestionType } from '../domain/types';

const QUICK_QUESTIONS: Array<{ label: string; question: string; type: QuestionType }> = [
  { label: '今日运势', question: '今日运势', type: 'general' },
  { label: '最近事业', question: '最近事业怎么推进？', type: 'career' },
  { label: '感情走向', question: '这段关系接下来如何相处？', type: 'relationship' },
  { label: '财运机会', question: '最近财运机会是否值得把握？', type: 'wealth' },
  { label: '决定可行', question: '这个决定现在是否可行？', type: 'decision' }
];

interface QuestionEntryProps {
  aiSettings: AiSettings;
  onStart: (question: string, questionType: QuestionType) => void;
  onAiSettingsChange: (settings: AiSettings) => void;
}

export default function QuestionEntry({
  aiSettings,
  onStart,
  onAiSettingsChange
}: QuestionEntryProps) {
  const [question, setQuestion] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('general');
  const trimmedQuestion = question.trim();

  return (
    <section className="questionPanel" aria-labelledby="question-title">
      <p className="eyebrow">摄像头手势六爻</p>
      <h1 id="question-title">三钱成卦</h1>
      <p className="intro">输入所问之事，以六次掷钱完成一卦。</p>

      <div className="quickGrid" aria-label="快速问题">
        {QUICK_QUESTIONS.map((quickQuestion) => (
          <button
            className="quickButton"
            key={quickQuestion.type}
            type="button"
            onClick={() => {
              setQuestion(quickQuestion.question);
              setQuestionType(quickQuestion.type);
            }}
          >
            {quickQuestion.label}
          </button>
        ))}
      </div>

      <label className="questionLabel" htmlFor="question-input">
        所问之事
      </label>
      <textarea
        className="questionInput"
        id="question-input"
        rows={4}
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
          if (questionType !== 'general') {
            setQuestionType('general');
          }
        }}
        placeholder="写下一个清晰、具体的问题"
      />

      <section className="aiSettings" aria-labelledby="ai-settings-title">
        <div>
          <p className="eyebrow">可选 AI 解卦</p>
          <h2 id="ai-settings-title">Chat Completions</h2>
          <p className="aiSettingsCopy">
            使用你自己的 OpenAI API Key。Key 只保存在当前页面状态里，刷新后需要重新输入。
          </p>
        </div>

        <div className="aiSettingsGrid">
          <label className="aiField" htmlFor="openai-api-key">
            <span>OpenAI API Key</span>
            <input
              autoComplete="off"
              id="openai-api-key"
              spellCheck={false}
              type="password"
              value={aiSettings.apiKey}
              onChange={(event) =>
                onAiSettingsChange({
                  ...aiSettings,
                  apiKey: event.target.value
                })
              }
              placeholder="sk-..."
            />
          </label>

          <label className="aiField" htmlFor="openai-model">
            <span>Chat Completions 模型</span>
            <input
              autoComplete="off"
              id="openai-model"
              spellCheck={false}
              type="text"
              value={aiSettings.model}
              onChange={(event) =>
                onAiSettingsChange({
                  ...aiSettings,
                  model: event.target.value
                })
              }
            />
          </label>
        </div>

        {aiSettings.apiKey ? (
          <button
            className="secondaryButton"
            type="button"
            onClick={() =>
              onAiSettingsChange({
                ...aiSettings,
                apiKey: ''
              })
            }
          >
            清除 Key
          </button>
        ) : null}
      </section>

      <button
        className="primaryButton"
        type="button"
        disabled={!trimmedQuestion}
        onClick={() => onStart(trimmedQuestion, questionType)}
      >
        开始起卦
      </button>
    </section>
  );
}
