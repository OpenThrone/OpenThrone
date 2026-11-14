/* eslint-disable no-console -- these tests capture and assert on the console
   lines the worker emits as its log stream (wrangler tail); the stubs below
   replace, but never call, the originals. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { installRateLimitStore } from 'test/utils/rateLimitStore';
import { installSessionSpy } from 'test/utils/sessionCookie';
import { silenceLogger } from 'test/utils/silenceLogger';

import {
  CRON_TARGETS,
  dispatchScheduledCron,
  type ExecutionContextLike,
  type ScheduledControllerLike,
  type WorkerCronEnv,
} from '@/lib/workerCron';

installMockPrisma(vi);
silenceLogger();

// The cron endpoints are anonymous (authMode 'none'); the session spy makes
// getServerSession deterministic for a caller with no session at all.
installSessionSpy(vi);

// Real endpoint module; only the service seam is stubbed below so the tick's
// arrival at CronJobService.processTurnUpdates semantics is what's asserted.
const turnsRoute = require('../../../../pages/api/cronJobs/turns').default;
const { CronJobService } = require('@/services/CronJob.service');

const TURN_CRON = '*/30 * * * *';
const TURNS_PATH = '/api/cronJobs/turns';
const WORKER_SECRET = 'synthetic-worker-task-secret-aa';
const ENDPOINT_SECRET = 'synthetic-worker-task-secret-aa';
const WRONG_SECRET = 'synthetic-worker-task-secret-bb'; // same length, wrong value

const initialTaskSecret = process.env.TASK_SECRET;
const initialTurnFlag = process.env.DO_TURN_UPDATES;

/** Spy on the static the endpoint handler calls (same class the route bound). */
const processTurnUpdates = vi
  .spyOn(CronJobService, 'processTurnUpdates')
  .mockResolvedValue({
    success: true,
    message: 'Turn updates completed',
    processed: 42,
    failed: 1,
  });

const makeRes = () => {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: vi.fn(),
    getHeader: vi.fn(() => undefined),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end: vi.fn(),
  };
  return res;
};

type EndpointCall = {
  path: string;
  method?: string;
  authorization?: string;
  status: number;
  body: unknown;
};

/**
 * Fake WORKER_SELF_REFERENCE service binding whose fetch runs the REAL
 * /api/cronJobs/turns handler — the same thing the binding does in production,
 * so a dispatch here proves the whole scheduled() -> endpoint -> service pipe.
 */
const makeSelfReferenceBinding = () => {
  const calls: EndpointCall[] = [];
  const fetch = async (input: RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    // The */30 event also runs account status after turns; only the turns
    // pipe is under test here, so other paths just answer 200.
    if (url.pathname !== TURNS_PATH) return new Response(null, { status: 200 });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const res = makeRes();
    await turnsRoute(
      {
        method: (init?.method ?? 'GET') as string,
        url: url.pathname,
        headers: {
          host: 'localhost:3000',
          authorization: headers.Authorization,
        },
        socket: { remoteAddress: '203.0.113.20' },
        query: {},
        body: {},
      },
      res,
    );
    const call: EndpointCall = {
      path: url.pathname,
      method: init?.method,
      authorization: headers.Authorization,
      status: res.statusCode,
      body: res.body,
    };
    calls.push(call);
    return new Response(null, { status: res.statusCode });
  };
  return { calls, fetch };
};

const makeCtx = (): ExecutionContextLike & { promises: Promise<unknown>[] } => {
  const promises: Promise<unknown>[] = [];
  return {
    waitUntil: (promise: Promise<unknown>) => {
      promises.push(promise);
    },
    promises,
  };
};

/** Capture console output (the Workers log stream) as flat lines. */
const captureConsole = () => {
  const original = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };
  const lines: string[] = [];
  const record = (args: unknown[]) =>
    lines.push(
      args
        .map((arg) => (typeof arg === 'string' ? arg : String(arg)))
        .join(' '),
    );
  console.log = (...args: unknown[]) => record(args);
  console.error = (...args: unknown[]) => record(args);
  console.warn = (...args: unknown[]) => record(args);
  return {
    lines,
    restore: () => {
      console.log = original.log;
      console.error = original.error;
      console.warn = original.warn;
    },
  };
};

const controllerFor = (cron: string): ScheduledControllerLike => ({
  cron,
  scheduledTime: Date.UTC(2026, 9, 13, 4, 0, 30),
});

/** Dispatch one scheduled event through the worker entry path and settle it. */
const dispatch = async (
  env: WorkerCronEnv,
  cron: string = TURN_CRON,
): Promise<{ calls: EndpointCall[]; lines: string[] }> => {
  const binding = makeSelfReferenceBinding();
  const fullEnv: WorkerCronEnv = {
    ...env,
    WORKER_SELF_REFERENCE: { fetch: binding.fetch },
  };
  const ctx = makeCtx();
  const captured = captureConsole();
  try {
    dispatchScheduledCron(controllerFor(cron), fullEnv, ctx);
    await Promise.all(ctx.promises);
  } finally {
    captured.restore();
  }
  return { calls: binding.calls, lines: captured.lines };
};

