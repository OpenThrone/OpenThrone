/**
 * Deployment smoke test for OpenThrone's critical routes.
 *
 * CI and operators run this after a deploy (preview or production) to verify
 * that the pages and API endpoints behind the OpenNext Cloudflare Worker
 * answer as expected:
 *
 *   bun scripts/smoke-deploy.ts
 *   bun scripts/smoke-deploy.ts --base-url http://127.0.0.1:8787
 *
 * The default target is the live preview worker; `--base-url` retargets a
 * local `wrangler dev` server or another environment. Checks run sequentially
 * with a per-request timeout; each check prints one PASS/FAIL line (name,
 * status, duration) followed by a summary, and the exit code is 0 only when
 * every check passes. A check whose request answers 5xx is retried a bounded
 * number of times — freshly deployed worker isolates intermittently error
 * before route logic runs (observed live: one 500/503 among steady 405s on
 * the same URL). Non-5xx outcomes are never retried, so expectation failures
 * stay immediate and deterministic.
 *
 * Every expectation encodes behavior observed against the live preview on
 * 2026-10-13; the comment next to each check names the source that pins it.
 * Zero dependencies: global fetch only. The pure parts (check registry,
 * expectation evaluators, summary and exit-code logic, argument parsing) are
 * exported for scripts/smoke-deploy.test.ts.
 */

const USAGE = `Usage: bun scripts/smoke-deploy.ts [--base-url <url>]

Smoke-tests the critical routes of a deployed OpenThrone worker.
Defaults to the preview deployment; point --base-url at a local
"wrangler dev" server to smoke an unpublished build.
Prints one PASS/FAIL line per check, then a summary.
Exits 0 only when every check passes.
`;

/** Preview deployment from wrangler.jsonc (NEXTAUTH_URL of the `preview` env). */
export const DEFAULT_BASE_URL = 'https://openthrone-preview.example.workers.dev';

/** Hard ceiling for a single smoke request, including response body reads. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * 5xx answers get this many extra attempts (with TRANSIENT_RETRY_DELAY_MS
 * between them) before the check reports the last response — a fresh deploy's
 * cold isolates occasionally fail before the route logic executes.
 */
export const TRANSIENT_RETRY_ATTEMPTS = 2;
export const TRANSIENT_RETRY_DELAY_MS = 250;

/** Only server-side errors are retried; refusals (401/403/404/405) never are. */
export const isRetryableStatus = (status: number): boolean => status >= 500;

/**
 * What a check demands from one HTTP response. All fields are evaluated
 * against a single fetched response; a check passes only when every enabled
 * expectation holds.
 */
export interface SmokeExpectation {
  /** Accepted HTTP statuses; any other status fails the check. */
  readonly statuses: readonly number[];
  /** Substrings that must appear in the response body (server-rendered markers, JSON payloads). */
  readonly markers?: readonly string[];
  /** When true, the body must parse as JSON. */
  readonly json?: boolean;
  /**
   * When true, the body must be a JSON object WITHOUT a `user` field — the
   * contract of NextAuth's session endpoint for an unauthenticated caller.
   */
  readonly anonymousSession?: boolean;
}

export interface SmokeCheck {
  readonly name: string;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly expect: SmokeExpectation;
}

/** The one response a check is evaluated against. */
export interface SmokeResponse {
  readonly status: number;
  readonly body: string;
}

export interface CheckResult {
  readonly name: string;
  readonly path: string;
  readonly passed: boolean;
  /** Observed status, or null when the request itself failed. */
  readonly status: number | null;
  readonly durationMs: number;
  /** Empty when passed; otherwise one human-readable reason per violation. */
  readonly failures: readonly string[];
}

export interface SmokeSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
}

export class UsageError extends Error {}

/**
 * The critical-route suite. Order is fixed so output is deterministic and a
 * failure line number always refers to the same check.
 */
