// useAiReading 副作用测试：全部通过注入 fetcher mock，不发真实请求。

import { cleanup, render, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AiSettings } from '../ai/aiSettings';
import type { CastingPhase } from '../casting/castingMachine';
import { buildCasting, createCoinToss } from '../domain/coinToss';
import { createCastingResult } from '../domain/interpretation';
import type { AiReading, CastingResult } from '../domain/types';
import { useAiReading } from './useAiReading';

const RESULT: CastingResult = createCastingResult(
  buildCasting(
    '今日运势',
    'general',
    [
      ['heads', 'tails', 'tails'],
      ['heads', 'tails', 'tails'],
      ['heads', 'heads', 'heads'],
      ['heads', 'tails', 'tails'],
      ['heads', 'tails', 'tails'],
      ['heads', 'heads', 'tails']
    ].map((faces) => createCoinToss(faces as ['heads' | 'tails', 'heads' | 'tails', 'heads' | 'tails']))
  )
);

const SETTINGS: AiSettings = {
  provider: 'openai',
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini'
};

const READING: AiReading = {
  headline: 'AI：夬卦重在明断',
  plainText: '先稳住，再表态。',
  advice: ['先确认边界']
};

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, 'ok' | 'status' | 'json' | 'text'>>;

interface Spies {
  start: Mock;
  finish: Mock;
  fail: Mock;
}

function Harness({
  phase,
  settings,
  fetcher,
  spies,
  handle
}: {
  phase: CastingPhase;
  settings: AiSettings;
  fetcher: Fetcher;
  spies: Spies;
  handle: { current: { retry: () => void; configured: boolean } | null };
}) {
  const onStart = useCallback(() => {
    spies.start();
    return true;
  }, [spies]);
  const onFinish = useCallback((reading: AiReading) => spies.finish(reading), [spies]);
  const onFail = useCallback((message: string) => spies.fail(message), [spies]);

  handle.current = useAiReading({
    phase,
    result: RESULT,
    evidences: [],
    aiSettings: settings,
    onStart,
    onFinish,
    onFail,
    fetcher
  });

  return null;
}

function makeSpies(): Spies {
  return { start: vi.fn(), finish: vi.fn(), fail: vi.fn() };
}

function okFetcher(reading: AiReading = READING): Fetcher & Mock {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(reading) } }] }),
    text: async () => ''
  }));
}

afterEach(cleanup);

describe('useAiReading', () => {
  it('auto-triggers once when configured and the result phase is reached', async () => {
    const fetcher = okFetcher();
    const spies = makeSpies();
    const handle: { current: { retry: () => void; configured: boolean } | null } = {
      current: null
    };

    const { rerender } = render(
      <Harness phase="result" settings={SETTINGS} fetcher={fetcher} spies={spies} handle={handle} />
    );

    await waitFor(() => expect(spies.finish).toHaveBeenCalledWith(READING));
    expect(spies.start).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(handle.current?.configured).toBe(true);

    // 同相位重渲染不重复触发。
    rerender(
      <Harness phase="result" settings={SETTINGS} fetcher={fetcher} spies={spies} handle={handle} />
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not send any request when settings are incomplete', async () => {
    const fetcher = okFetcher();
    const spies = makeSpies();
    const handle: { current: { retry: () => void; configured: boolean } | null } = {
      current: null
    };

    render(
      <Harness
        phase="result"
        settings={{ ...SETTINGS, apiKey: '' }}
        fetcher={fetcher}
        spies={spies}
        handle={handle}
      />
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetcher).not.toHaveBeenCalled();
    expect(spies.start).not.toHaveBeenCalled();
    expect(handle.current?.configured).toBe(false);
  });

  it('reports HTTP failures through onFail without touching the traditional result', async () => {
    const fetcher: Fetcher & Mock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'server exploded'
    }));
    const spies = makeSpies();

    render(
      <Harness
        phase="result"
        settings={SETTINGS}
        fetcher={fetcher}
        spies={spies}
        handle={{ current: null }}
      />
    );

    await waitFor(() => expect(spies.fail).toHaveBeenCalledWith('server exploded'));
    expect(spies.finish).not.toHaveBeenCalled();
  });

  it('aborts the in-flight request when the phase leaves the result chain', async () => {
    let seenSignal: AbortSignal | null | undefined;
    const fetcher: Fetcher & Mock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Pick<Response, 'ok' | 'status' | 'json' | 'text'>>((_resolve, reject) => {
          seenSignal = init?.signal;
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        })
    );
    const spies = makeSpies();
    const handle: { current: { retry: () => void; configured: boolean } | null } = {
      current: null
    };

    const { rerender } = render(
      <Harness phase="result" settings={SETTINGS} fetcher={fetcher} spies={spies} handle={handle} />
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    rerender(
      <Harness phase="idle" settings={SETTINGS} fetcher={fetcher} spies={spies} handle={handle} />
    );

    await waitFor(() => expect(seenSignal?.aborted).toBe(true));
    // AbortError 静默：不进入失败态。
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spies.fail).not.toHaveBeenCalled();
    expect(spies.finish).not.toHaveBeenCalled();
  });

  it('aborts the in-flight request on unmount', async () => {
    let seenSignal: AbortSignal | null | undefined;
    const fetcher: Fetcher & Mock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      seenSignal = init?.signal;
      return new Promise<Pick<Response, 'ok' | 'status' | 'json' | 'text'>>(() => undefined);
    });
    const spies = makeSpies();

    const { unmount } = render(
      <Harness
        phase="result"
        settings={SETTINGS}
        fetcher={fetcher}
        spies={spies}
        handle={{ current: null }}
      />
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    unmount();
    expect(seenSignal?.aborted).toBe(true);
  });

  it('retries after a failure through the exposed retry function', async () => {
    const fetcher: Fetcher & Mock = vi
      .fn()
      .mockImplementationOnce(async () => ({
        ok: false,
        status: 502,
        json: async () => ({}),
        text: async () => 'bad gateway'
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(READING) } }] }),
        text: async () => ''
      }));
    const spies = makeSpies();
    const handle = { current: null as { retry: () => void; configured: boolean } | null };

    render(
      <Harness phase="result" settings={SETTINGS} fetcher={fetcher} spies={spies} handle={handle} />
    );

    await waitFor(() => expect(spies.fail).toHaveBeenCalledWith('bad gateway'));

    handle.current?.retry();
    await waitFor(() => expect(spies.finish).toHaveBeenCalledWith(READING));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(spies.start).toHaveBeenCalledTimes(2);
  });
});
