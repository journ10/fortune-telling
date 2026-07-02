import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_AI_SETTINGS } from './ai/aiSettings';
import type { AiReadingStatus } from './ai/aiStatus';
import { createAiInterpretation } from './ai/openaiReading';
import AiSettingsDialog from './components/AiSettingsDialog';
import CastProgressToast from './components/CastProgressToast';
import GestureControl from './components/GestureControl';
import MotionTossControl from './components/MotionTossControl';
import QuestionDialog from './components/QuestionDialog';
import ResultDialog from './components/ResultDialog';
import TabletopScene from './components/TabletopScene';
import { createCoinToss } from './domain/coinToss';
import type { AiInterpretation, CoinFace, QuestionType } from './domain/types';
import { useCastingSession } from './hooks/useCastingSession';
import {
  createKeyboardPhysicalTossInput,
  createMotionPhysicalTossInput,
  type PhysicalTossInput,
  type Vec3Tuple
} from './physics/physicalTossInput';

type ActiveDialog = 'ai-settings' | 'question' | 'result' | null;
type AiSettingsState = typeof DEFAULT_AI_SETTINGS;

interface PendingPhysicalToss {
  id: number;
  input: PhysicalTossInput;
}

function createRandomTossSeed(): number {
  const values = new Uint32Array(1);
  const cryptoSource = globalThis.crypto;

  if (cryptoSource?.getRandomValues) {
    cryptoSource.getRandomValues(values);
    return values[0] >>> 0;
  }

  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function hasCompleteAiSettings(settings: AiSettingsState): boolean {
  return Boolean(settings.apiKey.trim() && settings.apiUrl.trim() && settings.model.trim());
}

function clampMotionEnergy(energy: number): number {
  if (!Number.isFinite(energy)) {
    return 0;
  }

  return Math.min(Math.max(energy, 0), 1.15);
}

export default function App() {
  const session = useCastingSession();
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>('ai-settings');
  const [aiSettings, setAiSettings] = useState(DEFAULT_AI_SETTINGS);
  const [submittedAiSettings, setSubmittedAiSettings] = useState(DEFAULT_AI_SETTINGS);
  const [aiInterpretation, setAiInterpretation] = useState<AiInterpretation | null>(null);
  const [aiStatus, setAiStatus] = useState<AiReadingStatus | null>(null);
  const [pendingToss, setPendingToss] = useState<PendingPhysicalToss | null>(null);
  const [shouldOfferMotionToss, setShouldOfferMotionToss] = useState(false);
  const [aiRequestNonce, setAiRequestNonce] = useState(0);
  const nextTossIdRef = useRef(1);
  const pendingTossRef = useRef<PendingPhysicalToss | null>(null);
  const motionSeedMixRef = useRef(0);
  const motionTossEnergyRef = useRef<number | null>(null);
  const isAiConfigured = hasCompleteAiSettings(aiSettings);
  const isSubmittedAiConfigured = hasCompleteAiSettings(submittedAiSettings);
  const resultAvailable = session.phase === 'result' && Boolean(session.castingResult);

  useEffect(() => {
    pendingTossRef.current = pendingToss;
  }, [pendingToss]);

  useEffect(() => {
    const hasDeviceMotion = typeof DeviceMotionEvent !== 'undefined';
    const hasCoarsePointer =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : false;

    setShouldOfferMotionToss(hasDeviceMotion && hasCoarsePointer);
  }, []);

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

  const closeResultAiSettings = useCallback(() => {
    setAiSettings(submittedAiSettings);
    setActiveDialog('result');
  }, [submittedAiSettings]);

  const startCasting = useCallback(
    (question: string, questionType: QuestionType) => {
      pendingTossRef.current = null;
      setPendingToss(null);
      motionSeedMixRef.current = 0;
      motionTossEnergyRef.current = null;
      nextTossIdRef.current = 1;
      setAiInterpretation(null);
      setAiStatus(null);
      setActiveDialog(null);
      session.start(question, questionType);
    },
    [session]
  );

  const requestPhysicalToss = useCallback(
    (input: PhysicalTossInput) => {
      if (session.phase !== 'casting' || pendingTossRef.current !== null) {
        return;
      }

      const tossId = nextTossIdRef.current;
      nextTossIdRef.current += 1;
      const pending = { id: tossId, input };
      pendingTossRef.current = pending;
      setPendingToss(pending);
      motionSeedMixRef.current = 0;
      motionTossEnergyRef.current = null;
    },
    [session.phase]
  );

  const startTossShake = useCallback((seedMix = 0) => {
    if (session.phase !== 'casting' || pendingTossRef.current !== null) {
      return;
    }

    motionSeedMixRef.current = seedMix >>> 0;
  }, [session.phase]);

  const requestToss = useCallback(() => {
    motionTossEnergyRef.current = null;
    requestPhysicalToss(
      createKeyboardPhysicalTossInput({
        currentThrow: session.currentThrow,
        perturbationSeed: (createRandomTossSeed() ^ session.currentThrow) >>> 0
      })
    );
  }, [requestPhysicalToss, session.currentThrow]);

  const driveMotionToss = useCallback((energy: number) => {
    motionTossEnergyRef.current = clampMotionEnergy(energy);
  }, []);

  const releaseMotionToss = useCallback((digest: number) => {
    const energy = Math.max(motionTossEnergyRef.current ?? 0, digest > 0 ? 0.52 : 0);
    const digestSeed = (digest ^ motionSeedMixRef.current) >>> 0;
    const dominantAcceleration: Vec3Tuple = [energy || 0.52, 0, -1];
    const rotationBias: Vec3Tuple = [
      (digest & 0xff) - 128,
      ((digest >>> 8) & 0xff) - 128,
      ((digest >>> 16) & 0xff) - 128
    ];

    requestPhysicalToss(
      createMotionPhysicalTossInput({
        currentThrow: session.currentThrow,
        digest,
        dominantAcceleration,
        durationMs: Math.round(520 + energy * 360),
        energy,
        peakCount: digest > 0 ? 1 : 0,
        perturbationSeed: (createRandomTossSeed() ^ digestSeed) >>> 0,
        rotationBias
      })
    );
  }, [requestPhysicalToss, session.currentThrow]);

  const settlePhysicalToss = useCallback(
    (faces: [CoinFace, CoinFace, CoinFace]) => {
      if (pendingTossRef.current === null) {
        return;
      }

      pendingTossRef.current = null;
      session.recordToss(createCoinToss(faces));
      setPendingToss(null);
      motionSeedMixRef.current = 0;
      motionTossEnergyRef.current = null;
    },
    [session]
  );

  const handleTossSimulationError = useCallback(() => {
    if (pendingTossRef.current === null) {
      return;
    }

    pendingTossRef.current = null;
    setPendingToss(null);
    motionSeedMixRef.current = 0;
    motionTossEnergyRef.current = null;
  }, []);

  const resetCasting = useCallback(() => {
    pendingTossRef.current = null;
    setPendingToss(null);
    motionSeedMixRef.current = 0;
    motionTossEnergyRef.current = null;
    nextTossIdRef.current = 1;
    setAiInterpretation(null);
    setAiStatus(null);
    setAiRequestNonce(0);
    setAiSettings(submittedAiSettings);
    setActiveDialog(isSubmittedAiConfigured ? 'question' : 'ai-settings');
    session.reset();
  }, [isSubmittedAiConfigured, session, submittedAiSettings]);

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
        onPhysicalTossRequest={requestPhysicalToss}
        onTossSimulationError={handleTossSimulationError}
        onTossSettled={settlePhysicalToss}
      />

      {session.phase === 'casting' ? (
        <CastProgressToast
          currentThrow={session.currentThrow}
          isAnimating={pendingToss !== null}
        />
      ) : null}

      {shouldOfferMotionToss ? (
        <MotionTossControl
          currentThrow={session.currentThrow}
          isCasting={session.phase === 'casting'}
          isTossing={pendingToss !== null}
          onMotionDrive={driveMotionToss}
          onPhysicalTossRequest={requestPhysicalToss}
        />
      ) : (
        <GestureControl
          isCasting={session.phase === 'casting'}
          isTossing={pendingToss !== null}
          onGestureToss={requestToss}
        />
      )}

      {activeDialog === 'ai-settings' ? (
        <AiSettingsDialog
          aiSettings={aiSettings}
          isAiConfigured={isAiConfigured}
          onAiSettingsChange={setAiSettings}
          onClose={resultAvailable ? closeResultAiSettings : undefined}
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
