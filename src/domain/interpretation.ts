import { getHexagramEntry } from '../data/hexagramCatalog';
import { getChangedPattern, getHexagramByLines, getMovingLinePositions, getOriginalPattern } from './hexagrams';
import type { Casting, CastingResult } from './types';

export function createCastingResult(casting: Casting): CastingResult {
  const originalRef = getHexagramByLines(getOriginalPattern(casting.lines));
  const changedRef = getHexagramByLines(getChangedPattern(casting.lines));
  const originalHexagram = getHexagramEntry(originalRef.id);
  const movingPositions = getMovingLinePositions(casting.lines);
  const movingLines = movingPositions.map((position) => {
    const line = originalHexagram.lines.find((candidate) => candidate.position === position);

    if (!line) {
      throw new Error(`Missing line ${position} for hexagram ${originalHexagram.id}`);
    }

    return line;
  });
  const changedHexagram = movingLines.length > 0 ? getHexagramEntry(changedRef.id) : null;

  return {
    question: casting.question,
    questionType: casting.questionType,
    originalHexagram,
    changedHexagram,
    movingLines,
    basis: buildBasis(originalHexagram, movingLines, changedHexagram)
  };
}

function buildBasis(
  originalHexagram: CastingResult['originalHexagram'],
  movingLines: CastingResult['movingLines'],
  changedHexagram: CastingResult['changedHexagram']
): string[] {
  return [
    `本卦卦辞：${originalHexagram.judgment}`,
    `本卦象辞：${originalHexagram.image}`,
    ...movingLines.map((line) => `动爻爻辞：${line.title}，${line.original}`),
    changedHexagram ? `变卦卦辞：${changedHexagram.judgment}` : '本卦无动爻：不另取变卦'
  ];
}
