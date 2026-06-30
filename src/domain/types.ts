export type QuestionType = 'general' | 'career' | 'relationship' | 'wealth' | 'decision';

export type CoinFace = 'heads' | 'tails';

export type LineName = 'old-yin' | 'young-yang' | 'young-yin' | 'old-yang';

export type LineScore = 6 | 7 | 8 | 9;

export interface LineValue {
  score: LineScore;
  name: LineName;
  isYang: boolean;
  isMoving: boolean;
}

export interface CastLine extends LineValue {
  position: 1 | 2 | 3 | 4 | 5 | 6;
  changedIsYang: boolean;
}

export interface CoinToss {
  faces: [CoinFace, CoinFace, CoinFace];
  score: LineScore;
  line: LineValue;
}

export interface Casting {
  question: string;
  questionType: QuestionType;
  tosses: CoinToss[];
  lines: CastLine[];
  createdAt: string;
}

export interface HexagramRef {
  id: number;
  name: string;
  upperTrigram: string;
  lowerTrigram: string;
}

export interface HexagramLineText {
  position: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  original: string;
  summary: string;
  tags: string[];
}

export interface HexagramCatalogEntry extends HexagramRef {
  pattern: string;
  judgment: string;
  image: string;
  keywords: string[];
  summary: string;
  lines: HexagramLineText[];
}

export interface Interpretation {
  question: string;
  questionType: QuestionType;
  originalHexagram: HexagramCatalogEntry;
  changedHexagram: HexagramCatalogEntry | null;
  movingLines: HexagramLineText[];
  headline: string;
  plainText: string;
  advice: string[];
  basis: string[];
}