describe('*/30 cron tick: scheduled() -> /api/cronJobs/turns -> CronJobService.processTurnUpdates', () => {
  beforeEach(() => {
    resetMockPrisma();
    installRateLimitStore(mockPrisma, vi);
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    if (!process.env.NEXTAUTH_SECRET) {
      process.env.NEXTAUTH_SECRET = 'synthetic-session-test-secret';
    }
    process.env.TASK_SECRET = ENDPOINT_SECRET;
    process.env.DO_TURN_UPDATES = 'true';
    processTurnUpdates.mockClear();
    processTurnUpdates.mockResolvedValue({
      success: true,
      message: 'Turn updates completed',
      processed: 42,
      failed: 1,
    });
  });

  afterEach(() => {
    if (initialTaskSecret === undefined) delete process.env.TASK_SECRET;
    else process.env.TASK_SECRET = initialTaskSecret;
    if (initialTurnFlag === undefined) delete process.env.DO_TURN_UPDATES;
    else process.env.DO_TURN_UPDATES = initialTurnFlag;
    delete process.env.NEXTAUTH_URL;
  });

  it('accrues turns: the */30 event is mapped to the turns endpoint, which calls processTurnUpdates once with no arguments and reports its counts', async () => {
    // The mapping this test rides on (also pinned in workerCron.test.ts).
    expect(
      CRON_TARGETS.filter((t) => t.cron === TURN_CRON).map((t) => t.path),
    ).toEqual([
      TURNS_PATH,
      '/api/cronJobs/accountStatus',
      '/api/cronJobs/chatModeration',
    ]);

    const { calls, lines } = await dispatch({ TASK_SECRET: WORKER_SECRET });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: TURNS_PATH,
      method: 'POST',
      authorization: WORKER_SECRET,
      status: 200,
    });
    // The endpoint's 200 body is the service result the route serializes.
    expect(calls[0].body).toEqual({
      message: 'Turn updates completed',
      processed: 42,
      failed: 1,
    });
    // The tick reached the turn-accrual service: exactly once, no arguments.
    expect(processTurnUpdates).toHaveBeenCalledTimes(1);
    expect(processTurnUpdates).toHaveBeenCalledWith();
    expect(lines).toContain(`[scheduled] turn updates (${TURNS_PATH}) ok`);
  });

  it('fails safe when the worker has no TASK_SECRET: no Authorization header is sent, the endpoint guard refuses (401), and no turns accrue', async () => {
    const { calls, lines } = await dispatch({});

    expect(calls).toHaveLength(1);
    expect(calls[0].authorization).toBeUndefined();
    expect(calls[0].status).toBe(401);
    expect(processTurnUpdates).not.toHaveBeenCalled();
    expect(lines).toContain(
      '[scheduled] TASK_SECRET is not set — cron endpoints will refuse the call',
    );
    expect(lines).toContain(
      `[scheduled] turn updates (${TURNS_PATH}) failed: 401`,
    );
  });

  it('refuses a secret mismatch (timing-safe compare) without accruing turns', async () => {
    // Endpoint configured with a different secret than the worker sends.
    const { calls } = await dispatch({ TASK_SECRET: WRONG_SECRET });

    expect(calls[0].authorization).toBe(WRONG_SECRET);
    expect(calls[0].status).toBe(401);
    expect(processTurnUpdates).not.toHaveBeenCalled();
  });

  it('refuses the tick when DO_TURN_UPDATES is off, even with the correct secret', async () => {
    process.env.DO_TURN_UPDATES = 'false';

    const { calls } = await dispatch({ TASK_SECRET: WORKER_SECRET });

    expect(calls[0].status).toBe(401);
    expect(processTurnUpdates).not.toHaveBeenCalled();
  });

  it('maps a 500 to the boundary as a failed tick when the service reports failure', async () => {
    processTurnUpdates.mockResolvedValue({
      success: false,
      message: 'partial failure',
    });

    const { calls, lines } = await dispatch({ TASK_SECRET: WORKER_SECRET });

    expect(processTurnUpdates).toHaveBeenCalledTimes(1);
    expect(calls[0].status).toBe(500);
    expect(calls[0].body).toEqual({ message: 'Turn cron job failed.' });
    expect(lines).toContain(
      `[scheduled] turn updates (${TURNS_PATH}) failed: 500`,
    );
  });

  it('answers 500 (not a crash) when the service throws, and the boundary delivers exactly once — no retry', async () => {
    processTurnUpdates.mockRejectedValue(
      new Error('synthetic turn tick error'),
    );

    const { calls, lines } = await dispatch({ TASK_SECRET: WORKER_SECRET });

    expect(processTurnUpdates).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].status).toBe(500);
    expect(calls[0].body).toEqual({
      message: 'Internal server error during turn cron job.',
    });
    expect(lines).toContain(
      `[scheduled] turn updates (${TURNS_PATH}) failed: 500`,
    );
  });
});
