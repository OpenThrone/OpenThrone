import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

/** Cron run rows older than this are deleted by the daily job. */
export const CRON_RUN_RETENTION_DAYS = 90;

/**
 * A RUNNING row older than this is reported as stale/unknown by the admin
 * page: no scheduled job runs this long, so its finish was lost.
 */
export const CRON_RUN_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** Error messages are capped so a chatty failure cannot bloat the table. */
const ERROR_MAX_LENGTH = 500;
/** Summary strings are capped for the same reason. */
const SUMMARY_STRING_MAX_LENGTH = 200;
/** Nesting depth accepted by the summary sanitizer. */
const SUMMARY_MAX_DEPTH = 2;
/** Total fields kept per summary after sanitizing. */
const SUMMARY_MAX_FIELDS = 30;

/**
 * What a wrapped cron job reports back to the run log. All fields are
 * optional so handlers can return their response data on the same object.
 */
export interface CronRunJobResult {
  /** Sanitized, JSON-safe summary of what the run did. */
  summary?: Record<string, unknown>;
  /** True when the job finished without throwing but still failed. */
  failed?: boolean;
}

/** True for plain objects (and arrays) that can be safely recursed into. */
const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Sanitizes one summary value into a JSON-safe scalar. */
const sanitizeValue = (value: unknown, depth: number): unknown => {
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string')
    return value.length > SUMMARY_STRING_MAX_LENGTH
      ? `${value.slice(0, SUMMARY_STRING_MAX_LENGTH)}…`
      : value;
  if (typeof value === 'object') {
    if (depth >= SUMMARY_MAX_DEPTH) return '[unserializable]';
    if (Array.isArray(value))
      return value.map((item) => sanitizeValue(item, depth + 1));
    if (!isPlainObject(value)) return '[unserializable]';
    return sanitizeSummary(value as Record<string, unknown>, depth + 1);
  }
  return '[unserializable]';
};

/**
 * Copies a job summary into a JSON-safe shape: only finite numbers, booleans,
 * strings (truncated), null and shallow nested collections survive. Anything
 * else — Error objects, bigints, class instances — is reduced to a placeholder
 * so no unexpected value (and never a secret a caller might attach) is stored
 * verbatim.
 */
export function sanitizeSummary(
  summary: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  let fields = 0;
  for (const [key, value] of Object.entries(summary)) {
    if (fields >= SUMMARY_MAX_FIELDS) break;
    safe[key] = sanitizeValue(value, depth);
    fields++;
  }
  return safe;
}

