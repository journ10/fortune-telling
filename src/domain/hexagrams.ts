import { KING_WEN_MATRIX, TRIGRAMS, type TrigramName } from './trigrams';
import type { CastLine, HexagramRef } from './types';

function toPattern(linesBottomToTop: readonly boolean[]): string {
  if (linesBottomToTop.length !== 6 && linesBottomToTop.length !== 3) {
    throw new Error(`Expected 3 or 6 lines, received ${linesBottomToTop.length}`);
  }

  return linesBottomToTop.map((line) => (line ? '1' : '0')).join('');
}

function trigramName(linesBottomToTop: readonly boolean[]): TrigramName {
  const pattern = toPattern(linesBottomToTop);
  const trigram = TRIGRAMS[pattern];

  if (!trigram) {
    throw new Error(`Unknown trigram pattern: ${pattern}`);
  }

  return trigram.name;
}

export function getHexagramByLines(linesBottomToTop: readonly boolean[]): HexagramRef {
  if (linesBottomToTop.length !== 6) {
    throw new Error(`A hexagram requires 6 lines, received ${linesBottomToTop.length}`);
  }

  const lowerTrigram = trigramName(linesBottomToTop.slice(0, 3));
  const upperTrigram = trigramName(linesBottomToTop.slice(3, 6));

  return KING_WEN_MATRIX[lowerTrigram][upperTrigram];
}

export function getMovingLinePositions(lines: readonly CastLine[]): number[] {
  return lines.filter((line) => line.isMoving).map((line) => line.position);
}

export function getOriginalPattern(lines: readonly CastLine[]): boolean[] {
  return lines.map((line) => line.isYang);
}

export function getChangedPattern(lines: readonly CastLine[]): boolean[] {
  return lines.map((line) => line.changedIsYang);
}
