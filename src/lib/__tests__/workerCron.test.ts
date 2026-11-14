/* eslint-disable no-console -- these tests capture and assert on the console
   lines the worker emits as its log stream (wrangler tail); the stubs below
   replace, but never call, the originals. */
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import {
  CRON_TARGETS,
  type CronFetchLike,
  type CronTargetResult,
  dispatchScheduledCron,
  type ExecutionContextLike,
  isOtMidnight,
  OT_CRON_TIME_ZONE,
  runCronTargets,
  type ScheduledControllerLike,
  type WorkerCronEnv,
} from '@/lib/workerCron';
import { OT_TIME_ZONE } from '@/utils/timefunctions';

/**
 * Cron-boundary contract tests for the extracted worker fan-out
 * (src/lib/workerCron.ts, delegated to by worker.ts's `scheduled()`).
 *
 * The boundary's job is routing only: deliver each scheduled event to its
 * endpoint exactly once, sequentially, with the raw TASK_SECRET header.
 * Everything protective lives downstream and these test names say so:
 * - enable-flag gating (DO_*) is the endpoints' isAuthorizedTaskRequest
 *   (src/pages/api/cronJobs/*), answering 401 when off;
 * - retry/dedup must NOT happen here — a redelivered event is dispatched
 *   again, and idempotency is enforced per user under FOR UPDATE row locks
 *   in CronJob.service.ts (pinned by
 *   src/services/__tests__/cronJob.concurrency.test.ts).
 */

const TASK_SECRET = 'test-task-secret';
const BASE_URL = 'https://cron.openthrone.internal';

/** Enable flag each real endpoint checks (see src/pages/api/cronJobs/*). */
const ENDPOINT_ENABLE_FLAG: Record<string, string> = {
  '/api/cronJobs/turns': 'DO_TURN_UPDATES',
  '/api/cronJobs/daily': 'DO_DAILY_UPDATES',
  '/api/cronJobs/bots': 'DO_BOT_UPDATES',
  // accountStatus deliberately shares the turns flag (accountStatus.ts:39).
  '/api/cronJobs/accountStatus': 'DO_TURN_UPDATES',
  // chatModeration also shares the turns flag; it is a no-op until the
  // moderation.shadowEnabled runtime setting is on.
  '/api/cronJobs/chatModeration': 'DO_TURN_UPDATES',
};

const ALL_FLAGS_ON: Record<string, boolean> = Object.fromEntries(
  Object.values(ENDPOINT_ENABLE_FLAG).map((flag) => [flag, true]),
);

/**
 * The expected cron → endpoint routes. The cron expressions are cross-checked
 * against the real wrangler.jsonc `triggers.crons` below, so this suite fails
 * when the config and the dispatch table drift apart.
 */
const EXPECTED_CRON_ROUTES: ReadonlyArray<{ cron: string; path: string }> = [
  { cron: '*/30 * * * *', path: '/api/cronJobs/turns' },
  { cron: '*/30 * * * *', path: '/api/cronJobs/accountStatus' },
  { cron: '*/30 * * * *', path: '/api/cronJobs/chatModeration' },
  { cron: '0 4 * * *', path: '/api/cronJobs/daily' },
  { cron: '0 5 * * *', path: '/api/cronJobs/daily' },
  { cron: '30 4 * * *', path: '/api/cronJobs/bots' },
];

const uniqueCrons = (routes: ReadonlyArray<{ cron: string }>): string[] => [
  ...new Set(routes.map((r) => r.cron)),
];

// A scheduled time at which each daily trigger is OT (New York) midnight:
// 04:00 UTC in summer (EDT), 05:00 UTC in winter (EST).
const SUMMER_04_UTC = Date.UTC(2026, 9, 13, 4, 0, 0);
const WINTER_05_UTC = Date.UTC(2026, 10, 12, 5, 0, 0);

// First "crons" block in wrangler.jsonc is the top-level (production) one;
// the preview environment's block is `[]` by design.
const wranglerCrons: string[] = (() => {
  const config = readFileSync(
    new URL('../../../wrangler.jsonc', import.meta.url),
    'utf8',
  );
  const block = config.match(/"crons"\s*:\s*\[([^\]]*)\]/);
  return [...(block?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
})();

type EndpointCall = {
  url: string;
  init?: RequestInit;
  /** True when the endpoint's guard passed and the job ran to completion. */
  didWork: boolean;
};

type FakeEndpointOptions = {
  flags?: Record<string, boolean>;
  /** Per-path fault injection: an HTTP failure status or a thrown error. */
  faults?: Record<string, { status: number } | { error: Error }>;
};

/**
 * Fake of the WORKER_SELF_REFERENCE service binding whose endpoints mirror
 * the real guard contract: 401 unless the endpoint's enable flag is on AND
 * the Authorization header equals the raw TASK_SECRET. Records every
 * invocation so tests can count deliveries.
 */
const makeFakeEndpoints = (options: FakeEndpointOptions = {}) => {
  const calls: EndpointCall[] = [];
  const fetch: CronFetchLike = (input, init) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const call: EndpointCall = { url, init, didWork: false };
    calls.push(call);

    const flag = ENDPOINT_ENABLE_FLAG[path];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (!options.flags?.[flag] || headers.Authorization !== TASK_SECRET) {
      return Promise.resolve(new Response(null, { status: 401 }));
    }

    const fault = options.faults?.[path];
    if (fault && 'error' in fault) {
      return Promise.reject(fault.error);
    }
    call.didWork = !fault;
    return Promise.resolve(
      new Response(null, { status: fault ? fault.status : 200 }),
    );
  };
  return { calls, fetch };
};

