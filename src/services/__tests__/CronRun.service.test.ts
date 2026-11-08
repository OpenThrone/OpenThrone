import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

const {
  CRON_LOG_TIMEOUT_MS,
  CRON_RUN_RETENTION_DAYS,
  pruneOldCronRuns,
  sanitizeSummary,
  truncateErrorMessage,
  withCronRunLog,
} = require('@/services/CronRun.service');

describe('withCronRunLog', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.cronRun.create.mockReset();
    mockPrisma.cronRun.update.mockReset();
    mockPrisma.cronRun.deleteMany.mockReset();
  });

  it('records a SUCCESS row with a sanitized summary when the job resolves', async () => {
    mockPrisma.cronRun.create.mockResolvedValue({ id: 41 });
    mockPrisma.cronRun.update.mockResolvedValue({});

    const value = await withCronRunLog('turns', async () => ({
      summary: { processed: 12, failed: 0 },
      extra: 'response data',
    }));

    // Started as RUNNING before the job ran.
    expect(mockPrisma.cronRun.create).toHaveBeenCalledWith({
      data: { job: 'turns', status: 'RUNNING', startedAt: expect.any(Date) },
      select: { id: true },
    });
    expect(mockPrisma.cronRun.update).toHaveBeenCalledTimes(1);
    const update = mockPrisma.cronRun.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 41 });
    expect(update.data.status).toBe('SUCCESS');
    expect(update.data.finishedAt).toBeInstanceOf(Date);
    expect(typeof update.data.durationMs).toBe('number');
    expect(update.data.summary).toEqual({ processed: 12, failed: 0 });
    // The job's return value reaches the caller untouched.
    expect(value.extra).toBe('response data');
  });

  it('records a FAILED row and rethrows when the job throws', async () => {
    mockPrisma.cronRun.create.mockResolvedValue({ id: 42 });
    mockPrisma.cronRun.update.mockResolvedValue({});

    const failure = new Error('turn update exploded');
    await expect(
      withCronRunLog('turns', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    const update = mockPrisma.cronRun.update.mock.calls[0][0];
    expect(update.data.status).toBe('FAILED');
    expect(update.data.error).toBe('turn update exploded');
    expect(update.data.summary).toBeUndefined();
  });

  it('records FAILED when the job returns early with failed: true', async () => {
    mockPrisma.cronRun.create.mockResolvedValue({ id: 43 });
    mockPrisma.cronRun.update.mockResolvedValue({});

    await withCronRunLog('daily', async () => ({
      failed: true,
      summary: { processed: 0 },
    }));

    const update = mockPrisma.cronRun.update.mock.calls[0][0];
    expect(update.data.status).toBe('FAILED');
    expect(update.data.error).toBeUndefined();
    expect(update.data.summary).toEqual({ processed: 0 });
  });

  it('never breaks the job when logging itself fails', async () => {
    mockPrisma.cronRun.create.mockRejectedValue(new Error('db down'));
    mockPrisma.cronRun.update.mockRejectedValue(new Error('db down'));

    const value = await withCronRunLog('bots', async () => ({
      summary: { totalBots: 3 },
    }));

    expect(value.summary).toEqual({ totalBots: 3 });
    expect(mockPrisma.cronRun.update).not.toHaveBeenCalled();
  });

  it('still rethrows the job error when finishing the row also fails', async () => {
    mockPrisma.cronRun.create.mockResolvedValue({ id: 44 });
    mockPrisma.cronRun.update.mockRejectedValue(new Error('db down'));

    await expect(
      withCronRunLog('turns', async () => {
        throw new Error('job failed');
      }),
    ).rejects.toThrow('job failed');
  });
});

describe('sanitizeSummary', () => {
  it('keeps finite numbers, booleans, null and strings, truncating long strings', () => {
    const long = 'x'.repeat(500);
    const result = sanitizeSummary({
      count: 5,
      ratio: 0.25,
      ok: true,
      missing: null,
      label: long,
      notFinite: Number.NaN,
    });
    expect(result).toEqual({
      count: 5,
      ratio: 0.25,
      ok: true,
      missing: null,
      label: `${'x'.repeat(200)}…`,
      notFinite: null,
    });
  });

  it('keeps shallow nested objects and reduces anything deeper or exotic to placeholders', () => {
    const error = new Error('boom');
    const result = sanitizeSummary({
      byAction: { RECRUIT: 2, TRAIN: 1 },
      list: [1, 2],
      deep: { a: { b: { c: 1 } } },
      error,
      big: 10n,
    });
    expect(result.byAction).toEqual({ RECRUIT: 2, TRAIN: 1 });
    expect(result.list).toEqual([1, 2]);
    expect(result.deep).toEqual({ a: { b: '[unserializable]' } });
    expect(result.error).toBe('[unserializable]');
    expect(result.big).toBe('[unserializable]');
  });

  it('caps the number of stored fields', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 50; i++) wide[`field${i}`] = i;
    expect(Object.keys(sanitizeSummary(wide))).toHaveLength(30);
  });
});

