import type { CastLine } from '../domain/types';

interface HexagramLinesProps {
  lines: CastLine[];
}

export default function HexagramLines({ lines }: HexagramLinesProps) {
  const displayLines = [...lines].reverse();

  return (
    <ol className="hexagramLines" aria-label="六爻">
      {displayLines.map((line) => (
        <li className="hexLineRow" key={line.position}>
          <span className="lineLabel">{line.position === 6 ? '上爻' : `${line.position}爻`}</span>
          <span className={line.isYang ? 'yangLine' : 'yinLine'} aria-hidden="true">
            {line.isYang ? (
              <span />
            ) : (
              <>
                <span />
                <span />
              </>
            )}
          </span>
          <span className="srOnly">{line.isYang ? '阳爻' : '阴爻'}</span>
          {line.isMoving ? <span className="movingMark">动</span> : null}
        </li>
      ))}
    </ol>
  );
}
