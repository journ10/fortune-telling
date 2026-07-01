import { useRef, useState, type KeyboardEvent } from 'react';
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

function getTabId(tab: ResultTab): string {
  return `result-tab-${tab}`;
}

function getPanelId(tab: ResultTab): string {
  return `result-panel-${tab}`;
}

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

function renderTabPanelContent(
  tab: ResultTab,
  aiInterpretation: AiInterpretation | null,
  aiStatus: AiReadingStatus | null | undefined,
  castingResult: CastingResult,
  tosses: CoinToss[]
) {
  if (tab === 'ai') {
    return aiInterpretation ? renderAiInterpretation(aiInterpretation) : renderAiFallback(aiStatus);
  }

  if (tab === 'summary') {
    return <HexagramFacts castingResult={castingResult} tosses={tosses} view="summary" />;
  }

  if (tab === 'process') {
    return <HexagramFacts castingResult={castingResult} tosses={tosses} view="process" />;
  }

  return <HexagramFacts castingResult={castingResult} tosses={tosses} view="basis" />;
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
  const tabRefs = useRef<Record<ResultTab, HTMLButtonElement | null>>({
    ai: null,
    summary: null,
    process: null,
    basis: null
  });
  const hasAiError = aiStatus?.state === 'error';

  const activateTab = (nextTab: ResultTab, shouldFocus = false) => {
    setActiveTab(nextTab);

    if (shouldFocus) {
      tabRefs.current[nextTab]?.focus();
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: ResultTab) => {
    const currentIndex = tabs.findIndex((item) => item.id === tab);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    activateTab(tabs[nextIndex].id, true);
  };

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
            id={getTabId(tab.id)}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={getPanelId(tab.id)}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={activeTab === tab.id ? 'activeTab' : undefined}
            onClick={() => activateTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <section
          key={tab.id}
          id={getPanelId(tab.id)}
          className="resultTabPanel"
          role="tabpanel"
          aria-labelledby={getTabId(tab.id)}
          hidden={activeTab !== tab.id}
        >
          {renderTabPanelContent(tab.id, aiInterpretation, aiStatus, castingResult, tosses)}
        </section>
      ))}
    </ModalLayer>
  );
}

export default ResultDialog;
