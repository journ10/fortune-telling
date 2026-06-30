import type {
  CastLine,
  CoinFace,
  CoinToss,
  Casting,
  LineScore,
  LineValue,
  QuestionType
} from './types';

const LINE_BY_SCORE: Record<LineScore, LineValue> = {
  6: { score: 6, name: 'old-yin', isYang: false, isMoving: true },
  7: { score: 7, name: 'young-yang', isYang: true, isMoving: false },
  8: { score: 8, name: 'young-yin', isYang: false, isMoving: false },
  9: { score: 9, name: 'old-yang', isYang: true, isMoving: true }
};

export function lineFromScore(score: number): LineValue {
  if (score === 6 || score === 7 || score === 8 || score === 9) {
    return LINE_BY_SCORE[score];
  }

  throw new Error(`Unsupported coin score: ${score}`);
}

export function createCoinToss(faces: readonly CoinFace[]): CoinToss {
  if (faces.length !== 3) {
    throw new Error(`A toss requires exactly 3 coins, received ${faces.length}`);
  }

  const score = faces.reduce((total, face) => total + (face === 'heads' ? 3 : 2), 0);
  const typedFaces = [...faces] as [CoinFace, CoinFace, CoinFace];
  const line = lineFromScore(score);

  return {
    faces: typedFaces,
    score: line.score,
    line
  };
}

export function tossCoinsWithBits(bits: readonly boolean[]): CoinToss {
  if (bits.length !== 3) {
    throw new Error(`A toss requires exactly 3 random bits, received ${bits.length}`);
  }

  return createCoinToss(bits.map((bit) => (bit ? 'heads' : 'tails')));
}

export function tossCoins(): CoinToss {
  const values = new Uint8Array(3);
  crypto.getRandomValues(values);
  return tossCoinsWithBits(Array.from(values, (value) => value % 2 === 1));
}

export function buildCasting(
  question: string,
  questionType: QuestionType,
  tosses: readonly CoinToss[],
  createdAt = new Date().toISOString()
): Casting {
  if (tosses.length !== 6) {
    throw new Error(`A complete casting requires 6 tosses, received ${tosses.length}`);
  }

  const lines = tosses.map<CastLine>((toss, index) => ({
    ...toss.line,
    position: (index + 1) as CastLine['position'],
    changedIsYang: toss.line.isMoving ? !toss.line.isYang : toss.line.isYang
  }));

  return {
    question,
    questionType,
    tosses: [...tosses],
    lines,
    createdAt
  };
}
