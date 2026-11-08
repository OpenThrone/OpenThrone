import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  vi,
} from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

const processDailyUpdates = vi.fn();
const processTurnUpdates = vi.fn();
const processAccountStatusUpdates = vi.fn();
const runDailyBotTick = vi.fn();

mock.module('@/services', () => ({
  CronJobService: {
    processDailyUpdates,
    processTurnUpdates,
    processAccountStatusUpdates,
  },
  BotService: { runDailyBotTick },
}));

const runSupporterDaily = vi.fn();

mock.module('@/services/supporter/SupporterDaily.service', () => ({
  runSupporterDaily,
}));

// Passthrough guard: the handlers' own TASK_SECRET/DO_* checks stay live.
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard:
    (_options: any) => (handler: any) => async (req: any, res: any) =>
      handler(req, res, { query: req.query ?? {}, body: req.body }),
}));

const makeResponse = () => {
  const response: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader() {
      return this;
    },
  };
  return response;
};

const SECRET = 'cron-test-secret';

const requireFresh = (path: string) => {
  delete require.cache[require.resolve(path)];
  // eslint-disable-next-line import/no-dynamic-require
  return require(path).default;
};

const turnsHandler = requireFresh('@/pages/api/cronJobs/turns');
const dailyHandler = requireFresh('@/pages/api/cronJobs/daily');
const botsHandler = requireFresh('@/pages/api/cronJobs/bots');
const accountStatusHandler = requireFresh('@/pages/api/cronJobs/accountStatus');

const authorizedRequest = (overrides: Record<string, unknown> = {}) => ({
  method: 'POST',
  headers: { authorization: SECRET },
  query: {},
  ...overrides,
});

