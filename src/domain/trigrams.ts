import type { HexagramRef } from './types';

export type TrigramName = '乾' | '兑' | '离' | '震' | '巽' | '坎' | '艮' | '坤';

export interface Trigram {
  name: TrigramName;
  pattern: string;
}

export const TRIGRAMS: Record<string, Trigram> = {
  '111': { name: '乾', pattern: '111' },
  '110': { name: '兑', pattern: '110' },
  '101': { name: '离', pattern: '101' },
  '100': { name: '震', pattern: '100' },
  '011': { name: '巽', pattern: '011' },
  '010': { name: '坎', pattern: '010' },
  '001': { name: '艮', pattern: '001' },
  '000': { name: '坤', pattern: '000' }
};

export const KING_WEN_MATRIX: Record<TrigramName, Record<TrigramName, HexagramRef>> = {
  乾: {
    乾: { id: 1, name: '乾为天', upperTrigram: '乾', lowerTrigram: '乾' },
    兑: { id: 43, name: '泽天夬', upperTrigram: '兑', lowerTrigram: '乾' },
    离: { id: 14, name: '火天大有', upperTrigram: '离', lowerTrigram: '乾' },
    震: { id: 34, name: '雷天大壮', upperTrigram: '震', lowerTrigram: '乾' },
    巽: { id: 9, name: '风天小畜', upperTrigram: '巽', lowerTrigram: '乾' },
    坎: { id: 5, name: '水天需', upperTrigram: '坎', lowerTrigram: '乾' },
    艮: { id: 26, name: '山天大畜', upperTrigram: '艮', lowerTrigram: '乾' },
    坤: { id: 11, name: '地天泰', upperTrigram: '坤', lowerTrigram: '乾' }
  },
  兑: {
    乾: { id: 10, name: '天泽履', upperTrigram: '乾', lowerTrigram: '兑' },
    兑: { id: 58, name: '兑为泽', upperTrigram: '兑', lowerTrigram: '兑' },
    离: { id: 38, name: '火泽睽', upperTrigram: '离', lowerTrigram: '兑' },
    震: { id: 54, name: '雷泽归妹', upperTrigram: '震', lowerTrigram: '兑' },
    巽: { id: 61, name: '风泽中孚', upperTrigram: '巽', lowerTrigram: '兑' },
    坎: { id: 60, name: '水泽节', upperTrigram: '坎', lowerTrigram: '兑' },
    艮: { id: 41, name: '山泽损', upperTrigram: '艮', lowerTrigram: '兑' },
    坤: { id: 19, name: '地泽临', upperTrigram: '坤', lowerTrigram: '兑' }
  },
  离: {
    乾: { id: 13, name: '天火同人', upperTrigram: '乾', lowerTrigram: '离' },
    兑: { id: 49, name: '泽火革', upperTrigram: '兑', lowerTrigram: '离' },
    离: { id: 30, name: '离为火', upperTrigram: '离', lowerTrigram: '离' },
    震: { id: 55, name: '雷火丰', upperTrigram: '震', lowerTrigram: '离' },
    巽: { id: 37, name: '风火家人', upperTrigram: '巽', lowerTrigram: '离' },
    坎: { id: 63, name: '水火既济', upperTrigram: '坎', lowerTrigram: '离' },
    艮: { id: 22, name: '山火贲', upperTrigram: '艮', lowerTrigram: '离' },
    坤: { id: 36, name: '地火明夷', upperTrigram: '坤', lowerTrigram: '离' }
  },
  震: {
    乾: { id: 25, name: '天雷无妄', upperTrigram: '乾', lowerTrigram: '震' },
    兑: { id: 17, name: '泽雷随', upperTrigram: '兑', lowerTrigram: '震' },
    离: { id: 21, name: '火雷噬嗑', upperTrigram: '离', lowerTrigram: '震' },
    震: { id: 51, name: '震为雷', upperTrigram: '震', lowerTrigram: '震' },
    巽: { id: 42, name: '风雷益', upperTrigram: '巽', lowerTrigram: '震' },
    坎: { id: 3, name: '水雷屯', upperTrigram: '坎', lowerTrigram: '震' },
    艮: { id: 27, name: '山雷颐', upperTrigram: '艮', lowerTrigram: '震' },
    坤: { id: 24, name: '地雷复', upperTrigram: '坤', lowerTrigram: '震' }
  },
  巽: {
    乾: { id: 44, name: '天风姤', upperTrigram: '乾', lowerTrigram: '巽' },
    兑: { id: 28, name: '泽风大过', upperTrigram: '兑', lowerTrigram: '巽' },
    离: { id: 50, name: '火风鼎', upperTrigram: '离', lowerTrigram: '巽' },
    震: { id: 32, name: '雷风恒', upperTrigram: '震', lowerTrigram: '巽' },
    巽: { id: 57, name: '巽为风', upperTrigram: '巽', lowerTrigram: '巽' },
    坎: { id: 48, name: '水风井', upperTrigram: '坎', lowerTrigram: '巽' },
    艮: { id: 18, name: '山风蛊', upperTrigram: '艮', lowerTrigram: '巽' },
    坤: { id: 46, name: '地风升', upperTrigram: '坤', lowerTrigram: '巽' }
  },
  坎: {
    乾: { id: 6, name: '天水讼', upperTrigram: '乾', lowerTrigram: '坎' },
    兑: { id: 47, name: '泽水困', upperTrigram: '兑', lowerTrigram: '坎' },
    离: { id: 64, name: '火水未济', upperTrigram: '离', lowerTrigram: '坎' },
    震: { id: 40, name: '雷水解', upperTrigram: '震', lowerTrigram: '坎' },
    巽: { id: 59, name: '风水涣', upperTrigram: '巽', lowerTrigram: '坎' },
    坎: { id: 29, name: '坎为水', upperTrigram: '坎', lowerTrigram: '坎' },
    艮: { id: 4, name: '山水蒙', upperTrigram: '艮', lowerTrigram: '坎' },
    坤: { id: 7, name: '地水师', upperTrigram: '坤', lowerTrigram: '坎' }
  },
  艮: {
    乾: { id: 33, name: '天山遯', upperTrigram: '乾', lowerTrigram: '艮' },
    兑: { id: 31, name: '泽山咸', upperTrigram: '兑', lowerTrigram: '艮' },
    离: { id: 56, name: '火山旅', upperTrigram: '离', lowerTrigram: '艮' },
    震: { id: 62, name: '雷山小过', upperTrigram: '震', lowerTrigram: '艮' },
    巽: { id: 53, name: '风山渐', upperTrigram: '巽', lowerTrigram: '艮' },
    坎: { id: 39, name: '水山蹇', upperTrigram: '坎', lowerTrigram: '艮' },
    艮: { id: 52, name: '艮为山', upperTrigram: '艮', lowerTrigram: '艮' },
    坤: { id: 15, name: '地山谦', upperTrigram: '坤', lowerTrigram: '艮' }
  },
  坤: {
    乾: { id: 12, name: '天地否', upperTrigram: '乾', lowerTrigram: '坤' },
    兑: { id: 45, name: '泽地萃', upperTrigram: '兑', lowerTrigram: '坤' },
    离: { id: 35, name: '火地晋', upperTrigram: '离', lowerTrigram: '坤' },
    震: { id: 16, name: '雷地豫', upperTrigram: '震', lowerTrigram: '坤' },
    巽: { id: 20, name: '风地观', upperTrigram: '巽', lowerTrigram: '坤' },
    坎: { id: 8, name: '水地比', upperTrigram: '坎', lowerTrigram: '坤' },
    艮: { id: 23, name: '山地剥', upperTrigram: '艮', lowerTrigram: '坤' },
    坤: { id: 2, name: '坤为地', upperTrigram: '坤', lowerTrigram: '坤' }
  }
};
