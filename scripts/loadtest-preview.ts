/**
 * Load-test harness for OpenThrone's public preview deployment (issue #26).
 *
 *   bun scripts/loadtest-preview.ts
 *   bun scripts/loadtest-preview.ts --base-url https://openthrone-preview.example.workers.dev \
 *       --duration-seconds 120 --concurrency 20 --routes /,/api/config
 *
 * Runs `--concurrency` workers that GET the routes round-robin (one shared
 * counter, so distribution stays even) until `--duration-seconds` elapses.
 * Per route it records request/success/error counts and p50/p95/p99/max
 * latency in milliseconds — time to response headers; response bodies are
 * cancelled, not drained. A request counts as a success when fetch resolves
 * with a 2xx/3xx status (redirects are followed); network failures, aborts
 * and 4xx/5xx answers count as errors, and every attempt — success or error —
 * contributes a latency sample, because slow failures during a redeploy are
 * exactly the signal worth keeping. Progress lines go to stderr; the final
 * line on stdout is a single JSON summary object. Exit code is nonzero when
 * the error rate exceeds 1% (overall or on any single route) or any route
 * recorded zero successes (including a route that was never hit).
 *
 * LIMITATION: public routes only. The harness sends no credentials, cookies
 * or Turnstile tokens, so authenticated flows (recruit/train/bank/armory,
 * attack+spy, admin) are out of scope — those stay covered by the cutover
 * smoke checklist in docs/operations.md and scripts/smoke-deploy.ts. Results
 * therefore measure the public serving path (SSR pages, auth-free APIs,
 * Hyperdrive-backed reads), not gameplay writes.
 *
 * Zero dependencies: global fetch only. The pure parts (argument parsing,
 * percentile/summary math, exit-code logic) are exported for unit tests.
 */

/** Preview deployment from wrangler.jsonc (NEXTAUTH_URL of the `preview` env). */
export const DEFAULT_BASE_URL = 'https://openthrone-preview.example.workers.dev';

export const DEFAULT_DURATION_SECONDS = 30;
export const DEFAULT_CONCURRENCY = 10;
export const DEFAULT_ROUTES = ['/', '/account/login', '/api/config'] as const;

/** Hard ceiling for a single request; an aborted request counts as an error. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Failure threshold: more than 1% errors (overall or on any one route) fails the run. */
export const MAX_ERROR_RATE = 0.01;

/** Progress cadence on stderr while the run is in flight. */
const PROGRESS_INTERVAL_MS = 5_000;

export class UsageError extends Error {}

export interface LoadtestConfig {
  readonly baseUrl: string;
  readonly durationSeconds: number;
  readonly concurrency: number;
  readonly routes: readonly string[];
}

/** Per-route tallies collected while the run is in flight. */
export interface RouteAccumulator {
  requests: number;
  successes: number;
  /** One latency sample (ms) per attempt, success or error. */
  latencies: number[];
}

/** Per-route slice of the final JSON summary. */
export interface RouteResult {
  requests: number;
  successes: number;
  errors: number;
  /** errors / requests (0 when no requests were made). */
  errorRate: number;
  /** Nearest-rank percentile of the latency samples; null when none. */
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
}

export interface LoadtestSummary {
  baseUrl: string;
  durationSeconds: number;
  concurrency: number;
  startedAt: string;
  routes: Record<string, RouteResult>;
  totalRequests: number;
  totalErrors: number;
  overallErrorRate: number;
  passed: boolean;
  failureReasons: readonly string[];
}

const USAGE = `Usage: bun scripts/loadtest-preview.ts [options]

Load-tests the public routes of a deployed OpenThrone worker with concurrent
GET requests and prints a one-line JSON summary. Public routes only — no
authenticated flows (see the header comment in this file).

Options:
  --base-url <url>          Target origin (default: ${DEFAULT_BASE_URL})
  --duration-seconds <n>    Run length in seconds (default: ${DEFAULT_DURATION_SECONDS})
  --concurrency <n>         Parallel workers (default: ${DEFAULT_CONCURRENCY})
  --routes <a,b,c>          Comma-separated paths (default: ${DEFAULT_ROUTES.join(',')})
  --help                    Show this text

Exits nonzero when the error rate exceeds ${MAX_ERROR_RATE * 100}% (overall or
per route) or any route recorded zero successes.
`;