describe('cron job handlers record runs', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.cronRun.create.mockReset();
    mockPrisma.cronRun.update.mockReset();
    mockPrisma.cronRun.deleteMany.mockReset();
    mockPrisma.cronRun.create.mockResolvedValue({ id: 7 });
    mockPrisma.cronRun.update.mockResolvedValue({});
    process.env.TASK_SECRET = SECRET;
    process.env.DO_TURN_UPDATES = 'true';
    process.env.DO_DAILY_UPDATES = 'true';
    process.env.DO_BOT_UPDATES = 'true';
    processTurnUpdates.mockReset();
    processAccountStatusUpdates.mockReset();
    processDailyUpdates.mockReset();
    runSupporterDaily.mockReset();
    runDailyBotTick.mockReset();
  });

  afterEach(() => {
    delete process.env.TASK_SECRET;
    delete process.env.DO_TURN_UPDATES;
    delete process.env.DO_DAILY_UPDATES;
    delete process.env.DO_BOT_UPDATES;
  });

  it('records no run when the scheduler secret is wrong', async () => {
    const response = makeResponse();
    await turnsHandler(
      authorizedRequest({ headers: { authorization: 'wrong-secret' } }),
      response,
    );

    expect(response.statusCode).toBe(401);
    expect(mockPrisma.cronRun.create).not.toHaveBeenCalled();
    expect(processTurnUpdates).not.toHaveBeenCalled();
  });

  it('records no run when the job is disabled via its DO_* flag', async () => {
    process.env.DO_TURN_UPDATES = 'false';
    const response = makeResponse();
    await turnsHandler(authorizedRequest(), response);

    expect(response.statusCode).toBe(401);
    expect(mockPrisma.cronRun.create).not.toHaveBeenCalled();
    expect(processTurnUpdates).not.toHaveBeenCalled();
  });

  it('records a SUCCESS row with a summary on a good turn run', async () => {
    processTurnUpdates.mockResolvedValue({
      success: true,
      message: 'Turn updates processed successfully',
      processed: 5,
      failed: 1,
    });
    const response = makeResponse();
    await turnsHandler(authorizedRequest(), response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      message: 'Turn updates processed successfully',
      processed: 5,
      failed: 1,
    });
    expect(mockPrisma.cronRun.create).toHaveBeenCalledWith({
      data: { job: 'turns', status: 'RUNNING', startedAt: expect.any(Date) },
      select: { id: true },
    });
    expect(mockPrisma.cronRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({
          status: 'SUCCESS',
          summary: { processed: 5, failed: 1 },
        }),
      }),
    );
  });

  it('records a FAILED row when the job throws and returns 500', async () => {
    processTurnUpdates.mockRejectedValue(new Error('turn pipeline down'));
    const response = makeResponse();
    await turnsHandler(authorizedRequest(), response);

    expect(response.statusCode).toBe(500);
    expect(mockPrisma.cronRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          error: 'turn pipeline down',
        }),
      }),
    );
  });

  it('records FAILED when the job reports success: false without throwing', async () => {
    processTurnUpdates.mockResolvedValue({
      success: false,
      message: 'Turn cron job failed.',
      processed: 0,
      failed: 3,
    });
    const response = makeResponse();
    await turnsHandler(authorizedRequest(), response);

    expect(response.statusCode).toBe(500);
    expect(mockPrisma.cronRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('logs the daily run with the supporter summary and prunes old rows', async () => {
    processDailyUpdates.mockResolvedValue({
      success: true,
      message: 'Daily updates processed successfully',
      processed: 9,
      failed: 0,
    });
    runSupporterDaily.mockResolvedValue({
      poolsConverted: 1,
      membershipsLapsed: 2,
      reconcile: null,
      billingEnded: 3,
      discordDigests: 4,
      errors: 0,
      failures: [],
    });
    const response = makeResponse();
    await dailyHandler(authorizedRequest(), response);

    expect(response.statusCode).toBe(200);
    expect(response.body.supporter.poolsConverted).toBe(1);
    // The supporter sub-job finishes first and gets its own row.
    expect(
      mockPrisma.cronRun.create.mock.calls.map((c: any) => c[0].data.job),
    ).toEqual(['daily', 'dailySupporter']);
    const supporterUpdate = mockPrisma.cronRun.update.mock.calls[0][0];
    expect(supporterUpdate.data.status).toBe('SUCCESS');
    expect(supporterUpdate.data.summary).toEqual({
      poolsConverted: 1,
      membershipsLapsed: 2,
      billingEnded: 3,
      digestsQueued: 4,
      reconcileApplied: 0,
      reconcileFailed: 0,
      errors: 0,
      failures: [],
    });
    const dailyUpdate = mockPrisma.cronRun.update.mock.calls[1][0];
    expect(dailyUpdate.data.status).toBe('SUCCESS');
    expect(dailyUpdate.data.summary).toEqual({ processed: 9, failed: 0 });
    // Retention rides along with the daily job.
    expect(mockPrisma.cronRun.deleteMany).toHaveBeenCalledWith({
      where: { startedAt: { lt: expect.any(Date) } },
    });
  });

  it('keeps the failed items in the supporter run summary', async () => {
    processDailyUpdates.mockResolvedValue({
      success: true,
      message: 'done',
      processed: 1,
      failed: 0,
    });
    runSupporterDaily.mockResolvedValue({
      poolsConverted: 0,
      membershipsLapsed: 0,
      reconcile: {
        applied: [],
        failed: ['stripe:checkout:cs_1', 'stripe:checkout:cs_2'],
      },
      billingEnded: 0,
      discordDigests: 0,
      errors: 2,
      failures: [
        'reconcile stripe:checkout:cs_1: JWT_SECRET is required',
        'reconcile stripe:checkout:cs_2: JWT_SECRET is required',
      ],
    });
    await dailyHandler(authorizedRequest(), makeResponse());

    const supporterUpdate = mockPrisma.cronRun.update.mock.calls[0][0];
    expect(supporterUpdate.data.status).toBe('FAILED');
    expect(supporterUpdate.data.summary).toMatchObject({
      reconcileFailed: 2,
      errors: 2,
      failures: [
        'reconcile stripe:checkout:cs_1: JWT_SECRET is required',
        'reconcile stripe:checkout:cs_2: JWT_SECRET is required',
      ],
    });
  });

  it('still serves the daily run when the supporter pass fails', async () => {
    processDailyUpdates.mockResolvedValue({
      success: true,
      message: 'Daily updates processed successfully',
      processed: 4,
      failed: 0,
    });
    runSupporterDaily.mockRejectedValue(new Error('stripe unavailable'));
    const response = makeResponse();
    await dailyHandler(authorizedRequest(), response);

    expect(response.statusCode).toBe(200);
    expect(response.body.supporter).toBeNull();
    // The supporter failure is recorded on its own row; the daily run succeeds.
    const supporterUpdate = mockPrisma.cronRun.update.mock.calls[0][0];
    expect(supporterUpdate.data.status).toBe('FAILED');
    expect(supporterUpdate.data.error).toBe('stripe unavailable');
    const dailyUpdate = mockPrisma.cronRun.update.mock.calls[1][0];
    expect(dailyUpdate.data.status).toBe('SUCCESS');
    expect(dailyUpdate.data.summary).toEqual({ processed: 4, failed: 0 });
  });

  it('still prunes old rows when the daily pass throws', async () => {
    processDailyUpdates.mockRejectedValue(new Error('db gone'));
    const response = makeResponse();
    await dailyHandler(authorizedRequest(), response);

    expect(response.statusCode).toBe(500);
    expect(mockPrisma.cronRun.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.cronRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', error: 'db gone' }),
      }),
    );
  });

  it('records the account status run', async () => {
    processAccountStatusUpdates.mockResolvedValue({
      success: true,
      message: 'ok',
      processed: 2,
      failed: 0,
    });
    const response = makeResponse();
    await accountStatusHandler(authorizedRequest(), response);

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.cronRun.create.mock.calls[0][0].data.job).toBe(
      'accountStatus',
    );
    expect(mockPrisma.cronRun.update.mock.calls[0][0].data.summary).toEqual({
      processed: 2,
      failed: 0,
    });
  });

  it('still returns when every run-log write stalls, daily prune included', async () => {
    vi.useFakeTimers();
    try {
      const never = () => new Promise(() => {});
      mockPrisma.cronRun.create.mockImplementation(never);
      mockPrisma.cronRun.update.mockImplementation(never);
      mockPrisma.cronRun.deleteMany.mockImplementation(never);
      processDailyUpdates.mockResolvedValue({
        success: true,
        message: 'done',
        processed: 1,
        failed: 0,
      });
      runSupporterDaily.mockResolvedValue({
        poolsConverted: 0,
        membershipsLapsed: 0,
        reconcile: null,
        billingEnded: 0,
        discordDigests: 0,
        errors: 0,
      });
      const response = makeResponse();
      let finished = false;
      const handled = dailyHandler(authorizedRequest(), response).then(() => {
        finished = true;
      });
      // Each stalled write is abandoned after its own bound; the job runs
      // in between and the handler still responds.
      for (let i = 0; i < 6 && !finished; i++) {
        for (let j = 0; j < 20; j++) await Promise.resolve();
        vi.advanceTimersByTime(2001);
      }
      await handled;
      expect(response.statusCode).toBe(200);
      expect(processDailyUpdates).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives a failing run-log write and still returns the job result', async () => {
    mockPrisma.cronRun.create.mockRejectedValue(new Error('table missing'));
    processTurnUpdates.mockResolvedValue({
      success: true,
      message: 'done',
      processed: 1,
      failed: 0,
    });
    const response = makeResponse();
    await turnsHandler(authorizedRequest(), response);

    expect(response.statusCode).toBe(200);
    expect(response.body.processed).toBe(1);
  });

  it('keeps the bot tick response contract while logging its summary', async () => {
    runDailyBotTick.mockResolvedValue({
      totalBots: 6,
      processedAt: '2026-10-30T00:00:00.000Z',
      byAction: { RECRUIT: 6 },
      byStatus: { OK: 6 },
      durationMs: 12,
      results: [],
    });
    const response = makeResponse();
    await botsHandler(
      authorizedRequest({ query: { schedule: 'cautious' } }),
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.totalBots).toBe(6);
    expect(runDailyBotTick).toHaveBeenCalledWith('cautious');
    const update = mockPrisma.cronRun.update.mock.calls[0][0];
    expect(update.data.summary).toEqual({
      schedule: 'cautious',
      totalBots: 6,
      byAction: { RECRUIT: 6 },
      byStatus: { OK: 6 },
      botDurationMs: 12,
    });
  });
});
