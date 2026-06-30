import type { CoinFace, CoinToss } from '../domain/types';

interface CoinAnimationProps {
  latestToss?: CoinToss;
}

const IDLE_FACES: Array<CoinFace | 'idle'> = ['idle', 'idle', 'idle'];

export default function CoinAnimation({ latestToss }: CoinAnimationProps) {
  const faces = latestToss?.faces ?? IDLE_FACES;

  return (
    <div className="coinTray" aria-label="铜钱结果">
      {faces.map((face, index) => (
        <span className="coin" data-face={face} key={`${face}-${index}`}>
          {face === 'heads' ? '阳' : face === 'tails' ? '阴' : '钱'}
        </span>
      ))}
    </div>
  );
}
