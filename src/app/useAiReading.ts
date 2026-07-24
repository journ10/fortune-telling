// AI 解读副作用钩子（M4）：已配置且六爻成卦（phase === 'result'）时
// 自动请求一次 AI 解读；失败只进入 reading-error，传统结果原样保留，
// 用户可重试。离开结果链路（重新起卦等）或组件卸载时 abort 在途请求，
// AbortError 静默吞掉。

import { useCallback, useEffect, useRef } from 'react';
import { hasCompleteAiSettings, type AiSettings } from '../ai/aiSettings';
import { createAiReading } from '../ai/openaiReading';
import type { CastingPhase } from '../casting/castingMachine';
import type { CastingEvidence } from '../casting/evidence';
import type { AiReading, CastingResult } from '../domain/types';

type AiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, 'ok' | 'status' | 'json' | 'text'>>;

interface UseAiReadingParams {
  phase: CastingPhase;
  result: CastingResult | null;
  evidences: CastingEvidence[];
  aiSettings: AiSettings;
  /** 请求状态机进入 reading；返回 false 表示当前相位不允许，请求不发出。 */
  onStart: () => boolean;
  onFinish: (reading: AiReading) => void;
  onFail: (message: string) => void;
  /** 测试注入用；默认全局 fetch。 */
  fetcher?: AiFetch;
}

export function useAiReading({
  phase,
  result,
  evidences,
  aiSettings,
  onStart,
  onFinish,
  onFail,
  fetcher
}: UseAiReadingParams): { retry: () => void; configured: boolean } {
  const configured = hasCompleteAiSettings(aiSettings);
  const abortRef = useRef<AbortController | null>(null);
  // 每次进入 result 相位只自动触发一次；重试走 retry()。
  const autoTriggeredRef = useRef(false);

  const run = useCallback(() => {
    if (!configured || !result) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!onStart()) {
      abortRef.current = null;
      return;
    }

    createAiReading(
      { result, evidences },
      { ...aiSettings, signal: controller.signal, fetcher }
    ).then(
      (reading) => {
        if (controller.signal.aborted) {
          return;
        }
        onFinish(reading);
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        onFail(error instanceof Error ? error.message : 'AI 解读失败，请稍后重试');
      }
    );
  }, [configured, result, evidences, aiSettings, onStart, onFinish, onFail, fetcher]);

  // 自动触发：已配置 + 成卦结果就绪。
  useEffect(() => {
    if (phase === 'result' && configured && result && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      run();
    }
    if (phase !== 'result' && phase !== 'reading' && phase !== 'reading-ready' && phase !== 'reading-error') {
      autoTriggeredRef.current = false;
    }
  }, [phase, configured, result, run]);

  // 相位离开结果链路（如重新起卦）时中止在途请求。
  useEffect(() => {
    if (phase !== 'result' && phase !== 'reading') {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [phase]);

  // 卸载时中止。
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const retry = useCallback(() => {
    run();
  }, [run]);

  return { retry, configured };
}
