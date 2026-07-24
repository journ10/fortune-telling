// Result drawer: the traditional result is the hero — original hexagram,
// moving lines, changed hexagram, classical basis, then per-line toss
// evidence. AI reading is an optional, fully-late placeholder (M4).

import type { CastingEvidence } from '../casting/evidence';
import type { AiReading, CastingResult, CoinToss } from '../domain/types';
import EvidencePanel from './EvidencePanel';
import HexagramFigure from './HexagramFigure';

/** AI 解读在结果页的呈现状态；传统结果始终完整渲染，与它无关。 */
export type AiReadingStatus =
  | { kind: 'unconfigured' }
  | { kind: 'reading' }
  | { kind: 'ready'; reading: AiReading }
  | { kind: 'error'; message: string };

interface ResultPanelProps {
  result: CastingResult;
  tosses: CoinToss[];
  evidences: CastingEvidence[];
  aiStatus: AiReadingStatus;
  onRetryAi?: () => void;
  onClose: () => void;
  onReset: () => void;
  onOpenAiSettings?: () => void;
}

function AiReadingSection({
  aiStatus,
  onRetryAi,
  onOpenAiSettings
}: {
  aiStatus: AiReadingStatus;
  onRetryAi?: () => void;
  onOpenAiSettings?: () => void;
}) {
  if (aiStatus.kind === 'unconfigured') {
    return (
      <section className="resultSection aiReading" data-testid="ai-unconfigured">
        <h3>AI 解读（可选）</h3>
        <p className="mutedText">
          传统结果已完整可用。如需 AI 白话解读，请先配置 AI 服务。
        </p>
        {onOpenAiSettings ? (
          <button type="button" className="ghostButton" onClick={onOpenAiSettings}>
            配置 AI
          </button>
        ) : null}
      </section>
    );
  }

  if (aiStatus.kind === 'reading') {
    return (
      <section className="resultSection aiReading" data-testid="ai-reading" aria-live="polite">
        <h3>AI 解读</h3>
        <p className="mutedText">AI 解读生成中…传统结果不受影响。</p>
      </section>
    );
  }

  if (aiStatus.kind === 'error') {
    return (
      <section className="resultSection aiReading" data-testid="ai-error" role="alert">
        <h3>AI 解读</h3>
        <p className="mutedText">AI 解读失败：{aiStatus.message}</p>
        <p className="mutedText">传统结果完整保留，可重试或检查 AI 配置。</p>
        <div className="aiErrorActions">
          {onRetryAi ? (
            <button type="button" className="ghostButton" onClick={onRetryAi}>
              重试 AI 解读
            </button>
          ) : null}
          {onOpenAiSettings ? (
            <button type="button" className="ghostButton" onClick={onOpenAiSettings}>
              打开 AI 设置
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="resultSection aiReading" data-testid="ai-ready">
      <details open>
        <summary>
          <h3>AI 解读 · {aiStatus.reading.headline}</h3>
        </summary>
        {aiStatus.reading.plainText.split(/\n+/).map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <h4>建议</h4>
        <ul className="basisList">
          {aiStatus.reading.advice.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export default function ResultPanel({
  result,
  tosses,
  evidences,
  aiStatus,
  onRetryAi,
  onClose,
  onReset,
  onOpenAiSettings
}: ResultPanelProps) {
  const originalLines = tosses.map((toss, index) => ({
    position: index + 1,
    isYang: toss.line.isYang,
    isMoving: toss.line.isMoving
  }));
  const changedLines = tosses.map((toss, index) => ({
    position: index + 1,
    isYang: toss.line.isMoving ? !toss.line.isYang : toss.line.isYang
  }));

  return (
    <aside className="resultPanel" role="dialog" aria-label="起卦结果">
      <header className="resultHeader">
        <div>
          <p className="resultEyebrow">{result.question ? `所问：${result.question}` : '六爻已成'}</p>
          <h2 className="resultTitle">
            {result.originalHexagram.name}
            <span className="resultSubtitle">
              {result.originalHexagram.upperTrigram}上{result.originalHexagram.lowerTrigram}下
            </span>
          </h2>
        </div>
        <button type="button" className="ghostButton" onClick={onClose} aria-label="收起结果">
          收起
        </button>
      </header>

      <div className="resultBody">
        <section className="resultSection resultHero">
          <HexagramFigure lines={originalLines} label="本卦" />
          <div className="resultTexts">
            <p>
              <strong>卦辞</strong>
              {result.originalHexagram.judgment}
            </p>
            <p>
              <strong>象曰</strong>
              {result.originalHexagram.image}
            </p>
          </div>
        </section>

        {result.movingLines.length > 0 ? (
          <section className="resultSection">
            <h3>动爻</h3>
            <ul className="movingLineList">
              {result.movingLines.map((line) => (
                <li key={line.position}>
                  <strong>{line.title}</strong>
                  <span>{line.original}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="resultSection">
            <h3>动爻</h3>
            <p className="mutedText">本卦六爻安静，无动爻。</p>
          </section>
        )}

        {result.changedHexagram ? (
          <section className="resultSection resultChanged">
            <h3>
              变卦 · {result.changedHexagram.name}
              <span className="resultSubtitle">
                {result.changedHexagram.upperTrigram}上{result.changedHexagram.lowerTrigram}下
              </span>
            </h3>
            <HexagramFigure lines={changedLines} label="变卦" />
            <p className="mutedText">{result.changedHexagram.judgment}</p>
          </section>
        ) : null}

        <section className="resultSection">
          <h3>传统依据</h3>
          <ul className="basisList">
            {result.basis.map((basis) => (
              <li key={basis}>{basis}</li>
            ))}
          </ul>
        </section>

        <section className="resultSection">
          <h3>投掷证据</h3>
          <EvidencePanel evidences={evidences} />
        </section>

        <AiReadingSection
          aiStatus={aiStatus}
          onRetryAi={onRetryAi}
          onOpenAiSettings={onOpenAiSettings}
        />
      </div>

      <footer className="resultFooter">
        <button type="button" className="primaryButton" onClick={onReset}>
          重新起卦
        </button>
      </footer>
    </aside>
  );
}
