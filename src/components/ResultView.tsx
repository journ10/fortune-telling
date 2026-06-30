import type { CoinToss, Interpretation } from '../domain/types';

interface ResultViewProps {
  interpretation: Interpretation;
  tosses: CoinToss[];
  onReset: () => void;
}

export default function ResultView({ interpretation, tosses, onReset }: ResultViewProps) {
  return (
    <section className="resultPanel" aria-labelledby="result-title">
      <p className="eyebrow">卦象结果</p>
      <h1 id="result-title">卦象结果：{interpretation.originalHexagram.name}</h1>
      <p className="questionEcho">{interpretation.question}</p>
      <p className="intro">传统依据：{interpretation.basis.join('；')}</p>
      <p className="intro">共完成 {tosses.length} 次掷钱。</p>
      <button className="primaryButton" type="button" onClick={onReset}>
        重新起卦
      </button>
    </section>
  );
}
