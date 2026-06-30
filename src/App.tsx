import { useEffect, useState } from 'react';
import { DEFAULT_AI_SETTINGS } from './ai/aiSettings';
import type { AiReadingStatus } from './ai/aiStatus';
import { createAiInterpretation } from './ai/openaiReading';
import CastingStage from './components/CastingStage';
import QuestionEntry from './components/QuestionEntry';
import ResultView from './components/ResultView';
import { buildCasting } from './domain/coinToss';
import type { AiInterpretation, CastLine, CoinToss, QuestionType } from './domain/types';
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
  const [aiSettings, setAiSettings] = useState(DEFAULT_AI_SETTINGS);
  const [aiInterpretation, setAiInterpretation] = useState<AiInterpretation | null>(null);
  const [aiStatus, setAiStatus] = useState<AiReadingStatus | null>(null);
  const isAiConfigured = Boolean(
    aiSettings.apiKey.trim() && aiSettings.apiUrl.trim() && aiSettings.model.trim()
  );
  const displayLines = buildCastingForDisplay(
    session.question,
    session.questionType,
    session.tosses
  );

  useEffect(() => {
    if (session.phase !== 'result' || !session.castingResult) {
      setAiInterpretation(null);
      setAiStatus(null);
      return;
    }

    const apiKey = aiSettings.apiKey.trim();
    const apiUrl = aiSettings.apiUrl.trim();
    const model = aiSettings.model.trim();
    if (!apiKey || !apiUrl || !model) {
      setAiInterpretation(null);
      setAiStatus({
        state: 'error',
        message: 'AI 解卦需要 API URL、API Key 和模型，请重新起卦前补全配置。'
      });
      return;
    }

    const controller = new AbortController();
    setAiInterpretation(null);
    setAiStatus({
      state: 'loading',
      message: 'AI 正在基于传统依据解卦，卦辞和爻辞保持原文。'
    });

    createAiInterpretation(session.castingResult, session.tosses, {
      apiKey,
      apiUrl,
      model,
      provider: aiSettings.provider,
      signal: controller.signal
    })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        setAiInterpretation(result);
        setAiStatus({
          state: 'ready',
          message: 'AI 解卦已生成；传统卦辞与爻辞未被改写。'
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : '未知错误';
        setAiStatus({
          state: 'error',
          message: `AI 解卦失败：${message}`
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    aiSettings.apiKey,
    aiSettings.apiUrl,
    aiSettings.model,
    aiSettings.provider,
    session.castingResult,
    session.phase,
    session.tosses
  ]);

  return (
    <main className="appShell">
      {session.phase === 'question' ? (
        <QuestionEntry
          aiSettings={aiSettings}
          isAiConfigured={isAiConfigured}
          onAiSettingsChange={setAiSettings}
          onStart={session.start}
        />
      ) : null}
      {session.phase === 'casting' ? (
        <CastingStage
          question={session.question}
          currentThrow={session.currentThrow}
          tosses={session.tosses}
          lines={displayLines}
          onManualToss={session.addRandomToss}
        />
      ) : null}
      {session.phase === 'result' && session.castingResult ? (
        <ResultView
          aiStatus={aiStatus}
          aiInterpretation={aiInterpretation}
          castingResult={session.castingResult}
          tosses={session.tosses}
          onReset={session.reset}
        />
      ) : null}
    </main>
  );
}
