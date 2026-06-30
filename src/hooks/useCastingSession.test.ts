import { act, renderHook } from '@testing-library/react';
import { useCastingSession } from './useCastingSession';

describe('useCastingSession', () => {
  it('records manual tosses and creates a result after six tosses', () => {
    const { result } = renderHook(() => useCastingSession());

    act(() => {
      result.current.start('今日运势', 'general');
    });

    for (let index = 0; index < 6; index += 1) {
      act(() => {
        result.current.addManualToss([true, false, false]);
      });
    }

    expect(result.current.phase).toBe('result');
    expect(result.current.tosses).toHaveLength(6);
    expect(result.current.interpretation?.question).toBe('今日运势');
  });

  it('resets to question entry', () => {
    const { result } = renderHook(() => useCastingSession());

    act(() => {
      result.current.start('今日运势', 'general');
      result.current.reset();
    });

    expect(result.current.phase).toBe('question');
    expect(result.current.tosses).toEqual([]);
    expect(result.current.interpretation).toBeNull();
  });

  it('stores and interprets a trimmed question', () => {
    const { result } = renderHook(() => useCastingSession());

    act(() => {
      result.current.start('  今日运势  ', 'career');
    });

    expect(result.current.question).toBe('今日运势');

    for (let index = 0; index < 6; index += 1) {
      act(() => {
        result.current.addManualToss([true, false, false]);
      });
    }

    expect(result.current.interpretation?.question).toBe('今日运势');
    expect(result.current.interpretation?.questionType).toBe('career');
  });

  it('uses the new question and type when start and tosses happen in one act', () => {
    const { result } = renderHook(() => useCastingSession());

    act(() => {
      result.current.start('今日运势', 'relationship');

      for (let index = 0; index < 6; index += 1) {
        result.current.addManualToss([true, false, false]);
      }
    });

    expect(result.current.phase).toBe('result');
    expect(result.current.interpretation?.question).toBe('今日运势');
    expect(result.current.interpretation?.questionType).toBe('relationship');
  });

  it('ignores tosses before start and after reset', () => {
    const { result } = renderHook(() => useCastingSession());

    act(() => {
      result.current.addManualToss([true, false, false]);
      result.current.addRandomToss();
    });

    expect(result.current.phase).toBe('question');
    expect(result.current.tosses).toEqual([]);

    act(() => {
      result.current.start('今日运势', 'general');
      result.current.reset();
      result.current.addManualToss([true, false, false]);
    });

    expect(result.current.phase).toBe('question');
    expect(result.current.tosses).toEqual([]);
    expect(result.current.interpretation).toBeNull();
  });

  it('ignores a seventh toss', () => {
    const { result } = renderHook(() => useCastingSession());

    act(() => {
      result.current.start('今日运势', 'general');
    });

    for (let index = 0; index < 7; index += 1) {
      act(() => {
        result.current.addManualToss([true, false, false]);
      });
    }

    expect(result.current.phase).toBe('result');
    expect(result.current.tosses).toHaveLength(6);
    expect(result.current.currentThrow).toBe(6);
  });
});
