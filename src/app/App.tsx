// Composition root: first screen IS the table. No landing page, no
// config gate — question input and AI settings are optional overlays.

import { useEffect, useState } from 'react';
import { loadAiSettings, saveAiSettings, type AiSettings } from '../ai/aiSettings';
import AiSettingsPanel from '../ui/AiSettingsPanel';
import CastingHud from '../ui/CastingHud';
import MotionTossPanel from '../ui/MotionTossPanel';
import QuestionEntry from '../ui/QuestionEntry';
import ResultPanel, { type AiReadingStatus } from '../ui/ResultPanel';
import TabletopView from '../ui/TabletopView';
import { useAiReading } from './useAiReading';
import { useCastingController } from './useCastingController';
import { useDeviceShake } from './useDeviceShake';

/** 结果链路相位：成卦后（含 AI 解读中/成功/失败）结果页保持可见。 */
const RESULT_PHASES = new Set(['result', 'reading', 'reading-ready', 'reading-error']);

export default function App() {
  const controller = useCastingController();
  const shake = useDeviceShake(controller);
  const { session } = controller;
  const [aiSettings, setAiSettings] = useState<AiSettings>(loadAiSettings);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const resultReady = RESULT_PHASES.has(controller.phase) && session.result !== null;

  const ai = useAiReading({
    phase: controller.phase,
    result: session.result,
    evidences: session.evidences,
    aiSettings,
    onStart: controller.startAiReading,
    onFinish: controller.finishAiReading,
    onFail: controller.failAiReading
  });

  useEffect(() => {
    if (resultReady) {
      setShowResult(true);
    }
  }, [resultReady]);

  const handleReset = () => {
    setShowResult(false);
    controller.resetCasting();
  };

  const handleAiSettingsClose = () => {
    saveAiSettings(aiSettings);
    setShowAiSettings(false);
  };

  const aiStatus: AiReadingStatus = !ai.configured
    ? { kind: 'unconfigured' }
    : controller.phase === 'reading-ready' && session.aiReading
      ? { kind: 'ready', reading: session.aiReading }
      : controller.phase === 'reading-error'
        ? { kind: 'error', message: session.aiError ?? 'AI 解读失败，请稍后重试' }
        : { kind: 'reading' };

  return (
    <main className="appShell">
      <TabletopView
        phase={controller.phase}
        physicsReady={controller.physicsReady}
        activeToss={controller.activeToss}
        chargeEnergy={controller.chargeEnergy}
        resetNonce={controller.resetNonce}
        onPointerDown={controller.handlePointerDown}
        onPointerMove={controller.handlePointerMove}
        onPointerUp={controller.handlePointerUp}
        onPointerCancel={controller.handlePointerCancel}
        onSimulationSettled={controller.notifySimulationSettled}
      />

      <CastingHud
        phase={controller.phase}
        throwIndex={session.machine.throwIndex}
        evidences={session.evidences}
        chargeEnergy={controller.chargeEnergy}
        chargeSource={controller.chargeSource}
        motionListening={shake.listening}
        physicsReady={controller.physicsReady}
      />

      {shake.offered ? (
        <MotionTossPanel
          permission={shake.permission}
          listening={shake.listening}
          charging={controller.phase === 'charging' && controller.chargeSource === 'motion'}
          readyToRelease={controller.chargeEnergy >= 0.75}
          chargeEnergy={controller.chargeEnergy}
          onRequestPermission={shake.requestPermission}
        />
      ) : null}

      <QuestionEntry
        question={session.question}
        questionType={session.questionType}
        onSetQuestion={controller.setQuestion}
      />

      {resultReady && !showResult ? (
        <button type="button" className="primaryButton resultReopen" onClick={() => setShowResult(true)}>
          查看结果
        </button>
      ) : null}

      {resultReady && showResult && session.result ? (
        <ResultPanel
          result={session.result}
          tosses={session.tosses}
          evidences={session.evidences}
          aiStatus={aiStatus}
          onRetryAi={ai.retry}
          onClose={() => setShowResult(false)}
          onReset={handleReset}
          onOpenAiSettings={() => setShowAiSettings(true)}
        />
      ) : null}

      {showAiSettings ? (
        <AiSettingsPanel
          aiSettings={aiSettings}
          onAiSettingsChange={setAiSettings}
          onClose={handleAiSettingsClose}
        />
      ) : null}
    </main>
  );
}
