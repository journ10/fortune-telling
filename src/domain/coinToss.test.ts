import {
  buildCasting,
  createCoinToss,
  lineFromScore,
  tossCoinsWithBits
} from './coinToss';

describe('coin toss rules', () => {
  it.each([
    [['tails', 'tails', 'tails'], 6, 'old-yin', false, true],
    [['heads', 'tails', 'tails'], 7, 'young-yang', true, false],
    [['heads', 'heads', 'tails'], 8, 'young-yin', false, false],
    [['heads', 'heads', 'heads'], 9, 'old-yang', true, true]
  ] as const)('maps %j to score %i', (faces, score, name, isYang, isMoving) => {
    const toss = createCoinToss(faces);

    expect(toss.score).toBe(score);
    expect(toss.line.name).toBe(name);
    expect(toss.line.isYang).toBe(isYang);
    expect(toss.line.isMoving).toBe(isMoving);
  });

  it('rejects scores outside the three-coin range', () => {
    expect(() => lineFromScore(5)).toThrow('Unsupported coin score: 5');
    expect(() => lineFromScore(10)).toThrow('Unsupported coin score: 10');
  });

  it('creates deterministic tosses from bits', () => {
    expect(tossCoinsWithBits([false, true, true])).toMatchObject({
      faces: ['tails', 'heads', 'heads'],
      score: 8
    });
  });

  it('rejects toss input lengths outside three coins', () => {
    expect(() => createCoinToss(['heads', 'tails'])).toThrow('A toss requires exactly 3 coins, received 2');
    expect(() => createCoinToss(['heads', 'tails', 'heads', 'tails'])).toThrow(
      'A toss requires exactly 3 coins, received 4'
    );
  });

  it('rejects bit input lengths outside three bits', () => {
    expect(() => tossCoinsWithBits([true, false])).toThrow('A toss requires exactly 3 random bits, received 2');
    expect(() => tossCoinsWithBits([true, false, true, false])).toThrow(
      'A toss requires exactly 3 random bits, received 4'
    );
  });

  it('defensively copies the caller-provided coin faces', () => {
    const faces = ['heads', 'tails', 'tails'] as const satisfies readonly ['heads', 'tails', 'tails'];
    const mutableFaces = [...faces];

    const toss = createCoinToss(mutableFaces);
    mutableFaces[0] = 'tails';

    expect(toss.faces).toEqual(['heads', 'tails', 'tails']);
    expect(toss.score).toBe(7);
  });

  it('builds a casting from bottom line to top line', () => {
    const tosses = [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['tails', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails'])
    ];

    const casting = buildCasting('今日运势', 'general', tosses);

    expect(casting.tosses).toHaveLength(6);
    expect(casting.lines.map((line) => line.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(casting.lines.map((line) => line.isMoving)).toEqual([false, false, true, true, false, false]);
  });

  it('rejects incomplete castings', () => {
    const tosses = [
      createCoinToss(['heads', 'tails', 'tails']),
      createCoinToss(['heads', 'heads', 'tails']),
      createCoinToss(['heads', 'heads', 'heads']),
      createCoinToss(['tails', 'tails', 'tails']),
      createCoinToss(['heads', 'tails', 'tails'])
    ];

    expect(() => buildCasting('今日运势', 'general', tosses)).toThrow(
      'A complete casting requires 6 tosses, received 5'
    );
  });
});
