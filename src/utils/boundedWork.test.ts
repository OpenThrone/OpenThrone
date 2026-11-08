import { describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
const logger = require('@/utils/logger');
const {
  BudgetExpiredError,
  createBestEffortRunner,
  createBudget,
  DROP_WARNING_INTERVAL_MS,
  runWithBudget,
  withDbDeadline,
} = require('./boundedWork');

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('createBestEffortRunner', () => {
  it('drops work beyond the concurrency limit instead of queueing it', async () => {
    const runner = createBestEffortRunner('test', 2);
    const gate = deferred();
    const job = vi.fn(() => gate.promise);
    const first = runner.run(job);
    const second = runner.run(job);
    expect(await runner.run(job)).toBe(false); // third is dropped
    expect(job).toHaveBeenCalledTimes(2);
    expect(runner.inflight()).toBe(2);
    gate.resolve();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    // Capacity is released once the jobs settle.
    expect(await runner.run(async () => undefined)).toBe(true);
  });

  it('never rejects: a failing job resolves false', async () => {
    const runner = createBestEffortRunner('test', 1);
    await expect(
      runner.run(async () => {
        throw new Error('boom');
      }),
    ).resolves.toBe(false);
    expect(runner.inflight()).toBe(0);
  });

  it('does not make the caller wait on a stalled job', async () => {
    const runner = createBestEffortRunner('test', 1);
    const gate = deferred();
    const stalled = runner.run(() => gate.promise);
    const outcome = await Promise.race([
      Promise.resolve('caller continued'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 200)),
    ]);
    expect(outcome).toBe('caller continued');
    gate.resolve();
    await stalled;
  });
});

describe('createBestEffortRunner slot ownership', () => {
  it('holds the slot until the job settles, however long it stalls', async () => {
    vi.useFakeTimers();
    try {
      const runner = createBestEffortRunner('test', 1);
      let active = 0;
      let peak = 0;
      const gate = deferred();
      const stuck = runner.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
      });
      vi.advanceTimersByTime(60 * 60 * 1000); // an hour passes
      await Promise.resolve();
      const second = await runner.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        active -= 1;
      });
      expect(second).toBe(false); // still dropped: the first has not settled
      expect(runner.inflight()).toBe(1);
      expect(peak).toBe(1); // never two callbacks running at once
      gate.resolve();
      expect(await stuck).toBe(true);
      expect(await runner.run(async () => undefined)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createBestEffortRunner overload warnings', () => {
  const warnings = () =>
    (logger.logWarn as unknown as { mock: { calls: any[][] } }).mock.calls;

  it('warns on overload, rate-limited to once a minute with the dropped count', async () => {
    let now = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const runner = createBestEffortRunner('Test runner', 1);
      const gate = deferred();
      const busy = runner.run(() => gate.promise);
      await runner.run(async () => undefined); // dropped: first warning, count 1
      expect(warnings()).toHaveLength(1);
      expect(warnings()[0][0]).toContain('Test runner dropped work');
      expect(warnings()[0][1]).toMatchObject({ dropped: 1, limit: 1 });
      now += 10_000;
      await runner.run(async () => undefined);
      await runner.run(async () => undefined);
      expect(warnings()).toHaveLength(1); // silent inside the minute
      now += DROP_WARNING_INTERVAL_MS;
      await runner.run(async () => undefined); // third drop since: count 3
      expect(warnings()).toHaveLength(2);
      expect(warnings()[1][1]).toMatchObject({ dropped: 3 });
      gate.resolve();
      await busy;
      await runner.run(async () => undefined); // ran, not dropped: no warning
      expect(warnings()).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps separate warning clocks per runner', async () => {
    const a = createBestEffortRunner('Runner A', 1);
    const b = createBestEffortRunner('Runner B', 1);
    const gate = deferred();
    const jobs = [a.run(() => gate.promise), b.run(() => gate.promise)];
    await a.run(async () => undefined);
    await b.run(async () => undefined);
    expect(
      warnings().map((call) => String(call[0]).split(' dropped')[0]),
    ).toEqual(['Runner A', 'Runner B']);
    gate.resolve();
    await Promise.all(jobs);
  });
});

