import type { CoinToss, Interpretation } from '../domain/types';

interface ResultViewProps {
  interpretation: Interpretation;
  tosses: CoinToss[];
  onReset: () => void;
}

function formatCoinFaces(toss: CoinToss): string {
  return toss.faces.map((face) => (face === 'heads' ? '正' : '反')).join('、');
}

function formatMovingLines(interpretation: Interpretation): string {
  if (interpretation.movingLines.length === 0) {
    return '无动爻';
  }

  return interpretation.movingLines.map((line) => line.title).join('、');
}

export function ResultView({ interpretation, tosses, onReset }: ResultViewProps) {
  const changedHexagramName = interpretation.changedHexagram?.name ?? '无变卦';

  return (
    <section className="resultPanel" aria-labelledby="result-title">
      <p className="eyebrow">卦象结果</p>
      <h1 id="result-title">卦象结果：{interpretation.originalHexagram.name}</h1>
      <p className="questionEcho">{interpretation.question}</p>

      <section className="readingBlock" aria-label="解读摘要">
        <h2>{interpretation.headline}</h2>
        <dl className="resultFacts">
          <div>
            <dt>本卦</dt>
            <dd>{interpretation.originalHexagram.name}</dd>
          </div>
          <div>
            <dt>变卦</dt>
            <dd>{changedHexagramName}</dd>
          </div>
          <div>
            <dt>动爻</dt>
            <dd>{formatMovingLines(interpretation)}</dd>
          </div>
        </dl>
      </section>

      <section className="readingBlock" aria-labelledby="plain-reading-title">
        <h2 id="plain-reading-title">白话解读</h2>
        {interpretation.plainText.split('\n').map((paragraph, index) => (
          <p key={`${index}-${paragraph}`}>{paragraph}</p>
        ))}
      </section>

      <section className="readingBlock" aria-labelledby="advice-title">
        <h2 id="advice-title">行动建议</h2>
        <ul>
          {interpretation.advice.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="readingBlock" aria-labelledby="basis-title">
        <h2 id="basis-title">传统依据</h2>
        <ul>
          {interpretation.basis.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="readingBlock" aria-labelledby="toss-title">
        <h2 id="toss-title">起卦过程</h2>
        <ol className="tossList">
          {tosses.map((toss, index) => (
            <li key={`${index}-${toss.faces.join('-')}`}>
              第 {index + 1} 掷：{formatCoinFaces(toss)}，总分 {toss.score}
            </li>
          ))}
        </ol>
      </section>

      <button className="primaryButton" type="button" onClick={onReset}>
        重新起卦
      </button>
    </section>
  );
}

export default ResultView;
