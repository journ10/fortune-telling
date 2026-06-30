import { createCoinToss, buildCasting } from './coinToss';
import { getChangedPattern, getHexagramByLines, getMovingLinePositions } from './hexagrams';

describe('hexagram resolution', () => {
  it('resolves all-yang lines as hexagram 1', () => {
    const hexagram = getHexagramByLines([true, true, true, true, true, true]);

    expect(hexagram).toMatchObject({
      id: 1,
      name: '乾为天',
      lowerTrigram: '乾',
      upperTrigram: '乾'
    });
  });

  it('resolves all-yin lines as hexagram 2', () => {
    const hexagram = getHexagramByLines([false, false, false, false, false, false]);

    expect(hexagram).toMatchObject({
      id: 2,
      name: '坤为地',
      lowerTrigram: '坤',
      upperTrigram: '坤'
    });
  });

  it('resolves bottom heaven and top earth as hexagram 11', () => {
    const hexagram = getHexagramByLines([true, true, true, false, false, false]);

    expect(hexagram).toMatchObject({
      id: 11,
      name: '地天泰',
      lowerTrigram: '乾',
      upperTrigram: '坤'
    });
  });

  it('returns moving line positions from a complete casting', () => {
    const casting = buildCasting('今日运势', 'general', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'heads', 'tails']),
      createCoinToss(['tails', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails'])
    ]);

    expect(getMovingLinePositions(casting.lines)).toEqual([2, 4]);
  });

  it('creates the changed pattern by flipping moving lines', () => {
    const casting = buildCasting('今日运势', 'general', [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['heads', 'heads', 'tails']),
      createCoinToss(['tails', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails'])
    ]);

    expect(casting.lines.map((line) => line.isYang)).toEqual([true, true, false, false, true, false]);
    expect(getChangedPattern(casting.lines)).toEqual([true, false, false, true, true, false]);
  });
});
