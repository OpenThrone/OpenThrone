/**
 * Cron Trigger fan-out for the Cloudflare Worker entry (`worker.ts`).
 *
 * Extracted verbatim from worker.ts so the dispatch contract is unit-testable
 * without a real service binding (see `src/lib/__tests__/workerCron.test.ts`):
 * dependencies (a fetch-like function, the Worker env bindings, and the cron
 * event info) are injected, and per-endpoint results are returned. worker.ts
 * delegates here; external behavior must stay identical — same env names
 * (`WORKER_SELF_REFERENCE`, `TASK_SECRET`), same raw-secret Authorization
 * header, same log lines, same error handling.
 *
 * Boundary contract (deliberate): this module does NOT retry, deduplicate,
 * or otherwise filter deliveries — the same scheduled event delivered twice
 * produces one endpoint invocation per delivery. Enable-flag gating
 * (`DO_TURN_UPDATES` etc. + `TASK_SECRET`, returning 401) lives in the
 * endpoints under `src/pages/api/cronJobs/`, and idempotency lives further
 * downstream under per-user `FOR UPDATE` row locks in
 * `src/services/CronJob.service.ts`.
 *
 * Cadence mapping, matching the production host's crontab it replaces:
 * turns and then account status every 30 minutes (keep turns aligned with
 * TURN_INTERVAL_MINUTES), and daily at midnight OT time (America/New_York),
 * the game-day boundary players are told about ("every day at midnight OT
 * time"). Cron Triggers run on UTC, and New York midnight is 05:00 UTC in
 * winter and 04:00 UTC in summer, so daily is triggered at both and runs only
 * on the one that is midnight in New York. Bots stay at 04:30 UTC.
 */

/** OT time zone; must match OT_TIME_ZONE in src/utils/timefunctions.ts. */
export const OT_CRON_TIME_ZONE = 'America/New_York';

export type CronTarget = {
  readonly cron: string;
  readonly path: string;
  readonly label: string;
  /** Run only when the scheduled time is midnight (hour 0) in OT time. */
  readonly otMidnightOnly?: boolean;
};

/**
 * Must stay in sync with `wrangler.jsonc` `triggers.crons`: the fan-out
 * matches targets by exact string equality on the cron expression.
 */
export const CRON_TARGETS: readonly CronTarget[] = [
  { cron: '*/30 * * * *', path: '/api/cronJobs/turns', label: 'turn updates' },
  {
    cron: '*/30 * * * *',
    path: '/api/cronJobs/accountStatus',
    label: 'account status maintenance',
  },
  {
    cron: '*/30 * * * *',
    path: '/api/cronJobs/chatModeration',
    label: 'shadow chat moderation',
  },
  {
    cron: '0 4 * * *',
    path: '/api/cronJobs/daily',
    label: 'daily updates',
    otMidnightOnly: true,
  },
  {
    cron: '0 5 * * *',
    path: '/api/cronJobs/daily',
    label: 'daily updates',
    otMidnightOnly: true,
  },
  { cron: '30 4 * * *', path: '/api/cronJobs/bots', label: 'bot tick' },
];

/** True when `time` falls in the midnight hour (00:xx) in OT time. */
export const isOtMidnight = (time: number): boolean => {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: OT_CRON_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  })
    .formatToParts(new Date(time))
    .find((part) => part.type === 'hour')?.value;
  // ICU renders the midnight hour as "00" (and "24" under some cycles).
  return Number(hour) % 24 === 0;
};

/** Fetch signature of a Workers service binding, injectable for tests. */
export type CronFetchLike = (
  input: RequestInfo,
  init?: RequestInit,
) => Promise<Response>;

/** Subset of the Worker env the cron fan-out reads. */
export type WorkerCronEnv = {
  WORKER_SELF_REFERENCE?: {
    fetch: CronFetchLike;
  };
  TASK_SECRET?: string;
};

/** Fields of Cloudflare's ScheduledController/event the dispatch uses. */
export interface ScheduledControllerLike {
  readonly cron: string;
  readonly scheduledTime: number;
}

export interface ExecutionContextLike {
  waitUntil: (promise: Promise<unknown>) => void;
}

