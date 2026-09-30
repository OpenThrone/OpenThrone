import { describe, expect, it } from 'bun:test';

import {
  captureLogs,
  getLogSink,
  logDebug,
  logError,
  logInfo,
  setLogLevel,
  setLogSink,
} from './logger';

/** Patches console methods for the duration of fn and records calls. */
async function withConsoleCaptured<T>(
  fn: () => Promise<T> | T,
): Promise<{ calls: string[]; result: T }> {
  const calls: string[] = [];
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    trace: console.trace,
  };
  const record = (first: unknown, ...rest: unknown[]) => {
    calls.push([first, ...rest].map(String).join(' '));
  };
  console.log = record;
  console.info = record;
  console.warn = record;
  console.error = record;
  console.trace = record;
  try {
    const result = await fn();
    return { calls, result };
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    console.trace = original.trace;
  }
}

describe('logger sinks', () => {
  it('captures entries instead of printing while a capture is active', async () => {
    setLogLevel('DEBUG');
    const { logs } = await captureLogs(async () => {
      logDebug('hidden from console', { a: 1 });
      logInfo('also hidden');
      return 42;
    });

    expect(logs.map((entry) => entry.message)).toEqual([
      'hidden from console',
      'also hidden',
    ]);
    expect(logs[0].level).toBe('DEBUG');
    expect(logs[0].params).toEqual([{ a: 1 }]);
  });

  it('suppresses console output during capture and restores it after', async () => {
    setLogLevel('DEBUG');
    const { calls } = await withConsoleCaptured(async () => {
      const { logs } = await captureLogs(() => {
        logDebug('captured only');
      });
      expect(logs).toHaveLength(1);
      logInfo('printed after restore');
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('printed after restore');
  });

  it('respects the active log level inside captures', () => {
    setLogLevel('ERROR');
    const { logs } = captureLogs(() => {
      logDebug('filtered out');
      logError('kept');
    });

    expect(logs.map((entry) => entry.message)).toEqual(['kept']);
    setLogLevel('DEBUG');
  });

  it('routes nested captures to the innermost sink', () => {
    setLogLevel('DEBUG');
    const outer = captureLogs(() => {
      logDebug('outer before');
      const inner = captureLogs(() => {
        logDebug('inner only');
      });
      logDebug('outer after');
      return inner;
    });

    expect(outer.logs.map((entry) => entry.message)).toEqual([
      'outer before',
      'outer after',
    ]);
    expect(outer.result.logs.map((entry: any) => entry.message)).toEqual([
      'inner only',
    ]);
  });

  it('restores the previous sink when fn throws', () => {
    setLogLevel('DEBUG');
    expect(() =>
      captureLogs(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(getLogSink()).toBeNull();
  });

  it('supports setLogSink for persistent structured sinks', () => {
    setLogLevel('DEBUG');
    const entries: unknown[] = [];
    setLogSink((entry) => entries.push(entry));
    try {
      logDebug('to custom sink');
    } finally {
      setLogSink(null);
    }

    expect(getLogSink()).toBeNull();
    expect(entries).toHaveLength(1);
  });
});
