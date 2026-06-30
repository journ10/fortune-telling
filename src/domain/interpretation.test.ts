import { buildCasting, createCoinToss } from './coinToss';
import { createInterpretation } from './interpretation';

describe('interpretation engine', () => {
  it('creates a traceable result for a casting with moving lines', () => {
    const casting = buildCasting('最近事业怎么推进？', 'career', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails'])
    ]);

    const result = createInterpretation(casting);

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
    expect(result.headline).toBe('事业宜稳中推进：创造、主动，局势有变化点');
    expect(result.plainText).toContain('本卦');
    expect(result.plainText).toContain('动爻');
    expect(result.plainText).toContain('变卦');
    expect(result.advice).toContain('动爻提示守住中线，先校准关系、资源和承诺。');
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

    const result = createInterpretation(casting);

    expect(result.changedHexagram).toBeNull();
    expect(result.movingLines).toEqual([]);
    expect(result.plainText).toContain('本卦无动爻');
  });

  it('changes tag-derived advice when a different line moves', () => {
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

    const secondLineAdvice = createInterpretation(secondLineMoving).advice[1];
    const thirdLineAdvice = createInterpretation(thirdLineMoving).advice[1];

    expect(secondLineAdvice).toBe('动爻提示守住中线，先校准关系、资源和承诺。');
    expect(thirdLineAdvice).toBe('动爻提示正处转折，先确认事实变化再调整方向。');
    expect(secondLineAdvice).not.toBe(thirdLineAdvice);
  });
});
