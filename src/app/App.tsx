// Composition root: first screen IS the table. No landing page, no
// config gate — question input and AI settings are optional overlays.

import { useEffect, useState } from 'react';
import { DEFAULT_AI_SETTINGS } from '../ai/aiSettings';
import AiSettingsPanel from '../ui/AiSettingsPanel';
import CastingHud from '../ui/CastingHud';
import MotionTossPanel from '../ui/MotionTossPanel';
import QuestionEntry from '../ui/QuestionEntry';
import ResultPanel from '../ui/ResultPanel';
import TabletopView from '../ui/TabletopView';
import { useCastingController } from './useCastingController';
import { useDeviceShake } from './useDeviceShake';

export default function App() {
  const controller = useCastingController();
  const shake = useDeviceShake(controller);
  const { session } = controller;
  const [aiSettings, setAiSettings] = useState(DEFAULT_AI_SETTINGS);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const resultReady = controller.phase === 'result' && session.result !== null;

  useEffect(() => {
    if (resultReady) {
      setShowResult(true);
    }
  }, [resultReady]);

  const handleReset = () => {
    setShowResult(false);
    controller.resetCasting();
  };

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
          onClose={() => setShowResult(false)}
          onReset={handleReset}
          onOpenAiSettings={() => setShowAiSettings(true)}
        />
      ) : null}

      {showAiSettings ? (
        <AiSettingsPanel
          aiSettings={aiSettings}
          onAiSettingsChange={setAiSettings}
          onClose={() => setShowAiSettings(false)}
        />
      ) : null}
    </main>
  );
}
