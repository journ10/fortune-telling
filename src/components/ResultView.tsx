import type { AiReadingStatus } from '../ai/aiStatus';
import { buildCasting } from '../domain/coinToss';
import type { AiInterpretation, CastingResult, CoinToss } from '../domain/types';
import HexagramLines from './HexagramLines';

interface ResultViewProps {
  aiStatus?: AiReadingStatus | null;
  aiInterpretation: AiInterpretation | null;
  castingResult: CastingResult;
  tosses: CoinToss[];
  onReset: () => void;
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

export function ResultView({
  aiStatus,
  aiInterpretation,
  castingResult,
  tosses,
  onReset
}: ResultViewProps) {
  const changedHexagramName = castingResult.changedHexagram?.name ?? '无变卦';
  const lines = buildCasting(castingResult.question, castingResult.questionType, tosses).lines;

  return (
    <section className="resultPanel" aria-labelledby="result-title">
      <p className="eyebrow">卦象结果</p>
      <h1 id="result-title">卦象结果：{castingResult.originalHexagram.name}</h1>
      <p className="questionEcho">{castingResult.question}</p>

      <div className="resultLayout">
        <div className="oracleColumn">
          <section className="readingBlock summaryBlock" aria-label="卦象摘要">
            <dl className="resultFacts">
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
          </section>

          <section className="readingBlock" aria-labelledby="hexagram-lines-title">
            <h2 id="hexagram-lines-title">本卦卦象</h2>
            <HexagramLines lines={lines} />
          </section>

          <section className="readingBlock" aria-labelledby="basis-title">
            <h2 id="basis-title">传统依据</h2>
            <ul>
              {castingResult.basis.map((item, index) => (
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
        </div>

        <div className="aiReadingColumn">
          {aiStatus ? (
            <p className={`aiStatus aiStatus-${aiStatus.state}`}>{aiStatus.message}</p>
          ) : null}

          {aiInterpretation ? (
            <>
              <section className="readingBlock aiReadingBlock" aria-label="AI 解读摘要">
                <p className="eyebrow">AI 解卦</p>
                <h2>{aiInterpretation.headline}</h2>
              </section>

              <section className="readingBlock aiReadingBlock" aria-labelledby="plain-reading-title">
                <h2 id="plain-reading-title">白话解读</h2>
                {aiInterpretation.plainText.split('\n').map((paragraph, index) => (
                  <p key={`${index}-${paragraph}`}>{paragraph}</p>
                ))}
              </section>

              <section className="readingBlock aiReadingBlock" aria-labelledby="advice-title">
                <h2 id="advice-title">行动建议</h2>
                <ul>
                  {aiInterpretation.advice.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <section className="readingBlock aiReadingBlock" aria-labelledby="ai-reading-pending-title">
              <p className="eyebrow">AI 解卦</p>
              <h2 id="ai-reading-pending-title">
                {aiStatus?.state === 'error' ? 'AI 解卦未生成' : '等待 AI 解卦'}
              </h2>
              <p>
                {aiStatus?.state === 'loading'
                  ? '正在把所问之事、本卦、动爻、变卦与传统依据发送给你配置的 Provider。'
                  : '本页只保留卦象事实，不使用本地模板补写解读。'}
              </p>
            </section>
          )}
        </div>
      </div>

      <button className="primaryButton" type="button" onClick={onReset}>
        重新起卦
      </button>
    </section>
  );
}

export default ResultView;