describe('truncateErrorMessage', () => {
  it('keeps only the message and truncates it', () => {
    expect(truncateErrorMessage(new Error('a'.repeat(600)))).toBe(
      `${'a'.repeat(500)}…`,
    );
    expect(truncateErrorMessage('plain string')).toBe('plain string');
    expect(truncateErrorMessage(undefined)).toBe('unknown error');
  });

  it('redacts URL credentials and collapses whitespace', () => {
    expect(
      truncateErrorMessage(
        new Error(
          'Invalid call\n\n  connect postgresql://ot:hunter2@db.internal:5432/x failed',
        ),
      ),
    ).toBe(
      'Invalid call connect postgresql://[redacted]@db.internal:5432/x failed',
    );
  });

  it('redacts the whole Authorization value, scheme and token', () => {
    const out = truncateErrorMessage(
      new Error('upstream said Authorization: Bearer synthetic-token'),
    );
    expect(out).toBe('upstream said Authorization: [redacted]');
    expect(truncateErrorMessage('authorization=Basic c3ludGhldGlj')).toBe(
      'authorization=[redacted]',
    );
    expect(
      truncateErrorMessage('Proxy-Authorization: Basic c3ludGhldGlj'),
    ).toBe('Proxy-Authorization: [redacted]');
  });

  it('redacts stray bearer tokens outside a header line', () => {
    expect(truncateErrorMessage('sent Bearer abc.def.ghi to upstream')).toBe(
      'sent Bearer [redacted] to upstream',
    );
  });

  it('redacts Cookie and Set-Cookie header values', () => {
    expect(truncateErrorMessage('Cookie: session=synthetic; theme=dark')).toBe(
      'Cookie: [redacted]',
    );
    expect(
      truncateErrorMessage('Set-Cookie: session=synthetic; HttpOnly; Path=/'),
    ).toBe('Set-Cookie: [redacted]');
  });

  it('redacts credential-like query and key=value parameters', () => {
    const out = truncateErrorMessage(
      'GET https://api.example.test/x?token=t1&page=2&key=k1&access_token=t2&secret=s1&ok=1 failed, password=p1',
    );
    expect(out).toBe(
      'GET https://api.example.test/x?token=[redacted]&page=2&key=[redacted]&access_token=[redacted]&secret=[redacted]&ok=1 failed, password=[redacted]',
    );
    expect(out).not.toMatch(/t1|k1|t2|s1|p1/);
  });

  it('consumes double-quoted, single-quoted and unquoted secret values', () => {
    expect(truncateErrorMessage('bad password="synthetic secret" given')).toBe(
      'bad password=[redacted] given',
    );
    expect(truncateErrorMessage("bad token='synthetic-token' given")).toBe(
      'bad token=[redacted] given',
    );
    expect(truncateErrorMessage('bad password=synthetic-secret given')).toBe(
      'bad password=[redacted] given',
    );
    expect(
      truncateErrorMessage('{"password": "synthetic-secret", "ok": 1}'),
    ).toBe('{"password": [redacted], "ok": 1}');
    expect(truncateErrorMessage("{'key': 'it\\'s-secret'}")).toBe(
      "{'key': [redacted]}",
    );
    expect(truncateErrorMessage('x client_secret: "synthetic" y')).toBe(
      'x client_secret: [redacted] y',
    );
  });

  it('never cuts an unquoted secret short at punctuation', () => {
    for (const value of ['synthetic,secret', 'syn;thetic', 'a}b', "it's"]) {
      expect(truncateErrorMessage(`bad password=${value} given`)).toBe(
        'bad password=[redacted] given',
      );
    }
    expect(truncateErrorMessage('?token=abc,def&next=1')).toBe(
      '?token=[redacted]&next=1',
    );
  });

  it('redacts email addresses', () => {
    expect(
      truncateErrorMessage('no row for player@example.test in users'),
    ).toBe('no row for [email] in users');
  });
});