/** Per-endpoint outcome of one fan-out run. */
export type CronTargetResult = {
  readonly target: CronTarget;
  /** True only for an ok (2xx) endpoint response. */
  readonly ok: boolean;
  /**
   * HTTP status, or null when the WORKER_SELF_REFERENCE binding was missing
   * or the fetch call threw.
   */
  readonly status: number | null;
  /** The thrown error, present only when the fetch call rejected. */
  readonly error?: unknown;
};

const resolveCronFetch = (
  env: WorkerCronEnv,
  fetchFn?: CronFetchLike,
): CronFetchLike | undefined => {
  if (fetchFn) return fetchFn;
  const binding = env.WORKER_SELF_REFERENCE;
  // Bind so the call behaves exactly like the previous inline
  // `env.WORKER_SELF_REFERENCE?.fetch(url, init)` method call.
  return binding?.fetch?.bind(binding);
};

/* eslint-disable no-console -- console is Workers' log stream (wrangler tail
   and the dashboard); there is no logger import in the worker entry. */
export const runCronTargets = async (
  targets: readonly CronTarget[],
  env: WorkerCronEnv,
  fetchFn?: CronFetchLike,
): Promise<CronTargetResult[]> => {
  const doFetch = resolveCronFetch(env, fetchFn);
  const results: CronTargetResult[] = [];

  if (!env.TASK_SECRET) {
    console.error(
      '[scheduled] TASK_SECRET is not set — cron endpoints will refuse the call',
    );
  }
  // Sequential: a shared-minute daily/bot pair must not overlap.
  for (const target of targets) {
    const url = new URL(
      target.path,
      'https://cron.openthrone.internal',
    ).toString();
    try {
      const response = doFetch
        ? await doFetch(url, {
            method: 'POST',
            headers: {
              // Raw secret, no Bearer prefix — the endpoints' existing contract.
              ...(env.TASK_SECRET ? { Authorization: env.TASK_SECRET } : {}),
            },
          })
        : undefined;
      // Read the body to the end: a scheduled caller that drops it shows the
      // endpoint invocation as "Canceled" in wrangler tail even though it
      // finished and answered 200.
      await response?.arrayBuffer().catch(() => undefined);
      if (response && response.ok) {
        console.log(`[scheduled] ${target.label} (${target.path}) ok`);
        results.push({ target, ok: true, status: response.status });
      } else {
        console.error(
          `[scheduled] ${target.label} (${target.path}) failed: ${
            response ? response.status : 'WORKER_SELF_REFERENCE binding missing'
          }`,
        );
        results.push({
          target,
          ok: false,
          status: response ? response.status : null,
        });
      }
    } catch (error) {
      console.error(
        `[scheduled] ${target.label} (${target.path}) threw`,
        error,
      );
      results.push({ target, ok: false, status: null, error });
    }
  }

  return results;
};

/**
 * Body of the Worker's `scheduled()` entry point: route the event by exact
 * cron-expression match and hand the sequential fan-out to `ctx.waitUntil`.
 * Does not await the fan-out — identical to the previous inline worker.ts
 * behavior.
 */
export const dispatchScheduledCron = (
  controller: ScheduledControllerLike,
  env: WorkerCronEnv,
  ctx: ExecutionContextLike,
  fetchFn?: CronFetchLike,
): void => {
  const mapped = CRON_TARGETS.filter(
    (target) => target.cron === controller.cron,
  );
  if (mapped.length === 0) {
    console.warn(`[scheduled] no route mapped for cron "${controller.cron}"`);
    return;
  }
  const atOtMidnight = isOtMidnight(controller.scheduledTime);
  const targets = mapped.filter(
    (target) => !target.otMidnightOnly || atOtMidnight,
  );
  for (const target of mapped) {
    if (!targets.includes(target)) {
      console.log(
        `[scheduled] ${target.label} (${target.path}) skipped: not midnight in ${OT_CRON_TIME_ZONE}`,
      );
    }
  }
  if (targets.length === 0) return;
  ctx.waitUntil(runCronTargets(targets, env, fetchFn));
};