describe('withDbDeadline', () => {
  it('sets the statement and lock deadlines before any other statement', async () => {
    const statements: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
        statements.push(strings.join('?'));
        return 0;
      }),
    };
    mockPrisma.$transaction = vi.fn(async (callback: any, options: any) => {
      expect(options.timeout).toBeGreaterThan(1000);
      return callback(tx);
    });
    const result = await withDbDeadline(
      async () => {
        statements.push('work');
        return 'done';
      },
      { statementMs: 1500, lockMs: 300 },
    );
    expect(result).toBe('done');
    expect(statements).toEqual([
      'SET LOCAL statement_timeout = ?',
      'SET LOCAL lock_timeout = ?',
      'work',
    ]);
    const values = tx.$executeRaw.mock.calls.map((call: any[]) =>
      String(call[1].strings ?? call[1].values ?? call[1]),
    );
    expect(values[0]).toContain('1500');
    expect(values[1]).toContain('300');
  });
});

describe('withDbDeadline budget', () => {
  const statementsOf = () => {
    const statements: string[] = [];
    const values: unknown[] = [];
    const tx = {
      $executeRaw: vi.fn(
        async (strings: TemplateStringsArray, ...args: any[]) => {
          statements.push(strings.join('?'));
          values.push(...args.map((a) => String(a.strings ?? a.values ?? a)));
          return 0;
        },
      ),
    };
    mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));
    return { statements, values };
  };

  it('caps the statement and lock deadlines to the time left in the budget', async () => {
    const { values } = statementsOf();
    await withDbDeadline(async () => 'ok', {
      statementMs: 20_000,
      lockMs: 2_000,
      budget: { expired: () => false, remainingMs: () => 300 },
    });
    expect(values[0]).toContain('300');
    expect(values[1]).toContain('300');
  });

  it('starts no query once the budget is spent', async () => {
    const { statements } = statementsOf();
    const fn = vi.fn(async () => 'never');
    await expect(
      withDbDeadline(fn, {
        statementMs: 1000,
        budget: { expired: () => true, remainingMs: () => 0 },
      }),
    ).rejects.toBeInstanceOf(BudgetExpiredError);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
    expect(statements).toEqual([]);
  });

  it('applies the ambient budget to every call made inside runWithBudget', async () => {
    const { values } = statementsOf();
    const budget = { expired: () => false, remainingMs: () => 450 };
    await runWithBudget(budget, async () => {
      await withDbDeadline(async () => 1, { statementMs: 20_000 });
      await Promise.resolve();
      await withDbDeadline(async () => 2, { statementMs: 20_000 });
    });
    expect(values.filter((v) => String(v).includes('450'))).toHaveLength(4);
    // Outside the scope the full deadline applies again.
    await withDbDeadline(async () => 3, { statementMs: 20_000 });
    expect(String(values[values.length - 2])).toContain('20000');
    expect(createBudget(5_000).remainingMs()).toBeLessThanOrEqual(5_000);
  });
});

