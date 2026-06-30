import type { CastLine, CoinToss } from '../domain/types';
import CoinAnimation from './CoinAnimation';
import HexagramLines from './HexagramLines';
import PrivacyNotice from './PrivacyNotice';

interface CastingStageProps {
  question: string;
  currentThrow: number;
  tosses: CoinToss[];
  lines: CastLine[];
  onManualToss: () => void;
}

export default function CastingStage({
  question,
  currentThrow,
  tosses,
  lines,
  onManualToss
}: CastingStageProps) {
  return (
    <section className="castingPanel" aria-labelledby="casting-title">
      <p className="eyebrow">六次掷钱</p>
      <h1 id="casting-title">第 {currentThrow} 掷 / 共 6 掷</h1>
      <p className="questionEcho">{question}</p>

      <div className="cameraMock" aria-label="摄像头手势识别">
        等待手势
      </div>

      <CoinAnimation latestToss={tosses.at(-1)} />
      <HexagramLines lines={lines} />

      <button className="primaryButton" type="button" onClick={onManualToss}>
        手动掷一次
      </button>

      <PrivacyNotice />
    </section>
  );
}