export const getSmokeChecks = (): readonly SmokeCheck[] => [
  {
    name: 'home',
    method: 'GET',
    path: '/',
    expect: {
      statuses: [200],
      // The home page server-renders its session-loading branch
      // (src/pages/index.tsx:99-112), so hero text is not in the server HTML.
      // The stable server-rendered markers are the landing-namespace i18n
      // payload that the home page's getStaticProps
      // (src/pages/index.tsx:310-318) embeds in __NEXT_DATA__ (the hero key
      // "joinTheFight") plus the rendered route report '"page":"/"'.
      markers: ['joinTheFight', '"page":"/"'],
    },
  },
  {
    name: 'account-login',
    method: 'GET',
    path: '/account/login',
    expect: { statuses: [200] },
  },
  {
    name: 'account-register',
    method: 'GET',
    path: '/account/register',
    expect: { statuses: [200] },
  },
  {
    name: 'messaging',
    method: 'GET',
    path: '/messaging',
    expect: { statuses: [200] },
  },
  {
    name: 'battle-users',
    method: 'GET',
    path: '/battle/users',
    expect: { statuses: [200] },
  },
  {
    name: 'custom-404',
    method: 'GET',
    path: '/__smoke_404__',
    expect: {
      statuses: [404],
      // The custom 404 page (src/pages/404.tsx): Next.js reports the rendered
      // route as "/404" in __NEXT_DATA__ (a generic error page would report
      // "/_error"), and the page's notFound copy from
      // public/locales/en/common.json (notFound.title) ships in the page
      // props loaded by its getStaticProps (src/pages/404.tsx:39-43).
      markers: ['"page":"/404"', 'Page not found'],
    },
  },
  {
    name: 'api-config',
    method: 'GET',
    path: '/api/config',
    // Runtime config endpoint: 200 JSON on success (src/pages/api/config.ts:5-15).
    expect: { statuses: [200], json: true },
  },
  {
    name: 'auth-session-anonymous',
    method: 'GET',
    path: '/api/auth/session',
    // NextAuth v4 session endpoint with JWT strategy
    // (src/pages/api/auth/[...nextauth].ts:384-450): an unauthenticated
    // caller gets HTTP 200 with an empty JSON object — verified live.
    expect: { statuses: [200], anonymousSession: true },
  },
  {
    name: 'locales-asset',
    method: 'GET',
    path: '/locales/en/common.json',
    // i18next-http-backend loadPath (next-i18next.config.js:29) serving
    // public/locales through the Worker asset binding (wrangler.jsonc
    // assets.directory = .open-next/assets).
    expect: { statuses: [200], json: true },
  },
  {
    name: 'cron-turns-unauthenticated-refused',
    method: 'GET',
    path: '/api/cronJobs/turns',
    // POST-only route (src/pages/api/cronJobs/turns.ts:9-13): the method
    // guard (src/middleware/apiGuard.ts:129-132) refuses GET with 405, and an
    // unauthenticated POST falls through to 401
    // (src/pages/api/cronJobs/turns.ts:36-38). Verified live: GET -> 405,
    // POST without auth -> 401. 401/403 stay accepted so this check keeps
    // asserting "unauthenticated callers are refused" even if the method
    // guard changes while auth enforcement holds.
    expect: { statuses: [401, 403, 405] },
  },
];

/** Failure reason when the observed status is not one of the expected ones. */
export const evaluateStatus = (
  actual: number,
  expected: readonly number[],
): string | null =>
  expected.includes(actual)
    ? null
    : `status ${actual}, expected one of ${expected.join('/')}`;

/** Failure reasons for every expected body marker that is missing. */
export const evaluateMarkers = (
  body: string,
  markers: readonly string[],
): readonly string[] =>
  markers
    .filter((marker) => !body.includes(marker))
    .map((marker) => `missing body marker: ${marker}`);

/** Failure reason when the body does not parse as JSON. */
export const evaluateJsonBody = (body: string): string | null => {
  try {
    JSON.parse(body);
    return null;
  } catch {
    return 'response body is not valid JSON';
  }
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * NextAuth's session contract for an unauthenticated caller: a JSON object
 * with no `user` field (verified live as `{}`).
 */
export const evaluateAnonymousSession = (body: string): readonly string[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return ['response body is not valid JSON'];
  }
  if (!isJsonObject(parsed)) {
    return ['session payload is not a JSON object'];
  }
  return 'user' in parsed
    ? [
        'session payload unexpectedly carries a user; expected an unauthenticated session',
      ]
    : [];
};

/** Evaluates one response against a check; empty array means the check passed. */
export const evaluateCheckResponse = (
  check: SmokeCheck,
  response: SmokeResponse,
): readonly string[] => {
  const failures: string[] = [];

  const statusFailure = evaluateStatus(response.status, check.expect.statuses);
  if (statusFailure) {
    failures.push(statusFailure);
  }

  if (check.expect.markers) {
    failures.push(...evaluateMarkers(response.body, check.expect.markers));
  }

  if (check.expect.anonymousSession) {
    failures.push(...evaluateAnonymousSession(response.body));
  } else if (check.expect.json) {
    const jsonFailure = evaluateJsonBody(response.body);
    if (jsonFailure) {
      failures.push(jsonFailure);
    }
  }

  return failures;
};

