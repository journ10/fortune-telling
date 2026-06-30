import { useCallback, useMemo, useReducer } from 'react';
import { buildCasting, tossCoins, tossCoinsWithBits } from '../domain/coinToss';
import { createInterpretation } from '../domain/interpretation';
import type { CoinToss, Interpretation, QuestionType } from '../domain/types';

export type AppPhase = 'question' | 'casting' | 'result';

export interface CastingSession {
  phase: AppPhase;
  question: string;
  questionType: QuestionType;
  tosses: CoinToss[];
  interpretation: Interpretation | null;
  currentThrow: number;
  start: (question: string, questionType: QuestionType) => void;
  addRandomToss: () => void;
  addManualToss: (bits: readonly boolean[]) => void;
  reset: () => void;
}

interface CastingSessionState {
  phase: AppPhase;
  question: string;
  questionType: QuestionType;
  tosses: CoinToss[];
  interpretation: Interpretation | null;
}

type CastingSessionAction =
  | { type: 'start'; question: string; questionType: QuestionType }
  | { type: 'addToss'; toss: CoinToss }
  | { type: 'reset' };

const initialState: CastingSessionState = {
  phase: 'question',
  question: '',
  questionType: 'general',
  tosses: [],
  interpretation: null
};

function castingSessionReducer(
  state: CastingSessionState,
  action: CastingSessionAction
): CastingSessionState {
  switch (action.type) {
    case 'start':
      return {
        phase: 'casting',
        question: action.question.trim(),
        questionType: action.questionType,
        tosses: [],
        interpretation: null
      };

    case 'addToss': {
      if (state.phase !== 'casting' || state.tosses.length >= 6) {
        return state;
      }

      const tosses = [...state.tosses, action.toss];

      if (tosses.length < 6) {
        return {
          ...state,
          tosses
        };
      }

      const casting = buildCasting(state.question, state.questionType, tosses);

      return {
        ...state,
        phase: 'result',
        tosses,
        interpretation: createInterpretation(casting)
      };
    }

    case 'reset':
      return initialState;
  }
}

export function useCastingSession(): CastingSession {
  const [state, dispatch] = useReducer(castingSessionReducer, initialState);

  const start = useCallback((question: string, questionType: QuestionType) => {
    dispatch({ type: 'start', question, questionType });
  }, []);

  const addRandomToss = useCallback(() => {
    dispatch({ type: 'addToss', toss: tossCoins() });
  }, []);

  const addManualToss = useCallback((bits: readonly boolean[]) => {
    dispatch({ type: 'addToss', toss: tossCoinsWithBits(bits) });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  return useMemo(
    () => ({
      phase: state.phase,
      question: state.question,
      questionType: state.questionType,
      tosses: state.tosses,
      interpretation: state.interpretation,
      currentThrow: Math.min(state.tosses.length + 1, 6),
      start,
      addRandomToss,
      addManualToss,
      reset
    }),
    [addManualToss, addRandomToss, reset, start, state]
  );
}