/** Whole header values (to end of line): Authorization, Cookie, API keys. */
const SECRET_HEADER =
  /\b((?:proxy-)?authorization|(?:set-)?cookie|x-api-key)(["']?\s*[:=]\s*["']?)[^\r\n]*/gi;
/** Stray `Bearer <token>` fragments outside a header line. */
const BEARER_TOKEN = /\bbearer\s+[^\s,;"']+/gi;
/** Credentials embedded in URLs (`postgres://user:pass@host`). */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
/**
 * Credential-like `name=value` / `name: value` pairs (`?token=…`,
 * `password="…"`, JSON `"key": "…"`). The value is a double-quoted, a
 * single-quoted or an unquoted run up to whitespace or `&`, so quoted secrets
 * are consumed whole and unquoted ones are never cut short at punctuation.
 */
const SECRET_PARAM =
  /\b((?:access_|refresh_|id_)?token|api[_-]?key|key|(?:client_)?secret|password|passwd|pwd|signature|auth)(["']?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s&]*)/gi;
const EMAIL =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * Reduces a thrown error to a storable message: the message only (never the
 * stack, which can echo env-derived paths). Secrets are redacted in this
 * order: whole Authorization/Cookie/Set-Cookie header values, bearer tokens,
 * URL credentials, credential-like parameters, then email addresses. Whitespace
 * is collapsed and the result truncated.
 */
export function truncateErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : String(error ?? 'unknown error');
  const message = raw
    .replace(SECRET_HEADER, '$1$2[redacted]')
    .replace(BEARER_TOKEN, 'Bearer [redacted]')
    .replace(URL_CREDENTIALS, '$1[redacted]@')
    .replace(SECRET_PARAM, '$1$2[redacted]')
    .replace(EMAIL, '[email]')
    .replace(/\s+/g, ' ')
    .trim();
  return message.length > ERROR_MAX_LENGTH
    ? `${message.slice(0, ERROR_MAX_LENGTH)}…`
    : message;
}

/**
 * Longest a log write may hold anything up. A stalled insert, lock wait or
 * prune must never delay the job or its HTTP response, so every awaited log
 * operation is raced against this.
 */
export const CRON_LOG_TIMEOUT_MS = 2000;

/**
 * Resolves with the promise's value, or `undefined` once `ms` has passed.
 * Late settlement (including rejection) is ignored.
 */
function withinTimeout<T>(
  promise: Promise<T>,
  ms: number = CRON_LOG_TIMEOUT_MS,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

/**
 * Inserts the RUNNING row for a job. Returns the row id, or null when the
 * database write fails — logging must never break the job, so failures are
 * logged and swallowed.
 */
async function startCronRun(
  job: string,
  startedAt: Date,
): Promise<number | null> {
  try {
    const run = await prisma.cronRun.create({
      data: { job, status: 'RUNNING', startedAt },
      select: { id: true },
    });
    return run.id;
  } catch (error) {
    logError(`Could not record cron run start for ${job}`, { error });
    return null;
  }
}

interface FinishCronRunInput {
  status: 'SUCCESS' | 'FAILED';
  startedAt: Date;
  finishedAt: Date;
  summary?: Record<string, unknown>;
  error?: string;
}

/** Completes a run row; failures and stalls are logged/ignored, never thrown. */
async function finishCronRun(
  runId: number | null,
  input: FinishCronRunInput,
): Promise<void> {
  if (runId === null) return;
  try {
    await withinTimeout(
      prisma.cronRun.update({
        where: { id: runId },
        data: {
          status: input.status,
          finishedAt: input.finishedAt,
          durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
          ...(input.summary ? { summary: sanitizeSummary(input.summary) } : {}),
          ...(input.error !== undefined ? { error: input.error } : {}),
        },
      }),
    );
  } catch (error) {
    logError(`Could not record cron run result for row ${runId}`, { error });
  }
}

/**
 * Runs a scheduled job with run logging:
 * - a RUNNING row is created as the job starts and completed with
 *   SUCCESS or FAILED (plus a sanitized summary and, on failure, the
 *   truncated error message) when it ends;
 * - a job that returns `{ failed: true }` without throwing is recorded as
 *   FAILED too;
 * - thrown errors are recorded and re-thrown unchanged;
 * - if any logging write fails or stalls, the job still runs and its result
 *   is returned untouched: the RUNNING insert is not awaited before the job
 *   starts, and every log write the caller waits on is bounded by
 *   CRON_LOG_TIMEOUT_MS.
 *
 * Runs rejected before this wrapper (missing/wrong scheduler secret, or the
 * job disabled via its DO_* flag) record nothing: the scheduler never asked
 * the job to run, and a row per rejected tick would only add noise.
 *
 * A row can stay RUNNING for two reasons: the process died mid-run, or the
 * start insert never confirmed (it was lost, or it stalled past the bound and
 * the late-finish update could not be attached). The admin page shows RUNNING
 * rows older than CRON_RUN_STALE_AFTER_MS as stale; retention deletes them
 * with everything else after 90 days.
 */
export async function withCronRunLog<T extends CronRunJobResult | void>(
  job: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  // Not awaited: a stalled insert must not delay the job. The id is only
  // needed when the run ends, where it is awaited with a bound.
  const started = startCronRun(job, startedAt);
  /**
   * Completes the run row. If the insert has not confirmed within the bound,
   * the update is attached to the insert instead: should it land late, the
   * row is still closed with the final status rather than staying RUNNING
   * for a finished job. That background update is bounded and never throws.
   */
  const finalize = async (input: FinishCronRunInput): Promise<void> => {
    const runId = (await withinTimeout(started)) ?? null;
    if (runId !== null) {
      await finishCronRun(runId, input);
      return;
    }
    started
      .then((lateId) => finishCronRun(lateId, input))
      .catch(() => undefined);
  };
  try {
    const value = await run();
    // `run` may be a plain void callback; only read job fields when it
    // returned a result object.
    const jobResult: CronRunJobResult | undefined =
      value && typeof value === 'object' ? value : undefined;
    await finalize({
      status: jobResult?.failed ? 'FAILED' : 'SUCCESS',
      startedAt,
      finishedAt: new Date(),
      summary: jobResult?.summary,
    });
    return value;
  } catch (error) {
    await finalize({
      status: 'FAILED',
      startedAt,
      finishedAt: new Date(),
      error: truncateErrorMessage(error),
    });
    throw error;
  }
}

/**
 * Deletes run rows older than the retention window. Called from the daily
 * job; never throws and waits at most CRON_LOG_TIMEOUT_MS, so retention cannot
 * take the daily pass down or hold it up (a slow delete finishes on its own).
 */
export async function pruneOldCronRuns(
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - CRON_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  try {
    const result = await withinTimeout<{ count: number }>(
      prisma.cronRun.deleteMany({ where: { startedAt: { lt: cutoff } } }),
    );
    return result?.count ?? 0;
  } catch (error) {
    logError('Could not prune old cron runs', { error });
    return 0;
  }
}

/**
 * True when `job` already has a run that succeeded or is still running and
 * started at or after `since`. Scheduled endpoints use it to skip a repeated
 * delivery (a duplicate Cron Trigger, or two schedulers overlapping during a
 * switchover) instead of applying a tick twice. Failed runs never count, so a
 * failed tick can be re-run at once. A RUNNING row older than
 * CRON_RUN_STALE_AFTER_MS lost its finish (the process died mid-run) and no
 * longer counts either, so a crashed daily does not block the rest of the
 * game day. A lookup error never blocks the job: it is logged and treated as
 * "no run".
 *
 * Not atomic: two deliveries arriving at the same instant can both pass.
 * Per-user row locks in CronJob.service.ts still keep each write consistent.
 */
export async function hasCronRunSince(
  job: string,
  since: Date,
  now: Date = new Date(),
): Promise<boolean> {
  const liveSince = new Date(
    Math.max(since.getTime(), now.getTime() - CRON_RUN_STALE_AFTER_MS),
  );
  try {
    const recent = await prisma.cronRun.findFirst({
      where: {
        job,
        OR: [
          { status: 'SUCCESS', startedAt: { gte: since } },
          { status: 'RUNNING', startedAt: { gte: liveSince } },
        ],
      },
      select: { id: true },
    });
    return Boolean(recent);
  } catch (error) {
    logError(`Could not check recent cron runs for ${job}`, { error });
    return false;
  }
}

/** hasCronRunSince for the last `windowMs` milliseconds. */
export const hasRecentCronRun = (
  job: string,
  windowMs: number,
  now: Date = new Date(),
): Promise<boolean> =>
  hasCronRunSince(job, new Date(now.getTime() - windowMs), now);

/** `?force=true` on a scheduled endpoint bypasses the recent-run check. */
export const isForcedCronRequest = (query: unknown): boolean =>
  (query as { force?: unknown } | undefined)?.force === 'true';