describe('withDbDeadline re-arms the budget inside the transaction', () => {
  /** A transaction whose statements are recorded in order, SET LOCALs included. */
  const recordingTx = () => {
    const events: string[] = [];
    const tx = {
      $executeRaw: vi.fn(
        async (strings: TemplateStringsArray, ...args: any[]) => {
          events.push(
            `${strings.join('?').trim()} ${args.map((a) => String(a.strings ?? a)).join('')}`,
          );
          return 0;
        },
      ),
      $queryRaw: vi.fn(async () => {
        events.push('query');
        return [];
      }),
      thing: {
        findMany: vi.fn(async () => {
          events.push('thing.findMany');
          return [];
        }),
      },
    };
    return { events, tx };
  };
  const clock = (initial: number) => {
    const state = { remaining: initial };
    return {
      state,
      budget: {
        expired: () => state.remaining <= 0,
        remainingMs: () => state.remaining,
      },
    };
  };

  it('re-checks the budget once the connection is held', async () => {
    const { events, tx } = recordingTx();
    const { state, budget } = clock(5_000);
    // Waiting for a pooled connection eats the whole budget.
    mockPrisma.$transaction = vi.fn(async (callback: any) => {
      state.remaining = 0;
      return callback(tx);
    });
    const fn = vi.fn(async () => 'ran');
    await expect(
      withDbDeadline(fn, { statementMs: 20_000, budget }),
    ).rejects.toBeInstanceOf(BudgetExpiredError);
    expect(fn).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('re-issues the deadline from the time left before each statement', async () => {
    const { events, tx } = recordingTx();
    const { state, budget } = clock(5_000);
    mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));
    await withDbDeadline(
      async (db) => {
        await db.$queryRaw`SELECT 1`;
        state.remaining = 800; // the first read was slow
        await db.$queryRaw`SELECT 2`;
        state.remaining = 120;
        await db.thing.findMany();
      },
      { statementMs: 20_000, lockMs: 2_000, budget },
    );
    const timeouts = events.filter((e) =>
      e.startsWith('SET LOCAL statement_timeout'),
    );
    expect(timeouts.map((e) => e.replace(/\D+/g, ''))).toEqual([
      '5000', // arming at transaction start
      '5000', // before SELECT 1
      '800', // before SELECT 2
      '120', // before thing.findMany
    ]);
    const order = events.filter((e) => e === 'query' || e === 'thing.findMany');
    expect(order).toEqual(['query', 'query', 'thing.findMany']);
  });

  it('runs no statement after the budget is spent mid-transaction', async () => {
    const { events, tx } = recordingTx();
    const { state, budget } = clock(5_000);
    mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));
    await expect(
      withDbDeadline(
        async (db) => {
          await db.$queryRaw`SELECT 1`;
          state.remaining = 0;
          await db.$queryRaw`SELECT 2`;
          await db.thing.findMany();
        },
        { statementMs: 20_000, budget },
      ),
    ).rejects.toBeInstanceOf(BudgetExpiredError);
    expect(events.filter((e) => e === 'query')).toHaveLength(1);
    expect(events).not.toContain('thing.findMany');
  });

  it('serializes concurrent statements: the second is armed after the first finishes', async () => {
    const events: string[] = [];
    const { state, budget } = clock(100);
    const tx = {
      $executeRaw: vi.fn(
        async (strings: TemplateStringsArray, ...args: any[]) => {
          events.push(
            `${strings.join('?').trim()} ${args.map((a) => String(a.strings ?? a)).join('')}`,
          );
          return 0;
        },
      ),
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        events.push(`start ${sql}`);
        if (sql.includes('slow')) state.remaining = 20; // 80 ms of the budget go here
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`end ${sql}`);
        return [];
      }),
    };
    mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));
    await withDbDeadline(
      async (db) => {
        await Promise.all([db.$queryRaw`slow`, db.$queryRaw`fast`]);
      },
      { statementMs: 20_000, lockMs: 2_000, budget },
    );
    // The fast statement did not start until the slow one ended, and was
    // armed from the 20 ms left then, not the 100 ms left when it was issued.
    expect(events.indexOf('start fast')).toBeGreaterThan(
      events.indexOf('end slow'),
    );
    const timeouts = events.filter((e) =>
      e.startsWith('SET LOCAL statement_timeout'),
    );
    expect(timeouts.map((e) => e.replace(/\D+/g, ''))).toEqual([
      '100', // arming at transaction start
      '100', // before slow
      '20', // before fast, after slow spent the budget
    ]);
  });

  it('refuses a concurrent statement once the earlier one spent the budget', async () => {
    const ran: string[] = [];
    const { state, budget } = clock(100);
    const tx = {
      $executeRaw: vi.fn(async () => 0),
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        ran.push(strings.join('?'));
        state.remaining = 0;
        return [];
      }),
    };
    mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));
    const results = await withDbDeadline(
      (db) => Promise.allSettled([db.$queryRaw`first`, db.$queryRaw`second`]),
      { statementMs: 20_000, budget },
    );
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(
      BudgetExpiredError,
    );
    expect(ran).toEqual(['first']);
  });

  it('leaves transactions without a budget untouched', async () => {
    const { events, tx } = recordingTx();
    mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));
    await withDbDeadline(
      async (db) => {
        await db.$queryRaw`SELECT 1`;
        await db.$queryRaw`SELECT 2`;
      },
      { statementMs: 20_000 },
    );
    expect(
      events.filter((e) => e.startsWith('SET LOCAL statement_timeout')),
    ).toHaveLength(1);
  });
});