/** Strips any path/query and validates the scheme, so route paths join cleanly. */
export const normalizeBaseUrl = (baseUrl: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new UsageError(
      `--base-url must be an absolute http(s) URL, got: ${baseUrl}`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UsageError(`--base-url must use http or https, got: ${baseUrl}`);
  }
  return parsed.origin;
};

const parsePositiveInt = (name: string, raw: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new UsageError(
      `${USAGE}\n${name} must be a positive integer, got: ${raw}`,
    );
  }
  return value;
};

/** Splits, trims and validates a comma-separated route list; order preserved. */
export const parseRouteList = (raw: string): readonly string[] => {
  const routes = [
    ...new Set(
      raw
        .split(',')
        .map((route) => route.trim())
        .filter(Boolean),
    ),
  ];
  const invalid = routes.filter((route) => !route.startsWith('/'));
  if (routes.length === 0) {
    throw new UsageError(
      `${USAGE}\n--routes must list at least one path, got: ${raw}`,
    );
  }
  if (invalid.length > 0) {
    throw new UsageError(
      `${USAGE}\n--routes paths must start with "/", got: ${invalid.join(', ')}`,
    );
  }
  return routes;
};

/** CLI parsing: `--flag value` or `--flag=value`; anything else is usage. */
export const parseLoadtestArgs = (argv: readonly string[]): LoadtestConfig => {
  let baseUrl = DEFAULT_BASE_URL;
  let durationSeconds = DEFAULT_DURATION_SECONDS;
  let concurrency = DEFAULT_CONCURRENCY;
  let routes: readonly string[] = DEFAULT_ROUTES;

  const needValue = (flag: string, value: string | undefined): string => {
    if (value === undefined || value === '') {
      throw new UsageError(`${USAGE}\n${flag} requires a value`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') {
      throw new UsageError(USAGE);
    }
    if (arg === '--base-url') {
      baseUrl = needValue(arg, argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--duration-seconds') {
      durationSeconds = parsePositiveInt(
        '--duration-seconds',
        needValue(arg, argv[index + 1]),
      );
      index += 1;
    } else if (arg.startsWith('--duration-seconds=')) {
      durationSeconds = parsePositiveInt(
        '--duration-seconds',
        arg.slice('--duration-seconds='.length),
      );
    } else if (arg === '--concurrency') {
      concurrency = parsePositiveInt(
        '--concurrency',
        needValue(arg, argv[index + 1]),
      );
      index += 1;
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = parsePositiveInt(
        '--concurrency',
        arg.slice('--concurrency='.length),
      );
    } else if (arg === '--routes') {
      routes = parseRouteList(needValue(arg, argv[index + 1]));
      index += 1;
    } else if (arg.startsWith('--routes=')) {
      routes = parseRouteList(arg.slice('--routes='.length));
    } else {
      throw new UsageError(`${USAGE}\nunknown argument: ${arg}`);
    }
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    durationSeconds,
    concurrency,
    routes,
  };
};

/** Nearest-rank percentile over pre-sorted samples; null when there are none. */
export const percentileMs = (
  sortedSamples: readonly number[],
  p: number,
): number | null => {
  if (sortedSamples.length === 0) return null;
  const rank = Math.ceil((p / 100) * sortedSamples.length);
  const index = Math.min(Math.max(rank, 1), sortedSamples.length) - 1;
  const sample = sortedSamples[index];
  return sample === undefined ? null : Math.round(sample);
};

/** Freezes one accumulator into its summary slice. */
export const summarizeRoute = (acc: RouteAccumulator): RouteResult => {
  const sorted = [...acc.latencies].sort((a, b) => a - b);
  return {
    requests: acc.requests,
    successes: acc.successes,
    errors: acc.requests - acc.successes,
    errorRate:
      acc.requests === 0 ? 0 : (acc.requests - acc.successes) / acc.requests,
    p50Ms: percentileMs(sorted, 50),
    p95Ms: percentileMs(sorted, 95),
    p99Ms: percentileMs(sorted, 99),
    maxMs:
      sorted.length === 0 ? null : Math.round(sorted[sorted.length - 1] ?? 0),
  };
};

/** Human-readable reasons the run failed; empty means it passed. */
export const failureReasonsFor = (
  routeResults: Record<string, RouteResult>,
  overallErrorRate: number,
): readonly string[] => {
  const reasons: string[] = [];
  if (overallErrorRate > MAX_ERROR_RATE) {
    reasons.push(
      `overall error rate ${(overallErrorRate * 100).toFixed(2)}% exceeds ${MAX_ERROR_RATE * 100}%`,
    );
  }
  for (const [route, result] of Object.entries(routeResults)) {
    if (result.successes === 0) {
      reasons.push(
        `route ${route} recorded zero successes (${result.requests} requests)`,
      );
    } else if (result.errorRate > MAX_ERROR_RATE) {
      reasons.push(
        `route ${route} error rate ${(result.errorRate * 100).toFixed(2)}% exceeds ${MAX_ERROR_RATE * 100}%`,
      );
    }
  }
  return reasons;
};

export const buildSummary = (
  config: LoadtestConfig,
  startedAt: Date,
  accumulators: ReadonlyMap<string, RouteAccumulator>,
): LoadtestSummary => {
  const routes: Record<string, RouteResult> = {};
  for (const [route, acc] of accumulators) {
    routes[route] = summarizeRoute(acc);
  }
  const totalRequests = Object.values(routes).reduce(
    (sum, result) => sum + result.requests,
    0,
  );
  const totalErrors = Object.values(routes).reduce(
    (sum, result) => sum + result.errors,
    0,
  );
  const overallErrorRate =
    totalRequests === 0 ? 0 : totalErrors / totalRequests;
  const failureReasons = failureReasonsFor(routes, overallErrorRate);
  return {
    baseUrl: config.baseUrl,
    durationSeconds: config.durationSeconds,
    concurrency: config.concurrency,
    startedAt: startedAt.toISOString(),
    routes,
    totalRequests,
    totalErrors,
    overallErrorRate,
    passed: failureReasons.length === 0,
    failureReasons,
  };
};

/** One GET against `url`; true when fetch resolves with a 2xx/3xx status. */
const requestSucceeds = async (url: URL): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    });
    // Time-to-headers is the latency sample; release the body's connection.
    await response.body?.cancel().catch(() => undefined);
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
};