describe('log writes are bounded (fail-open)', () => {
  const never = () => new Promise(() => {});
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  /** Lets pending microtasks run, fires every armed timeout, then flushes again. */
  const expireTimeouts = async () => {
    await flush();
    vi.advanceTimersByTime(CRON_LOG_TIMEOUT_MS + 1);
    await flush();
  };

  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.cronRun.create.mockReset();
    mockPrisma.cronRun.update.mockReset();
    mockPrisma.cronRun.deleteMany.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the job without waiting for a stalled start insert, then returns past stalled writes', async () => {
    mockPrisma.cronRun.create.mockImplementation(never);
    mockPrisma.cronRun.update.mockImplementation(never);
    const job = vi.fn(async () => ({ summary: { processed: 1 }, value: 'ok' }));

    const pending = withCronRunLog('turns', job);
    // The job starts before any timer fires.
    await flush();
    expect(job).toHaveBeenCalledTimes(1);

    let settled = false;
    pending.then(() => {
      settled = true;
    });
    await expireTimeouts();
    await expireTimeouts();
    expect(settled).toBe(true);
    await expect(pending).resolves.toEqual({
      summary: { processed: 1 },
      value: 'ok',
    });
    // The start never resolved, so there is no row id to update.
    expect(mockPrisma.cronRun.update).not.toHaveBeenCalled();
  });

  it('closes the row with the final status when the start insert lands after the job finished', async () => {
    let resolveInsert: (value: { id: number }) => void = () => {};
    mockPrisma.cronRun.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInsert = resolve;
        }),
    );
    mockPrisma.cronRun.update.mockResolvedValue({});

    const pending = withCronRunLog('turns', async () => ({
      failed: true,
      summary: { processed: 2 },
    }));
    await expireTimeouts();
    await expireTimeouts();
    await pending;
    // The job is done and the caller released; the row id is still unknown.
    expect(mockPrisma.cronRun.update).not.toHaveBeenCalled();

    resolveInsert({ id: 77 });
    await flush();

    expect(mockPrisma.cronRun.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.cronRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 77 },
        data: expect.objectContaining({
          status: 'FAILED',
          summary: { processed: 2 },
        }),
      }),
    );
  });

  it('closes a late row as FAILED with the error when the job threw', async () => {
    let resolveInsert: (value: { id: number }) => void = () => {};
    mockPrisma.cronRun.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInsert = resolve;
        }),
    );
    mockPrisma.cronRun.update.mockResolvedValue({});
    const outcome = withCronRunLog('daily', async () => {
      throw new Error('job broke');
    }).catch((error: Error) => error.message);
    await expireTimeouts();
    await expireTimeouts();
    await expect(outcome).resolves.toBe('job broke');

    resolveInsert({ id: 78 });
    await flush();

    expect(mockPrisma.cronRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 78 },
        data: expect.objectContaining({
          status: 'FAILED',
          error: 'job broke',
        }),
      }),
    );
  });

  it('a late-finish update that fails or stalls never throws', async () => {
    let resolveInsert: (value: { id: number }) => void = () => {};
    mockPrisma.cronRun.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInsert = resolve;
        }),
    );
    mockPrisma.cronRun.update.mockRejectedValue(new Error('db down'));
    const pending = withCronRunLog('turns', async () => ({ value: 1 }));
    await expireTimeouts();
    await expireTimeouts();
    await expect(pending).resolves.toEqual({ value: 1 });

    resolveInsert({ id: 79 });
    await flush();
    expect(mockPrisma.cronRun.update).toHaveBeenCalledTimes(1);
  });

  it('still returns the job result when the finish write stalls', async () => {
    mockPrisma.cronRun.create.mockResolvedValue({ id: 5 });
    mockPrisma.cronRun.update.mockImplementation(never);

    const pending = withCronRunLog('daily', async () => ({ value: 1 }));
    await expireTimeouts();
    await expireTimeouts();
    await expect(pending).resolves.toEqual({ value: 1 });
    expect(mockPrisma.cronRun.update).toHaveBeenCalledTimes(1);
  });

  it('rethrows the job error even when log writes stall', async () => {
    mockPrisma.cronRun.create.mockImplementation(never);
    const pending = withCronRunLog('daily', async () => {
      throw new Error('job broke');
    });
    const outcome = pending.then(
      () => 'resolved',
      (error: Error) => error.message,
    );
    await expireTimeouts();
    await expireTimeouts();
    await expect(outcome).resolves.toBe('job broke');
  });

  it('does not let a stalled prune hold up the caller', async () => {
    mockPrisma.cronRun.deleteMany.mockImplementation(never);
    const pending = pruneOldCronRuns();
    await expireTimeouts();
    await expireTimeouts();
    await expect(pending).resolves.toBe(0);
  });
});

describe('pruneOldCronRuns', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.cronRun.deleteMany.mockReset();
  });

  it('deletes only rows older than the retention window', async () => {
    mockPrisma.cronRun.deleteMany.mockResolvedValue({ count: 4 });
    const now = new Date('2026-10-30T12:00:00.000Z');

    const deleted = await pruneOldCronRuns(now);

    expect(deleted).toBe(4);
    const { where } = mockPrisma.cronRun.deleteMany.mock.calls[0][0];
    const expectedCutoff =
      now.getTime() - CRON_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    expect(where.startedAt.lt.getTime()).toBe(expectedCutoff);
    // A fresh row is far outside the deletion window.
    expect(where.startedAt.lt.getTime()).toBeLessThan(
      now.getTime() - 89 * 24 * 60 * 60 * 1000,
    );
  });

  it('returns 0 instead of throwing when the delete fails', async () => {
    mockPrisma.cronRun.deleteMany.mockRejectedValue(new Error('db down'));
    await expect(pruneOldCronRuns()).resolves.toBe(0);
  });
});
