import CastingStage from './components/CastingStage';
import QuestionEntry from './components/QuestionEntry';
import ResultView from './components/ResultView';
import { buildCasting } from './domain/coinToss';
import type { CastLine, CoinToss, QuestionType } from './domain/types';
import { useCastingSession } from './hooks/useCastingSession';

function buildCastingForDisplay(
  question: string,
  questionType: QuestionType,
  tosses: CoinToss[]
): CastLine[] {
  if (tosses.length === 6) {
    return buildCasting(question, questionType, tosses).lines;
  }

  return tosses.map<CastLine>((toss, index) => ({
    ...toss.line,
    position: (index + 1) as CastLine['position'],
    changedIsYang: toss.line.isMoving ? !toss.line.isYang : toss.line.isYang
  }));
}

export default function App() {
  const session = useCastingSession();
  const displayLines = buildCastingForDisplay(
    session.question,
    session.questionType,
    session.tosses
  );

  return (
    <main className="appShell">
      {session.phase === 'question' ? <QuestionEntry onStart={session.start} /> : null}
      {session.phase === 'casting' ? (
        <CastingStage
          question={session.question}
          currentThrow={session.currentThrow}
          tosses={session.tosses}
          lines={displayLines}
          onManualToss={() => session.addRandomToss()}
        />
      ) : null}
      {session.phase === 'result' && session.interpretation ? (
        <ResultView
          interpretation={session.interpretation}
          tosses={session.tosses}
          onReset={session.reset}
        />
      ) : null}
    </main>
  );
}
