import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_AI_SETTINGS } from './ai/aiSettings';
import type { AiReadingStatus } from './ai/aiStatus';
import { createAiInterpretation } from './ai/openaiReading';
import AiSettingsDialog from './components/AiSettingsDialog';
import CastProgressToast from './components/CastProgressToast';
import QuestionDialog from './components/QuestionDialog';
import ResultDialog from './components/ResultDialog';
import TabletopScene from './components/TabletopScene';
import { tossCoins } from './domain/coinToss';
import type { AiInterpretation, CoinToss, QuestionType } from './domain/types';
import { useCastingSession } from './hooks/useCastingSession';

type ActiveDialog = 'ai-settings' | 'question' | 'result' | null;
type AiSettingsState = typeof DEFAULT_AI_SETTINGS;

function hasCompleteAiSettings(settings: AiSettingsState): boolean {
  return Boolean(settings.apiKey.trim() && settings.apiUrl.trim() && settings.model.trim());
}

export default function App() {
  const session = useCastingSession();
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>('ai-settings');
  const [aiSettings, setAiSettings] = useState(DEFAULT_AI_SETTINGS);
  const [submittedAiSettings, setSubmittedAiSettings] = useState(DEFAULT_AI_SETTINGS);
  const [aiInterpretation, setAiInterpretation] = useState<AiInterpretation | null>(null);
  const [aiStatus, setAiStatus] = useState<AiReadingStatus | null>(null);
  const [pendingToss, setPendingToss] = useState<CoinToss | null>(null);
  const [aiRequestNonce, setAiRequestNonce] = useState(0);
  const pendingTossRef = useRef<CoinToss | null>(null);
  const isAiConfigured = hasCompleteAiSettings(aiSettings);
  const isSubmittedAiConfigured = hasCompleteAiSettings(submittedAiSettings);
  const resultAvailable = session.phase === 'result' && Boolean(session.castingResult);

  useEffect(() => {
    pendingTossRef.current = pendingToss;
  }, [pendingToss]);

  useEffect(() => {
    if (!isAiConfigured) {
      setActiveDialog('ai-settings');
      return;
    }

    if (session.phase === 'question') {
      setActiveDialog((dialog) => dialog ?? 'question');
    }
  }, [isAiConfigured, session.phase]);

  useEffect(() => {
    if (session.phase !== 'result' || !session.castingResult) {
      setAiInterpretation(null);
      setAiStatus(null);
      return undefined;
    }

    setActiveDialog('result');
    setAiInterpretation(null);

    const apiKey = submittedAiSettings.apiKey.trim();
    const apiUrl = submittedAiSettings.apiUrl.trim();
    const model = submittedAiSettings.model.trim();

    if (!isSubmittedAiConfigured) {
      setAiStatus({
        state: 'error',
        message: 'AI 解卦需要 API URL、API Key 和模型，请补全配置后重试。'
      });
      return undefined;
    }

    const controller = new AbortController();
    setAiStatus({
      state: 'loading',
      message: 'AI 正在基于传统依据解卦，卦辞和爻辞保持原文。'
    });

    createAiInterpretation(session.castingResult, session.tosses, {
      apiKey,
      apiUrl,
      model,
      provider: submittedAiSettings.provider,
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
        setAiInterpretation(null);
        setAiStatus({
          state: 'error',
          message: `AI 解卦失败：${message}`
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    aiRequestNonce,
    isSubmittedAiConfigured,
    session.castingResult,
    session.phase,
    session.tosses,
    submittedAiSettings.apiKey,
    submittedAiSettings.apiUrl,
    submittedAiSettings.model,
    submittedAiSettings.provider
  ]);

  const handleAiSettingsSubmit = useCallback(() => {
    if (!isAiConfigured) {
      return;
    }

    setSubmittedAiSettings(aiSettings);

    if (session.phase === 'result' && session.castingResult) {
      setActiveDialog('result');
      setAiRequestNonce((nonce) => nonce + 1);
      return;
    }

    if (session.phase === 'question') {
      setActiveDialog('question');
      return;
    }

    setActiveDialog(null);
  }, [aiSettings, isAiConfigured, session.castingResult, session.phase]);

  const startCasting = useCallback(
    (question: string, questionType: QuestionType) => {
      pendingTossRef.current = null;
      setPendingToss(null);
      setAiInterpretation(null);
      setAiStatus(null);
      setActiveDialog(null);
      session.start(question, questionType);
    },
    [session]
  );

  const requestToss = useCallback(() => {
    if (session.phase !== 'casting' || pendingTossRef.current) {
      return;
    }

    const toss = tossCoins();
    pendingTossRef.current = toss;
    setPendingToss(toss);
  }, [session.phase]);

  const settleToss = useCallback(() => {
    const toss = pendingTossRef.current;

    if (!toss) {
      return;
    }

    pendingTossRef.current = null;
    session.recordToss(toss);
    setPendingToss(null);
  }, [session]);

  const resetCasting = useCallback(() => {
    pendingTossRef.current = null;
    setPendingToss(null);
    setAiInterpretation(null);
    setAiStatus(null);
    setAiRequestNonce(0);
    setActiveDialog(isAiConfigured ? 'question' : 'ai-settings');
    session.reset();
  }, [isAiConfigured, session]);

  const retryAi = useCallback(() => {
    if (!isSubmittedAiConfigured) {
      setActiveDialog('ai-settings');
      return;
    }

    setActiveDialog('result');
    setAiRequestNonce((nonce) => nonce + 1);
  }, [isSubmittedAiConfigured]);

  return (
    <main className="appShell">
      <TabletopScene
        currentThrow={session.currentThrow}
        pendingToss={pendingToss}
        resultAvailable={resultAvailable}
        onOpenResult={() => setActiveDialog('result')}
        onTossRequest={requestToss}
        onTossSettled={settleToss}
      />

      {session.phase === 'casting' ? (
        <CastProgressToast currentThrow={session.currentThrow} isAnimating={pendingToss !== null} />
      ) : null}

      {activeDialog === 'ai-settings' ? (
        <AiSettingsDialog
          aiSettings={aiSettings}
          isAiConfigured={isAiConfigured}
          onAiSettingsChange={setAiSettings}
          onSubmit={handleAiSettingsSubmit}
        />
      ) : null}

      {activeDialog === 'question' ? <QuestionDialog onStart={startCasting} /> : null}

      {activeDialog === 'result' && session.castingResult ? (
        <ResultDialog
          aiStatus={aiStatus}
          aiInterpretation={aiInterpretation}
          castingResult={session.castingResult}
          tosses={session.tosses}
          onClose={() => setActiveDialog(null)}
          onReset={resetCasting}
          onRetryAi={retryAi}
          onEditAiSettings={() => setActiveDialog('ai-settings')}
        />
      ) : null}
    </main>
  );
}
