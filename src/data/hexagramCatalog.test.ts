import { KING_WEN_MATRIX, TRIGRAMS } from '../domain/trigrams';
import { HEXAGRAM_CATALOG, getHexagramEntry } from './hexagramCatalog';

const TRIGRAM_PATTERN_BY_NAME = Object.fromEntries(
  Object.values(TRIGRAMS).map((trigram) => [trigram.name, trigram.pattern])
);

describe('hexagram catalog', () => {
  it('contains all 64 King Wen hexagrams', () => {
    expect(HEXAGRAM_CATALOG).toHaveLength(64);
    expect(new Set(HEXAGRAM_CATALOG.map((entry) => entry.id)).size).toBe(64);
    expect(HEXAGRAM_CATALOG.map((entry) => entry.id)).toEqual(
      Array.from({ length: 64 }, (_, index) => index + 1)
    );
  });

  it('matches the fixed King Wen matrix and trigram-derived patterns', () => {
    const matrixRefs = Object.values(KING_WEN_MATRIX).flatMap((row) => Object.values(row));

    for (const entry of HEXAGRAM_CATALOG) {
      expect(matrixRefs.find((ref) => ref.id === entry.id)).toEqual({
        id: entry.id,
        name: entry.name,
        upperTrigram: entry.upperTrigram,
        lowerTrigram: entry.lowerTrigram
      });
      expect(entry.pattern).toBe(
        `${TRIGRAM_PATTERN_BY_NAME[entry.lowerTrigram]}${TRIGRAM_PATTERN_BY_NAME[entry.upperTrigram]}`
      );
    }
  });

  it('contains complete traditional basis fields for every hexagram', () => {
    for (const entry of HEXAGRAM_CATALOG) {
      expect(entry.name).toMatch(/\S/);
      expect(entry.upperTrigram).toMatch(/\S/);
      expect(entry.lowerTrigram).toMatch(/\S/);
      expect(entry.pattern).toMatch(/^[01]{6}$/);
      expect(entry.judgment).toMatch(/\S/);
      expect(entry.image).toMatch(/\S/);
      expect(entry.keywords.length).toBeGreaterThanOrEqual(3);
      expect(entry.summary).toMatch(/\S/);
      expect(entry.lines).toHaveLength(6);
      expect(entry.lines.map((line) => line.position)).toEqual([1, 2, 3, 4, 5, 6]);

      for (const line of entry.lines) {
        expect(line.title).toMatch(/\S/);
        expect(line.original).toMatch(/\S/);
        expect(line.original).not.toContain(`${entry.name}之`);
        expect(line.summary).toMatch(/\S/);
        expect(line.tags.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('finds a known hexagram by id', () => {
    expect(getHexagramEntry(1)).toMatchObject({
      id: 1,
      name: '乾为天',
      judgment: expect.stringContaining('元亨利贞')
    });
  });

  it('keeps traditional line text for known hexagrams', () => {
    expect(getHexagramEntry(1).lines[0].original).toBe('潛龍勿用。');
    expect(getHexagramEntry(2).lines[0].original).toBe('履霜，堅冰至。');
    expect(getHexagramEntry(3).lines.map((line) => line.original)).toEqual([
      '磐桓，利居貞，利建侯。',
      '屯如邅如，乘馬班如，匪寇婚媾，女子貞不字，十年乃字。',
      '即鹿无虞，惟入于林中，君子幾不如舍，往吝。',
      '乘馬班如，求婚媾，往，吉无不利。',
      '屯其膏；小貞吉，大貞凶。',
      '乘馬班如，泣血漣如。'
    ]);
    expect(getHexagramEntry(64).lines[5].original).toBe('有孚于飲酒，无咎，濡其首，有孚失是。');
  });

  it('throws for missing catalog ids', () => {
    expect(() => getHexagramEntry(65)).toThrow('Missing hexagram catalog entry: 65');
  });
});
