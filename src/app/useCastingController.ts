// React adapter for the casting session: turns pointer/keyboard gestures
// into casting events, owns the in-flight physics simulation, and exposes
// everything the view layer needs. All flow decisions live in
// casting/castingSession — this hook only wires events together.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  canStartCharging,
  type CastingPhase
} from '../casting/castingMachine';
import {
  castingSessionReducer,
  createCastingSessionState,
  type CastingSessionState
} from '../casting/castingSession';
import {
  beginKeyboardCharge,
  cancelKeyboardCharge,
  createKeyboardTossTracker,
  isTossKey,
  sealKeyboardToss,
  summarizeKeyboardEnergy
} from '../input/keyboardToss';
import {
  agitationFromChamber,
  agitationResponseEnergy,
  beginChamberCharge,
  cancelChamberCharge,
  createPointerChamber,
  recordChamberSample,
  sealChamberToss,
  summarizeChamberEnergy
} from '../input/pointerChamber';
import type { PhysicalTossInput } from '../physics/physicalTossInput';
import {
  applyRattleHandoff,
  createCoinTossSimulation,
  createRattleSimulation,
  initTossPhysics,
  type CoinTossSimulation,
  type RattleAgitation,
  type RattleSimulation,
  type SettledToss
} from '../physics/tossSimulation';
import type { AiReading, QuestionType } from '../domain/types';

/** Beat between physical settlement and recording the line, so the user can see the coins rest. */
const SETTLED_DISPLAY_MS = 750;

export interface ActiveToss {
  input: PhysicalTossInput;
  simulation: CoinTossSimulation;
  settledNotified: boolean;
}

/** 蓄势期间的物理摇钱仿真（M5）：agitation 由输入处理器就地更新，RAF 循环逐帧消费。 */
export interface ActiveRattle {
  simulation: RattleSimulation;
  agitation: RattleAgitation;
}

export type ChargeSource = 'pointer' | 'keyboard' | 'motion' | null;

export interface CastingController {
  session: CastingSessionState;
  physicsReady: boolean;
  activeToss: ActiveToss | null;
  /** charging 期间的摇钱仿真；release/cancel/reset 时为 null。 */
  activeRattle: ActiveRattle | null;
  /** 0..1 live charge energy for HUD + coin jitter. */
  chargeEnergy: number;
  /** Which input path owns the current charge. */
  chargeSource: ChargeSource;
  /** Increments on reset so the view can clear rest poses. */
  resetNonce: number;
  phase: CastingPhase;
  handlePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  handlePointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  handlePointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  handlePointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  notifySimulationSettled: (settled: SettledToss) => void;
  /** Motion input path (device shake): begin a charge from an external detector. */
  startExternalCharge: () => boolean;
  /** Update live energy feedback from an external detector. */
  setExternalEnergy: (energy: number) => void;
  /** Release an externally produced PhysicalTossInput into the physics pipeline. */
  releaseExternalToss: (input: PhysicalTossInput) => void;
  /** Abort a charge started by an external detector (e.g. discarded weak shake). */
  cancelExternalCharge: () => void;
  setQuestion: (question: string, questionType: QuestionType) => void;
  /** 请求进入 AI 解读；返回状态机是否接受（仅 result/reading-error/reading-ready 可进入）。 */
  startAiReading: () => boolean;
  /** AI 解读成功，写入结果。 */
  finishAiReading: (reading: AiReading) => void;
  /** AI 解读失败，保留传统结果并可重试。 */
  failAiReading: (message: string) => void;
  resetCasting: () => void;
}

function nextPerturbationSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useCastingController(): CastingController {
  const [session, dispatch] = useReducer(
    castingSessionReducer,
    undefined,
    createCastingSessionState
  );
  const [physicsReady, setPhysicsReady] = useState(false);
  const [activeToss, setActiveToss] = useState<ActiveToss | null>(null);
  const [activeRattle, setActiveRattle] = useState<ActiveRattle | null>(null);
  const [chargeEnergy, setChargeEnergy] = useState(0);
  const [chargeSource, setChargeSource] = useState<ChargeSource>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const chamberRef = useRef(createPointerChamber());
  const keyboardRef = useRef(createKeyboardTossTracker());
  const sessionRef = useRef(session);
  const activeTossRef = useRef<ActiveToss | null>(null);
  const activeRattleRef = useRef<ActiveRattle | null>(null);
  const physicsReadyRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

  sessionRef.current = session;
  activeTossRef.current = activeToss;
  activeRattleRef.current = activeRattle;
  physicsReadyRef.current = physicsReady;

  useEffect(() => {
    let alive = true;
    initTossPhysics().then(() => {
      if (alive) {
        setPhysicsReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      activeTossRef.current?.simulation.dispose();
      activeRattleRef.current?.simulation.dispose();
    },
    []
  );

  const disposeRattle = useCallback(() => {
    activeRattleRef.current?.simulation.dispose();
    setActiveRattle(null);
  }, []);

  const beginCharge = useCallback((): boolean => {
    const current = sessionRef.current;
    if (!physicsReadyRef.current || !canStartCharging(current.machine) || activeTossRef.current) {
      return false;
    }
    dispatch({ type: 'start-charging' });
    // 物理摇钱：charging 期间铜钱在围栏内真实跳动；release 时销毁，
    // 任何时刻只跑一个物理世界。
    setActiveRattle({
      simulation: createRattleSimulation(nextPerturbationSeed()),
      agitation: { x: 0, z: 0, energy: 0 }
    });
    return true;
  }, []);

  const releaseWithInput = useCallback((input: PhysicalTossInput) => {
    // 位姿接力：铜钱当前位置/朝向来自摇钱世界末态，速度仍由 mapper 决定，
    // 松手瞬间不再有视觉跳变；无 rattle（异常路径）保持原行为。
    const rattle = activeRattleRef.current;
    const handoffInput = rattle ? applyRattleHandoff(input, rattle.simulation.snapshot()) : input;
    disposeRattle();
    dispatch({ type: 'release', input: handoffInput });

    const simulation = createCoinTossSimulation(handoffInput);
    setActiveToss({ input: handoffInput, simulation, settledNotified: false });
    dispatch({ type: 'simulation-started' });
    setChargeEnergy(0);
    setChargeSource(null);
  }, [disposeRattle]);

  const cancelCharge = useCallback(() => {
    disposeRattle();
    chamberRef.current = createPointerChamber();
    keyboardRef.current = cancelKeyboardCharge(keyboardRef.current);
    dispatch({ type: 'cancel-charge' });
    setChargeEnergy(0);
    setChargeSource(null);
  }, [disposeRattle]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!physicsReady || event.button !== 0) {
        return;
      }
      if (!beginCharge()) {
        return;
      }

      event.currentTarget.setPointerCapture?.(event.pointerId);
      setChargeSource('pointer');
      chamberRef.current = beginChamberCharge(
        chamberRef.current,
        event.pointerId,
        event.clientX,
        event.clientY,
        event.timeStamp
      );
    },
    [beginCharge, physicsReady]
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const chamber = chamberRef.current;
    if (!chamber.charging || chamber.pointerId !== event.pointerId) {
      return;
    }

    chamberRef.current = recordChamberSample(
      chamber,
      event.pointerId,
      event.clientX,
      event.clientY,
      event.timeStamp
    );

    const rect = event.currentTarget.getBoundingClientRect();
    const summary = summarizeChamberEnergy(
      chamberRef.current,
      rect.width,
      rect.height,
      event.timeStamp
    );
    setChargeEnergy(summary.energy);

    // 摇钱扰动：方向取指针速度，能量过响应曲线（自然摇晃也有明显反馈）。
    const rattle = activeRattleRef.current;
    if (rattle) {
      const agitation = agitationFromChamber(
        chamberRef.current,
        rect.width,
        rect.height,
        event.timeStamp
      );
      rattle.agitation.x = agitation.x;
      rattle.agitation.z = agitation.z;
      rattle.agitation.energy = agitation.energy;
    }
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const sealed = sealChamberToss(chamberRef.current, event.pointerId, {
        currentThrow: sessionRef.current.machine.throwIndex,
        sceneWidth: rect.width,
        sceneHeight: rect.height,
        perturbationSeed: nextPerturbationSeed(),
        timestamp: event.timeStamp
      });

      if (!sealed) {
        return;
      }

      chamberRef.current = sealed.next;
      releaseWithInput(sealed.input);
    },
    [releaseWithInput]
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const next = cancelChamberCharge(chamberRef.current, event.pointerId);

      if (next !== chamberRef.current) {
        chamberRef.current = next;
        cancelCharge();
      }
    },
    [cancelCharge]
  );

  // Keyboard fallback: hold Space/Enter to charge, release to toss.
  useEffect(() => {
    if (!physicsReady) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !isTossKey(event.key) || isEditableTarget(event.target)) {
        return;
      }
      if (!beginCharge()) {
        return;
      }

      event.preventDefault();
      setChargeSource('keyboard');
      keyboardRef.current = beginKeyboardCharge(
        keyboardRef.current,
        event.key,
        event.timeStamp
      );
      setChargeEnergy(0.05);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!isTossKey(event.key)) {
        return;
      }

      const sealed = sealKeyboardToss(keyboardRef.current, event.key, {
        currentThrow: sessionRef.current.machine.throwIndex,
        perturbationSeed: nextPerturbationSeed(),
        timestamp: event.timeStamp
      });

      if (!sealed) {
        return;
      }

      event.preventDefault();
      keyboardRef.current = sealed.next;
      releaseWithInput(sealed.input);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [beginCharge, physicsReady, releaseWithInput]);

  // Live keyboard charge energy while holding the key.
  useEffect(() => {
    if (session.machine.phase !== 'charging' || !keyboardRef.current.charging) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const summary = summarizeKeyboardEnergy(keyboardRef.current, performance.now());
      setChargeEnergy(summary.energy);
      // 键盘无轨迹输入：方向置零，由仿真内部的旋转兜底方向驱动温和扰动。
      const rattle = activeRattleRef.current;
      if (rattle) {
        rattle.agitation.x = 0;
        rattle.agitation.z = 0;
        rattle.agitation.energy = agitationResponseEnergy(summary.energy);
      }
    }, 90);

    return () => window.clearInterval(timer);
  }, [session.machine.phase]);

  const notifySimulationSettled = useCallback((settled: SettledToss) => {
    const current = activeTossRef.current;
    if (!current || current.settledNotified) {
      return;
    }

    current.settledNotified = true;
    dispatch({ type: 'settled', settled });

    settleTimerRef.current = window.setTimeout(() => {
      dispatch({ type: 'line-recorded' });
      current.simulation.dispose();
      setActiveToss((toss) => (toss === current ? null : toss));
    }, SETTLED_DISPLAY_MS);
  }, []);

  const setQuestion = useCallback((question: string, questionType: QuestionType) => {
    dispatch({ type: 'set-question', question, questionType });
  }, []);

  const startAiReading = useCallback((): boolean => {
    const before = sessionRef.current.machine.phase;
    dispatch({ type: 'reading-started' });
    // useReducer dispatch 是同步排队；是否被接受以当前相位判断为准。
    return before === 'result' || before === 'reading-error' || before === 'reading-ready';
  }, []);

  const finishAiReading = useCallback((reading: AiReading) => {
    dispatch({ type: 'reading-finished', reading });
  }, []);

  const failAiReading = useCallback((message: string) => {
    dispatch({ type: 'reading-failed', message });
  }, []);

  const setExternalEnergy = useCallback((energy: number) => {
    const clamped = Math.min(1, Math.max(0, energy));
    setChargeEnergy(clamped);
    const rattle = activeRattleRef.current;
    if (rattle) {
      rattle.agitation.x = 0;
      rattle.agitation.z = 0;
      rattle.agitation.energy = agitationResponseEnergy(clamped);
    }
  }, []);

  const releaseExternalToss = useCallback(
    (input: PhysicalTossInput) => {
      if (sessionRef.current.machine.phase !== 'charging') {
        return;
      }
      releaseWithInput(input);
    },
    [releaseWithInput]
  );

  const startExternalCharge = useCallback((): boolean => {
    if (!beginCharge()) {
      return false;
    }
    setChargeSource('motion');
    return true;
  }, [beginCharge]);

  const resetCasting = useCallback(() => {
    disposeRattle();
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    activeTossRef.current?.simulation.dispose();
    setActiveToss(null);
    chamberRef.current = createPointerChamber();
    keyboardRef.current = createKeyboardTossTracker();
    setChargeEnergy(0);
    setChargeSource(null);
    setResetNonce((nonce) => nonce + 1);
    dispatch({ type: 'reset' });
  }, [disposeRattle]);

  return {
    session,
    physicsReady,
    activeToss,
    activeRattle,
    chargeEnergy,
    chargeSource,
    resetNonce,
    phase: session.machine.phase,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    notifySimulationSettled,
    startExternalCharge,
    setExternalEnergy,
    releaseExternalToss,
    cancelExternalCharge: cancelCharge,
    setQuestion,
    startAiReading,
    finishAiReading,
    failAiReading,
    resetCasting
  };
}
