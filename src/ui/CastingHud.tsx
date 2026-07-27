// Casting HUD: line progress, phase guidance, charge energy feedback,
// and the per-line instant verdict. Read-only over casting state.

import type { CastingPhase } from '../casting/castingMachine';
import { TOTAL_LINES } from '../casting/castingMachine';
import type { CastingEvidence } from '../casting/evidence';
import type { ChargeSource } from '../app/useCastingController';
import type { LineName } from '../domain/types';

const LINE_NAME_LABEL: Record<LineName, string> = {
  'old-yin': '老阴',
  'young-yang': '少阳',
  'young-yin': '少阴',
  'old-yang': '老阳'
};

export function lineNameLabel(name: LineName): string {
  return LINE_NAME_LABEL[name];
}

interface CastingHudProps {
  phase: CastingPhase;
  throwIndex: number;
  evidences: CastingEvidence[];
  chargeEnergy: number;
  chargeSource: ChargeSource;
  motionListening: boolean;
  physicsReady: boolean;
}

/** 结果链路相位：成卦后印鉴环退场，把画面让给卦单。 */
const RESULT_PHASES: ReadonlySet<CastingPhase> = new Set([
  'result',
  'reading',
  'reading-ready',
  'reading-error'
]);

/** 印鉴环：铜钱方孔 + 环字慢转，起卦期间的仪式签名（纯装饰）。 */
function SealRing() {
  return (
    <svg className="sealRing" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <path
          id="sealRingTextPath"
          d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0"
          fill="none"
        />
      </defs>
      <circle cx="60" cy="60" r="31" />
      <rect x="52" y="52" width="16" height="16" />
      <g className="sealRingSpin">
        <text>
          <textPath href="#sealRingTextPath">
            铜钱六爻 · 物理成卦 · 铜钱六爻 · 物理成卦 ·
          </textPath>
        </text>
      </g>
    </svg>
  );
}

function phaseInstruction(  phase: CastingPhase,
  physicsReady: boolean,
  chargeSource: ChargeSource,
  motionListening: boolean
): string {
  if (!physicsReady) {
    return '物理引擎加载中…';
  }

  switch (phase) {
    case 'idle':
    case 'ready':
      return motionListening
        ? '摇晃手机开始起卦，或按住桌面拖动'
        : '按住桌面摇动铜钱，松手掷出（或按住空格键）';
    case 'charging':
      return chargeSource === 'motion' ? '摇晃中…静止手机掷出' : '摇动中…松手掷出';
    case 'released':
    case 'simulating':
      return '铜钱落定中…';
    case 'settled':
      return '铜钱已落定';
    case 'result':
    case 'reading-ready':
    case 'reading-error':
      return '六爻已成，查看结果';
    case 'reading':
      return 'AI 解读生成中…';
  }
}

export default function CastingHud({
  phase,
  throwIndex,
  evidences,
  chargeEnergy,
  chargeSource,
  motionListening,
  physicsReady
}: CastingHudProps) {
  const latest = evidences[evidences.length - 1] ?? null;
  const showVerdict = latest !== null && (phase === 'ready' || phase === 'result');

  return (
    <div className="castingHud">
      <section className="hudProgress" aria-label="起卦进度">
        <p className="hudCounter">
          <span className="hudCounterEn" aria-hidden="true">
            Line {Math.min(throwIndex, TOTAL_LINES)} of {TOTAL_LINES}
          </span>
          第 {Math.min(throwIndex, TOTAL_LINES)} 爻 <span>/ 共 {TOTAL_LINES} 爻</span>
        </p>
        <ol className="hudLineList">
          {evidences.map((evidence) => (
            <li key={evidence.throwIndex}>
              <span className="hudLineIndex">{evidence.throwIndex}</span>
              <span className={evidence.isMoving ? 'hudLineName moving' : 'hudLineName'}>
                {lineNameLabel(evidence.lineName)}
                {evidence.isMoving ? ' · 动' : ''}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="hudStatus" aria-live="polite">
        <p className="hudInstruction">
          {phaseInstruction(phase, physicsReady, chargeSource, motionListening)}
        </p>
        {phase === 'charging' ? (
          <div
            className="energyMeter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={Math.round(chargeEnergy * 100) / 100}
            aria-label="摇动能量"
          >
            <span style={{ width: `${Math.round(Math.min(1, chargeEnergy) * 100)}%` }} />
          </div>
        ) : null}
        {showVerdict && latest ? (
          <p className="lineVerdict" data-testid="line-verdict">
            第 {latest.throwIndex} 爻 · {lineNameLabel(latest.lineName)}
            {latest.isMoving ? '（动）' : '（不变）'}
          </p>
        ) : null}
      </section>

      {RESULT_PHASES.has(phase) ? null : <SealRing />}
    </div>
  );
}