/** Strips any path/query and validates the scheme, so check paths join cleanly. */
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

/** CLI parsing: `--base-url <url>` or `--base-url=<url>`; anything else is usage. */
export const parseSmokeArgs = (
  argv: readonly string[],
): {
  baseUrl: string;
} => {
  let baseUrl = DEFAULT_BASE_URL;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--base-url') {
      const value = argv[index + 1];
      if (value === undefined || value === '') {
        throw new UsageError(`${USAGE}\n--base-url requires a URL argument`);
      }
      baseUrl = value;
      index += 1;
    } else if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length);
    } else {
      throw new UsageError(`${USAGE}\nunknown argument: ${arg}`);
    }
  }

  return { baseUrl: normalizeBaseUrl(baseUrl) };
};

export const summarize = (results: readonly CheckResult[]): SmokeSummary => {
  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
  };
};

/** 0 only when every check passed (an empty run counts as passing: nothing failed). */
export const exitCodeFor = (results: readonly CheckResult[]): 0 | 1 =>
  results.every((result) => result.passed) ? 0 : 1;

/** One output line per check: PASS/FAIL, name, status, duration, failure reason. */
export const formatCheckLine = (result: CheckResult): string => {
  const status = result.status === null ? 'ERR' : String(result.status);
  const line = `${result.passed ? 'PASS' : 'FAIL'}  ${result.name.padEnd(
    34,
  )} ${status.padStart(3)}  ${String(result.durationMs).padStart(5)}ms`;
  return result.failures.length === 0
    ? line
    : `${line}  <- ${result.failures.join('; ')}`;
};

export const formatSummaryLines = (
  baseUrl: string,
  summary: SmokeSummary,
): readonly string[] => [
  summary.failed === 0
    ? `OK ${summary.passed}/${summary.total} smoke checks passed against ${baseUrl}`
    : `FAILED ${summary.failed}/${summary.total} smoke checks against ${baseUrl} (${summary.passed} passed)`,
];

interface CheckAttempt {
  readonly status: number | null;
  readonly failures: readonly string[];
}

const runCheckOnce = async (
  baseUrl: string,
  check: SmokeCheck,
): Promise<CheckAttempt> => {
  try {
    const response = await fetch(new URL(check.path, baseUrl), {
      method: check.method,
      headers: { accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    });
    const { status } = response;
    const body = await response.text();
    return { status, failures: evaluateCheckResponse(check, { status, body }) };
  } catch (error) {
    return {
      status: null,
      failures: [
        `request failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
};

const runCheck = async (
  baseUrl: string,
  check: SmokeCheck,
): Promise<CheckResult> => {
  const startedAt = performance.now();
  let outcome = await runCheckOnce(baseUrl, check);
  let attempts = 1;

  while (
    outcome.status !== null &&
    isRetryableStatus(outcome.status) &&
    attempts <= TRANSIENT_RETRY_ATTEMPTS
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS),
    );
    outcome = await runCheckOnce(baseUrl, check);
    attempts += 1;
  }

  const durationMs = Math.round(performance.now() - startedAt);
  return {
    name: check.name,
    path: check.path,
    passed: outcome.failures.length === 0,
    status: outcome.status,
    durationMs,
    failures: outcome.failures,
  };
};

/**
 * Runs the suite sequentially — deterministic order, no concurrent burst
 * against routes that carry rate-limit profiles.
 */
export const runSmokeChecks = async (
  baseUrl: string,
  checks: readonly SmokeCheck[] = getSmokeChecks(),
): Promise<readonly CheckResult[]> => {
  const results: CheckResult[] = [];
  for (const check of checks) {
    results.push(await runCheck(baseUrl, check));
  }
  return results;
};

if (import.meta.main) {
  try {
    const { baseUrl } = parseSmokeArgs(process.argv.slice(2));
    process.stdout.write(`OpenThrone deploy smoke: ${baseUrl}\n`);

    const results = await runSmokeChecks(baseUrl);
    for (const result of results) {
      process.stdout.write(`${formatCheckLine(result)}\n`);
    }
    for (const line of formatSummaryLines(baseUrl, summarize(results))) {
      process.stdout.write(`${line}\n`);
    }
    process.exitCode = exitCodeFor(results);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
