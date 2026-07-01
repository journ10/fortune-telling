import { buildCasting } from '../domain/coinToss';
import type { CastingResult, CoinToss } from '../domain/types';
import HexagramLines from './HexagramLines';

interface HexagramFactsProps {
  castingResult: CastingResult;
  tosses: CoinToss[];
  view: 'summary' | 'process' | 'basis';
}

function formatCoinFaces(toss: CoinToss): string {
  return toss.faces.map((face) => (face === 'heads' ? '正' : '反')).join('、');
}

function formatMovingLines(castingResult: CastingResult): string {
  if (castingResult.movingLines.length === 0) {
    return '无动爻';
  }

  return castingResult.movingLines.map((line) => line.title).join('、');
}

export default function HexagramFacts({ castingResult, tosses, view }: HexagramFactsProps) {
  if (view === 'process') {
    return (
      <ol className="tossList">
        {tosses.map((toss, index) => (
          <li key={`${index}-${toss.faces.join('-')}`}>
            第 {index + 1} 掷：{formatCoinFaces(toss)}，总分 {toss.score}
          </li>
        ))}
      </ol>
    );
  }

  if (view === 'basis') {
    return (
      <ul className="basisList">
        {castingResult.basis.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    );
  }

  const changedHexagramName = castingResult.changedHexagram?.name ?? '无变卦';
  const lines = buildCasting(castingResult.question, castingResult.questionType, tosses).lines;

  return (
    <section className="hexagramFacts" aria-label="原始卦象">
      <dl className="resultFacts">
        <div>
          <dt>所问之事</dt>
          <dd>{castingResult.question}</dd>
        </div>
        <div>
          <dt>本卦</dt>
          <dd>{castingResult.originalHexagram.name}</dd>
        </div>
        <div>
          <dt>变卦</dt>
          <dd>{changedHexagramName}</dd>
        </div>
        <div>
          <dt>动爻</dt>
          <dd>{formatMovingLines(castingResult)}</dd>
        </div>
      </dl>
      <HexagramLines lines={lines} />
    </section>
  );
}