export const runLoadtest = async (
  config: LoadtestConfig,
): Promise<LoadtestSummary> => {
  const startedAt = new Date();
  const startPerfMs = performance.now();
  const deadline = performance.now() + config.durationSeconds * 1000;
  const accumulators = new Map<string, RouteAccumulator>(
    config.routes.map((route) => [
      route,
      { requests: 0, successes: 0, latencies: [] },
    ]),
  );

  // Shared round-robin cursor: every request claims the next route in turn,
  // so distribution stays even across workers (JS is single-threaded).
  let routeCursor = 0;
  const claimRoute = (): { route: string; acc: RouteAccumulator } | null => {
    if (performance.now() >= deadline) return null;
    const route = config.routes[routeCursor % config.routes.length];
    const acc = route === undefined ? undefined : accumulators.get(route);
    routeCursor += 1;
    return route === undefined || acc === undefined ? null : { route, acc };
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      const claimed = claimRoute();
      if (claimed === null) return;
      const startedAtMs = performance.now();
      const ok = await requestSucceeds(new URL(claimed.route, config.baseUrl));
      claimed.acc.requests += 1;
      if (ok) claimed.acc.successes += 1;
      claimed.acc.latencies.push(performance.now() - startedAtMs);
    }
  };

  const progress = setInterval(() => {
    const totals = [...accumulators.values()].reduce(
      (sum, acc) => ({
        requests: sum.requests + acc.requests,
        errors: sum.errors + (acc.requests - acc.successes),
      }),
      { requests: 0, errors: 0 },
    );
    process.stderr.write(
      `[loadtest] t+${Math.round((performance.now() - startPerfMs) / 1000)}s ` +
        `requests=${totals.requests} errors=${totals.errors}\n`,
    );
  }, PROGRESS_INTERVAL_MS);

  try {
    await Promise.all(
      Array.from({ length: config.concurrency }, () => worker()),
    );
  } finally {
    clearInterval(progress);
  }

  return buildSummary(config, startedAt, accumulators);
};

if (import.meta.main) {
  try {
    const config = parseLoadtestArgs(process.argv.slice(2));
    process.stderr.write(
      `OpenThrone load test: ${config.baseUrl} routes=${config.routes.join(',')} ` +
        `concurrency=${config.concurrency} duration=${config.durationSeconds}s\n`,
    );
    const summary = await runLoadtest(config);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    if (!summary.passed) {
      process.stderr.write(`FAILED: ${summary.failureReasons.join('; ')}\n`);
    }
    process.exitCode = summary.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
