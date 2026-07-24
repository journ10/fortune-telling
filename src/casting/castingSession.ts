// Six-line casting session: accumulates per-line evidence and builds the
// final traditional result. Pure logic, no React/DOM — the React layer
// only dispatches events and renders this state.
//
// Evidence is created exactly once per line, at `record-line`, from the
// settled physical toss and its originating input. Scoring goes through
// the shared domain rules (createCoinToss), so the session can never
// disagree with physics.

import { buildCasting, createCoinToss } from '../domain/coinToss';
import { createCastingResult } from '../domain/interpretation';
import type { AiReading, CastingResult, CoinToss, QuestionType } from '../domain/types';
import {
  TOTAL_LINES,
  castingMachineReducer,
  createInitialMachineState,
  type CastingMachineEvent,
  type CastingMachineState
} from './castingMachine';
import { createCastingEvidence, type CastingEvidence } from './evidence';

export interface CastingSessionState {
  machine: CastingMachineState;
  question: string;
  questionType: QuestionType;
  /** Completed lines, bottom (line 1) to top. */
  tosses: CoinToss[];
  evidences: CastingEvidence[];
  result: CastingResult | null;
  /** AI 解读结果（reading-ready 时存在）；起卦链路不依赖它。 */
  aiReading: AiReading | null;
  /** AI 解读失败原因（reading-error 时存在），传统结果不受影响。 */
  aiError: string | null;
}

export type CastingSessionEvent =
  | CastingMachineEvent
  | { type: 'reading-finished'; reading: AiReading }
  | { type: 'reading-failed'; message: string }
  | { type: 'set-question'; question: string; questionType: QuestionType };

export function createCastingSessionState(): CastingSessionState {
  return {
    machine: createInitialMachineState(),
    question: '',
    questionType: 'general',
    tosses: [],
    evidences: [],
    result: null,
    aiReading: null,
    aiError: null
  };
}

export function castingSessionReducer(
  state: CastingSessionState,
  event: CastingSessionEvent
): CastingSessionState {
  if (event.type === 'set-question') {
    // The question is an optional overlay on the table; it never blocks casting.
    // 成卦后（含 AI 解读期间）不再允许修改，避免结果与问题脱节。
    if (state.result !== null) {
      return state;
    }
    return { ...state, question: event.question.trim(), questionType: event.questionType };
  }

  if (event.type === 'line-recorded') {
    const { machine } = state;

    // Scoring is only allowed after physical settlement.
    if (machine.phase !== 'settled' || !machine.settled || !machine.input) {
      return state;
    }

    const toss = createCoinToss(machine.settled.faces);
    const evidence = createCastingEvidence(machine.throwIndex, machine.input, machine.settled);
    const tosses = [...state.tosses, toss];
    const evidences = [...state.evidences, evidence];
    const nextMachine = castingMachineReducer(machine, event);

    if (tosses.length < TOTAL_LINES) {
      return { ...state, machine: nextMachine, tosses, evidences };
    }

    const casting = buildCasting(state.question, state.questionType, tosses);

    return {
      ...state,
      machine: nextMachine,
      tosses,
      evidences,
      result: createCastingResult(casting)
    };
  }

  if (event.type === 'reading-started') {
    const nextMachine = castingMachineReducer(state.machine, event);
    if (nextMachine === state.machine) {
      return state;
    }
    return { ...state, machine: nextMachine, aiError: null };
  }

  if (event.type === 'reading-finished' && 'reading' in event) {
    const nextMachine = castingMachineReducer(state.machine, event);
    if (nextMachine === state.machine) {
      return state;
    }
    return { ...state, machine: nextMachine, aiReading: event.reading, aiError: null };
  }

  if (event.type === 'reading-failed' && 'message' in event) {
    const nextMachine = castingMachineReducer(state.machine, event);
    if (nextMachine === state.machine) {
      return state;
    }
    return { ...state, machine: nextMachine, aiError: event.message };
  }

  if (event.type === 'reset') {
    return createCastingSessionState();
  }

  return { ...state, machine: castingMachineReducer(state.machine, event) };
}
