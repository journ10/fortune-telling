import { buildCasting, createCoinToss } from './coinToss';
import { createCastingResult } from './interpretation';

describe('casting result engine', () => {
  it('creates traceable hexagram facts for a casting with moving lines', () => {
    const casting = buildCasting('最近事业怎么推进？', 'career', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails'])
    ]);

    const result = createCastingResult(casting);

    expect(result.question).toBe('最近事业怎么推进？');
    expect(result.originalHexagram).toMatchObject({ id: 1, name: '乾为天' });
    expect(result.changedHexagram).toMatchObject({ id: 13, name: '天火同人' });
    expect(result.movingLines).toEqual([
      expect.objectContaining({
        position: 2,
        title: '九二',
        original: '見龍在田，利見大人。',
        tags: ['守中', '阳爻']
      })
    ]);
    expect('headline' in result).toBe(false);
    expect('plainText' in result).toBe(false);
    expect('advice' in result).toBe(false);
    expect(result.basis).toEqual(
      expect.arrayContaining([
        expect.stringContaining('卦辞'),
        expect.stringContaining('象辞'),
        expect.stringContaining('爻辞')
      ])
    );
  });

  it('uses only the original hexagram when there are no moving lines', () => {
    const casting = buildCasting('今日运势', 'general', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails'])
    ]);

    const result = createCastingResult(casting);

    expect(result.changedHexagram).toBeNull();
    expect(result.movingLines).toEqual([]);
    expect(result.basis).toContain('本卦无动爻：不另取变卦');
  });

  it('keeps moving-line tags so AI can distinguish different moving lines', () => {
    const secondLineMoving = buildCasting('最近事业怎么推进？', 'career', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails'])
    ]);
    const thirdLineMoving = buildCasting('最近事业怎么推进？', 'career', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails'])
    ]);

    const secondLineTags = createCastingResult(secondLineMoving).movingLines[0].tags;
    const thirdLineTags = createCastingResult(thirdLineMoving).movingLines[0].tags;

    expect(secondLineTags).toContain('守中');
    expect(thirdLineTags).toContain('转折');
    expect(secondLineTags).not.toEqual(thirdLineTags);
  });
});
