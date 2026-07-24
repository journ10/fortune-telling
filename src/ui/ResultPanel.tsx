// Result drawer: the traditional result is the hero — original hexagram,
// moving lines, changed hexagram, classical basis, then per-line toss
// evidence. AI reading is an optional, fully-late placeholder (M4).

import type { CastingEvidence } from '../casting/evidence';
import type { CastingResult, CoinToss } from '../domain/types';
import EvidencePanel from './EvidencePanel';
import HexagramFigure from './HexagramFigure';

interface ResultPanelProps {
  result: CastingResult;
  tosses: CoinToss[];
  evidences: CastingEvidence[];
  onClose: () => void;
  onReset: () => void;
  onOpenAiSettings?: () => void;
}

export default function ResultPanel({
  result,
  tosses,
  evidences,
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

        <section className="resultSection aiPlaceholder">
          <h3>AI 解读（可选）</h3>
          <p className="mutedText">
            AI 解读将在后续版本接入；传统结果不依赖 AI，已完整可用。
          </p>
          {onOpenAiSettings ? (
            <button type="button" className="ghostButton" onClick={onOpenAiSettings}>
              预先配置 AI
            </button>
          ) : null}
        </section>
      </div>

      <footer className="resultFooter">
        <button type="button" className="primaryButton" onClick={onReset}>
          重新起卦
        </button>
      </footer>
    </aside>
  );
}
