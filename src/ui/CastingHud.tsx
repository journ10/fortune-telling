// Casting HUD: line progress, phase guidance, charge energy feedback,
// and the per-line instant verdict. Read-only over casting state.

import type { CastingPhase } from '../casting/castingMachine';
import { TOTAL_LINES } from '../casting/castingMachine';
import type { CastingEvidence } from '../casting/evidence';
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
  physicsReady: boolean;
}

function phaseInstruction(phase: CastingPhase, physicsReady: boolean): string {
  if (!physicsReady) {
    return '物理引擎加载中…';
  }

  switch (phase) {
    case 'idle':
    case 'ready':
      return '按住桌面摇动铜钱，松手掷出（或按住空格键）';
    case 'charging':
      return '摇动中…松手掷出';
    case 'released':
    case 'simulating':
      return '铜钱落定中…';
    case 'settled':
      return '铜钱已落定';
    case 'result':
      return '六爻已成，查看结果';
  }
}

export default function CastingHud({
  phase,
  throwIndex,
  evidences,
  chargeEnergy,
  physicsReady
}: CastingHudProps) {
  const latest = evidences[evidences.length - 1] ?? null;
  const showVerdict = latest !== null && (phase === 'ready' || phase === 'result');

  return (
    <div className="castingHud">
      <section className="hudProgress" aria-label="起卦进度">
        <p className="hudCounter">
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
        <p className="hudInstruction">{phaseInstruction(phase, physicsReady)}</p>
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
    </div>
  );
}
