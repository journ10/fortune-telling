import { useState } from 'react';
import type { AiReadingStatus } from '../ai/aiStatus';
import type { AiInterpretation, CastingResult, CoinToss } from '../domain/types';
import HexagramFacts from './HexagramFacts';
import ModalLayer from './ModalLayer';

type ResultTab = 'ai' | 'summary' | 'process' | 'basis';

interface ResultDialogProps {
  aiStatus?: AiReadingStatus | null;
  aiInterpretation: AiInterpretation | null;
  castingResult: CastingResult;
  tosses: CoinToss[];
  onClose: () => void;
  onReset: () => void;
  onRetryAi: () => void;
  onEditAiSettings: () => void;
}

const tabs: Array<{ id: ResultTab; label: string }> = [
  { id: 'ai', label: 'AI 解读' },
  { id: 'summary', label: '原始卦象' },
  { id: 'process', label: '起卦过程' },
  { id: 'basis', label: '传统依据' }
];

function renderAiFallback(aiStatus?: AiReadingStatus | null) {
  const isError = aiStatus?.state === 'error';

  return (
    <section className="readingBlock aiReadingBlock" aria-labelledby="ai-reading-pending-title">
      <h2 id="ai-reading-pending-title">{isError ? 'AI 解卦未生成' : '等待 AI 解卦'}</h2>
      <p>
        {aiStatus?.state === 'loading'
          ? '正在把所问之事、本卦、动爻、变卦与传统依据发送给你配置的 Provider。'
          : '本页只保留卦象事实，不使用本地模板补写解读。'}
      </p>
    </section>
  );
}

function renderAiInterpretation(aiInterpretation: AiInterpretation) {
  return (
    <section className="readingBlock aiReadingBlock" aria-label="AI 解读内容">
      <h2>{aiInterpretation.headline}</h2>
      {aiInterpretation.plainText.split('\n').map((paragraph, index) => (
        <p key={`${index}-${paragraph}`}>{paragraph}</p>
      ))}
      <h3>行动建议</h3>
      <ul>
        {aiInterpretation.advice.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function ResultDialog({
  aiStatus,
  aiInterpretation,
  castingResult,
  tosses,
  onClose,
  onReset,
  onRetryAi,
  onEditAiSettings
}: ResultDialogProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>('ai');
  const hasAiError = aiStatus?.state === 'error';

  return (
    <ModalLayer
      title="AI 解读"
      onClose={onClose}
      className="resultModal"
      footer={
        <>
          <button className="secondaryButton" type="button" onClick={onReset}>
            重新起卦
          </button>
          {hasAiError ? (
            <>
              <button className="secondaryButton" type="button" onClick={onEditAiSettings}>
                修改 AI 配置
              </button>
              <button className="primaryButton" type="button" onClick={onRetryAi}>
                重试 AI 解读
              </button>
            </>
          ) : null}
        </>
      }
    >
      {aiStatus ? <p className={`aiStatus aiStatus-${aiStatus.state}`}>{aiStatus.message}</p> : null}

      <div className="resultTabs" role="tablist" aria-label="结果视图">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'activeTab' : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="resultTabPanel">
        {activeTab === 'ai'
          ? aiInterpretation
            ? renderAiInterpretation(aiInterpretation)
            : renderAiFallback(aiStatus)
          : null}
        {activeTab === 'summary' ? (
          <HexagramFacts castingResult={castingResult} tosses={tosses} view="summary" />
        ) : null}
        {activeTab === 'process' ? (
          <HexagramFacts castingResult={castingResult} tosses={tosses} view="process" />
        ) : null}
        {activeTab === 'basis' ? (
          <HexagramFacts castingResult={castingResult} tosses={tosses} view="basis" />
        ) : null}
      </div>
    </ModalLayer>
  );
}

export default ResultDialog;
