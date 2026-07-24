// Evidence panel: per-line proof of how each line was produced —
// input source and summary, settlement reason and time, the three coin
// faces read from the physics bodies, and the resulting score/line.

import type { CastingEvidence } from '../casting/evidence';
import { lineNameLabel } from './CastingHud';

interface EvidencePanelProps {
  evidences: CastingEvidence[];
}

const SOURCE_LABEL: Record<CastingEvidence['inputSource'], string> = {
  pointer: '指针拖拽',
  motion: '摇晃感应',
  keyboard: '键盘'
};

const REASON_LABEL: Record<CastingEvidence['settledReason'], string> = {
  strict: '自然静止',
  'timeout-readable': '超时判读（物理朝向）'
};

const FACE_LABEL = { heads: '字', tails: '背' } as const;

export default function EvidencePanel({ evidences }: EvidencePanelProps) {
  return (
    <ol className="evidenceList" aria-label="投掷证据">
      {evidences.map((evidence) => (
        <li className="evidenceItem" key={evidence.throwIndex}>
          <header>
            <strong>第 {evidence.throwIndex} 爻</strong>
            <span className="evidenceVerdict">
              {lineNameLabel(evidence.lineName)}（{evidence.score}）
              {evidence.isMoving ? ' · 动' : ''}
            </span>
          </header>
          <dl>
            <div>
              <dt>输入</dt>
              <dd>
                {SOURCE_LABEL[evidence.inputSource]} · 能量 {evidence.inputSummary.energy.toFixed(2)} ·{' '}
                {evidence.inputSummary.durationMs}ms
              </dd>
            </div>
            <div>
              <dt>落定</dt>
              <dd>
                {REASON_LABEL[evidence.settledReason]} · {(evidence.settledTimeMs / 1000).toFixed(2)}s
              </dd>
            </div>
            <div>
              <dt>朝向</dt>
              <dd>{evidence.faces.map((face) => FACE_LABEL[face]).join(' / ')}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