const makeEnv = (
  fetch: CronFetchLike,
  taskSecret: string = TASK_SECRET,
): WorkerCronEnv => ({
  TASK_SECRET: taskSecret,
  WORKER_SELF_REFERENCE: { fetch },
});

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

const controllerFor = (
  cron: string,
  scheduledTime = cron === '0 5 * * *' ? WINTER_05_UTC : SUMMER_04_UTC,
): ScheduledControllerLike => ({ cron, scheduledTime });

describe('workerCron dispatch (cron boundary)', () => {
  test('every cron expression declared in wrangler.jsonc maps to exactly one endpoint invocation — POSTed to the right path with the raw TASK_SECRET Authorization header (enable-flag check lives in the endpoints)', async () => {
    expect(wranglerCrons).toEqual(uniqueCrons(EXPECTED_CRON_ROUTES));
    expect(uniqueCrons(CRON_TARGETS)).toEqual(wranglerCrons);
    expect(CRON_TARGETS.map(({ cron, path }) => ({ cron, path }))).toEqual(
      EXPECTED_CRON_ROUTES,
    );

    const captured = captureConsole();
    try {
      for (const cron of uniqueCrons(EXPECTED_CRON_ROUTES)) {
        const expectedPaths = EXPECTED_CRON_ROUTES.filter(
          (r) => r.cron === cron,
        ).map((r) => r.path);
        const endpoints = makeFakeEndpoints({ flags: ALL_FLAGS_ON });
        const ctx = makeCtx();

        dispatchScheduledCron(
          controllerFor(cron),
          makeEnv(endpoints.fetch),
          ctx,
        );
        await Promise.all(ctx.promises);

        // Sequential, in table order (turns before account status).
        expect(endpoints.calls.map((c) => c.url)).toEqual(
          expectedPaths.map((path) => `${BASE_URL}${path}`),
        );
        for (const call of endpoints.calls) {
          expect(call.init?.method).toBe('POST');
          // Raw secret, no Bearer prefix — the header contract the endpoints'
          // timingSafeEqual check expects (turns.ts:15-33).
          expect(call.init?.headers).toEqual({ Authorization: TASK_SECRET });
          expect(call.didWork).toBe(true);
        }
      }
    } finally {
      captured.restore();
    }
  });

  test('a missing TASK_SECRET fails safe: no Authorization header is sent, the delivery still completes without throwing, and the endpoint guard refuses it (401)', async () => {
    const endpoints = makeFakeEndpoints({ flags: ALL_FLAGS_ON });
    const ctx = makeCtx();
    const captured = captureConsole();
    try {
      dispatchScheduledCron(
        controllerFor('*/30 * * * *'),
        { WORKER_SELF_REFERENCE: { fetch: endpoints.fetch } },
        ctx,
      );
      await Promise.all(ctx.promises);
    } finally {
      captured.restore();
    }

    // Identical to the previous inline worker.ts behavior: the boundary does
    // not skip the call, it just sends no credential — refusal is downstream.
    expect(endpoints.calls).toHaveLength(3);
    for (const call of endpoints.calls) {
      expect(call.init?.headers).toEqual({});
      expect(call.didWork).toBe(false);
    }
    expect(captured.lines).toContain(
      '[scheduled] TASK_SECRET is not set — cron endpoints will refuse the call',
    );
    expect(captured.lines).toContain(
      '[scheduled] turn updates (/api/cronJobs/turns) failed: 401',
    );
    expect(captured.lines).toContain(
      '[scheduled] account status maintenance (/api/cronJobs/accountStatus) failed: 401',
    );
  });

  test('one endpoint failing (HTTP 500 or a thrown fetch error) does not prevent the others in the sequential fan-out', async () => {
    const endpoints = makeFakeEndpoints({
      flags: ALL_FLAGS_ON,
      faults: {
        '/api/cronJobs/daily': { status: 500 },
        '/api/cronJobs/bots': { error: new Error('bot tick exploded') },
      },
    });

    const captured = captureConsole();
    try {
      const results = await runCronTargets(
        CRON_TARGETS,
        makeEnv(endpoints.fetch),
      );

      // Every endpoint was still reached exactly once, in table order.
      expect(endpoints.calls.map((call) => new URL(call.url).pathname)).toEqual(
        CRON_TARGETS.map((t) => t.path),
      );
      expect(results.map((r) => r.target.path)).toEqual(
        CRON_TARGETS.map((t) => t.path),
      );
      expect(
        results.find((r) => r.target.path === '/api/cronJobs/turns'),
      ).toMatchObject({ ok: true, status: 200 });
      expect(
        results.find((r) => r.target.path === '/api/cronJobs/daily'),
      ).toMatchObject({ ok: false, status: 500 });
      const botResult = results.find(
        (r) => r.target.path === '/api/cronJobs/bots',
      );
      expect(botResult?.ok).toBe(false);
      expect(botResult?.status).toBeNull();
      expect((botResult?.error as Error)?.message).toBe('bot tick exploded');
      expect(
        results.find((r) => r.target.path === '/api/cronJobs/accountStatus'),
      ).toMatchObject({ ok: true, status: 200 });
      // Failure log lines are per target; the loop keeps going regardless.
      expect(captured.lines).toContain(
        '[scheduled] daily updates (/api/cronJobs/daily) failed: 500',
      );
      expect(captured.lines).toContain(
        '[scheduled] bot tick (/api/cronJobs/bots) threw Error: bot tick exploded',
      );
    } finally {
      captured.restore();
    }
  });

  test('the same scheduledFor event delivered twice results in exactly two endpoint invocations (one per delivery): the boundary neither retries nor deduplicates — idempotency lives downstream under FOR UPDATE row locks in CronJob.service.ts', async () => {
    const endpoints = makeFakeEndpoints({ flags: ALL_FLAGS_ON });
    const ctx = makeCtx();
    const controller = controllerFor('0 4 * * *');
    const captured = captureConsole();
    try {
      // Cloudflare redelivering the identical event (same cron +
      // scheduledTime).
      dispatchScheduledCron(controller, makeEnv(endpoints.fetch), ctx);
      dispatchScheduledCron(controller, makeEnv(endpoints.fetch), ctx);
      await Promise.all(ctx.promises);
    } finally {
      captured.restore();
    }

    expect(endpoints.calls).toHaveLength(2);
    for (const call of endpoints.calls) {
      expect(call.url).toBe(`${BASE_URL}/api/cronJobs/daily`);
      expect(call.init?.headers).toEqual({ Authorization: TASK_SECRET });
      // Both deliveries ran the job — deduplication is NOT this module's job.
      expect(call.didWork).toBe(true);
    }
  });

  test('a failed endpoint response is delivered exactly once — no retry at the cron boundary (the next scheduled tick is the retry)', async () => {
    const endpoints = makeFakeEndpoints({
      flags: ALL_FLAGS_ON,
      faults: { '/api/cronJobs/turns': { status: 502 } },
    });
    const ctx = makeCtx();
    const captured = captureConsole();
    try {
      dispatchScheduledCron(
        controllerFor('*/30 * * * *'),
        makeEnv(endpoints.fetch),
        ctx,
      );
      await Promise.all(ctx.promises);
    } finally {
      captured.restore();
    }

    // Turns failed once and was not retried; account status and chat moderation still ran.
    const turnsCalls = endpoints.calls.filter(
      (c) => new URL(c.url).pathname === '/api/cronJobs/turns',
    );
    expect(turnsCalls).toHaveLength(1);
    expect(turnsCalls[0].didWork).toBe(false);
    expect(endpoints.calls.map((c) => new URL(c.url).pathname)).toEqual([
      '/api/cronJobs/turns',
      '/api/cronJobs/accountStatus',
      '/api/cronJobs/chatModeration',
    ]);
  });

  test('disabled enable-flags skip their endpoint work (401 Unauthorized or Disabled Task) while the boundary still delivers exactly once and records the refusal', async () => {
    const allOff = Object.fromEntries(
      Object.values(ENDPOINT_ENABLE_FLAG).map((flag) => [flag, false]),
    );
    const captured = captureConsole();
    try {
      for (const route of EXPECTED_CRON_ROUTES) {
        const endpoints = makeFakeEndpoints({ flags: allOff });
        const results = await runCronTargets(
          CRON_TARGETS.filter(
            (t) => t.cron === route.cron && t.path === route.path,
          ),
          makeEnv(endpoints.fetch),
        );

        expect(endpoints.calls).toHaveLength(1);
        expect(endpoints.calls[0].didWork).toBe(false);
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ ok: false, status: 401 });
      }
    } finally {
      captured.restore();
    }
  });

  test('each endpoint skips only when its own flag is off (accountStatus shares DO_TURN_UPDATES with turns)', async () => {
    const captured = captureConsole();
    try {
      for (const route of EXPECTED_CRON_ROUTES) {
        const flags = {
          ...ALL_FLAGS_ON,
          [ENDPOINT_ENABLE_FLAG[route.path]]: false,
        };
        const endpoints = makeFakeEndpoints({ flags });
        const results = await runCronTargets(
          CRON_TARGETS,
          makeEnv(endpoints.fetch),
        );
        const byPath = new Map(
          results.map((r) => [r.target.path as string, r] as const),
        );

        expect(byPath.get(route.path)).toMatchObject({
          ok: false,
          status: 401,
        });
        expect(
          endpoints.calls.find((c) => c.url === `${BASE_URL}${route.path}`)!
            .didWork,
        ).toBe(false);

        // Endpoints behind a different flag are unaffected.
        for (const other of EXPECTED_CRON_ROUTES) {
          if (
            ENDPOINT_ENABLE_FLAG[other.path] ===
            ENDPOINT_ENABLE_FLAG[route.path]
          )
            continue;
          expect(byPath.get(other.path)).toMatchObject({
            ok: true,
            status: 200,
          });
        }
      }
    } finally {
      captured.restore();
    }
  });

  test('an unmapped cron expression logs the no-route warning and dispatches nothing', async () => {
    const endpoints = makeFakeEndpoints({ flags: ALL_FLAGS_ON });
    const ctx = makeCtx();
    const captured = captureConsole();
    try {
      dispatchScheduledCron(
        controllerFor('15 3 * * *'),
        makeEnv(endpoints.fetch),
        ctx,
      );
    } finally {
      captured.restore();
    }

    expect(endpoints.calls).toHaveLength(0);
    expect(ctx.promises).toHaveLength(0);
    expect(captured.lines).toContain(
      '[scheduled] no route mapped for cron "15 3 * * *"',
    );
  });

  test('a missing WORKER_SELF_REFERENCE binding is reported per target without throwing', async () => {
    const captured = captureConsole();
    try {
      const results: CronTargetResult[] = await runCronTargets(
        CRON_TARGETS.filter((t) => t.path === '/api/cronJobs/turns'),
        { TASK_SECRET },
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ ok: false, status: null });
      expect(captured.lines).toContain(
        '[scheduled] turn updates (/api/cronJobs/turns) failed: WORKER_SELF_REFERENCE binding missing',
      );
    } finally {
      captured.restore();
    }
  });

  test('daily runs only on the trigger that is midnight in New York: 04:00 UTC in summer, 05:00 UTC in winter', async () => {
    const cases = [
      { cron: '0 4 * * *', time: SUMMER_04_UTC, runs: true },
      { cron: '0 5 * * *', time: Date.UTC(2026, 9, 13, 5, 0, 0), runs: false },
      { cron: '0 5 * * *', time: WINTER_05_UTC, runs: true },
      { cron: '0 4 * * *', time: Date.UTC(2026, 10, 12, 4, 0, 0), runs: false },
    ];
    const captured = captureConsole();
    try {
      for (const { cron, time, runs } of cases) {
        const endpoints = makeFakeEndpoints({ flags: ALL_FLAGS_ON });
        const ctx = makeCtx();
        dispatchScheduledCron(
          controllerFor(cron, time),
          makeEnv(endpoints.fetch),
          ctx,
        );
        await Promise.all(ctx.promises);
        expect(endpoints.calls.map((c) => new URL(c.url).pathname)).toEqual(
          runs ? ['/api/cronJobs/daily'] : [],
        );
        expect(ctx.promises).toHaveLength(runs ? 1 : 0);
      }
    } finally {
      captured.restore();
    }
    expect(captured.lines).toContain(
      '[scheduled] daily updates (/api/cronJobs/daily) skipped: not midnight in America/New_York',
    );
  });

  test('isOtMidnight follows daylight saving time and the cron time zone matches the game clock', () => {
    expect(OT_CRON_TIME_ZONE).toBe(OT_TIME_ZONE);
    expect(isOtMidnight(SUMMER_04_UTC)).toBe(true);
    expect(isOtMidnight(WINTER_05_UTC)).toBe(true);
    expect(isOtMidnight(Date.UTC(2026, 10, 12, 4, 0, 0))).toBe(false);
    // 2026-03-08 is the spring-forward day: midnight is still EST (05:00 UTC).
    expect(isOtMidnight(Date.UTC(2026, 2, 8, 5, 0, 0))).toBe(true);
    // 2026-11-01 is the fall-back day: midnight is still EDT (04:00 UTC).
    expect(isOtMidnight(Date.UTC(2026, 10, 1, 4, 0, 0))).toBe(true);
  });
});
