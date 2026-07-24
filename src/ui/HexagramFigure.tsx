// Hexagram figure: renders six lines bottom-up (displayed top-first),
// with moving-line marks. Pure presentational.

interface HexagramFigureLine {
  position: number;
  isYang: boolean;
  isMoving?: boolean;
}

interface HexagramFigureProps {
  lines: HexagramFigureLine[];
  label?: string;
}

const POSITION_LABEL: Record<number, string> = {
  1: '初爻',
  2: '二爻',
  3: '三爻',
  4: '四爻',
  5: '五爻',
  6: '上爻'
};

export default function HexagramFigure({ lines, label }: HexagramFigureProps) {
  const displayLines = [...lines].sort((a, b) => b.position - a.position);

  return (
    <ol className="hexagramFigure" aria-label={label ?? '卦象'}>
      {displayLines.map((line) => (
        <li className="hexagramFigureRow" key={line.position}>
          <span className="hexagramFigureLabel">{POSITION_LABEL[line.position] ?? `${line.position}爻`}</span>
          <span className={line.isYang ? 'hexLine yang' : 'hexLine yin'} aria-hidden="true">
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
