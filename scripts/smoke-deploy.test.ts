import { describe, expect, it } from 'bun:test';

import type { CheckResult, SmokeCheck } from './smoke-deploy';
import {
  DEFAULT_BASE_URL,
  evaluateAnonymousSession,
  evaluateCheckResponse,
  evaluateJsonBody,
  evaluateMarkers,
  evaluateStatus,
  exitCodeFor,
  formatCheckLine,
  formatSummaryLines,
  getSmokeChecks,
  isRetryableStatus,
  normalizeBaseUrl,
  parseSmokeArgs,
  runSmokeChecks,
  summarize,
  UsageError,
} from './smoke-deploy';

const makeCheckResult = (overrides: Partial<CheckResult>): CheckResult => ({
  name: 'example-check',
  path: '/example',
  passed: true,
  status: 200,
  durationMs: 12,
  failures: [],
  ...overrides,
});

const findCheck = (name: string): SmokeCheck => {
  const check = getSmokeChecks().find((candidate) => candidate.name === name);
  if (!check) {
    throw new Error(`registry is missing the ${name} check`);
  }
  return check;
};

describe('smoke check registry', () => {
  it('defines the expected critical-route checks in order', () => {
    expect(
      getSmokeChecks().map((check) => ({ name: check.name, path: check.path })),
    ).toEqual([
      { name: 'home', path: '/' },
      { name: 'account-login', path: '/account/login' },
      { name: 'account-register', path: '/account/register' },
      { name: 'messaging', path: '/messaging' },
      { name: 'battle-users', path: '/battle/users' },
      { name: 'custom-404', path: '/__smoke_404__' },
      { name: 'api-config', path: '/api/config' },
      { name: 'auth-session-anonymous', path: '/api/auth/session' },
      { name: 'locales-asset', path: '/locales/en/common.json' },
      {
        name: 'cron-turns-unauthenticated-refused',
        path: '/api/cronJobs/turns',
      },
    ]);
  });

  it('gives every check a unique name, a GET method and a non-empty status list', () => {
    const checks = getSmokeChecks();
    const names = checks.map((check) => check.name);

    expect(new Set(names).size).toBe(names.length);
    for (const check of checks) {
      expect(check.method).toBe('GET');
      expect(check.expect.statuses.length).toBeGreaterThan(0);
    }
  });

  it('pins the server-rendered markers of the home and 404 pages', () => {
    expect(findCheck('home').expect.markers).toEqual([
      'joinTheFight',
      '"page":"/"',
    ]);
    expect(findCheck('custom-404').expect).toEqual({
      statuses: [404],
      markers: ['"page":"/404"', 'Page not found'],
    });
  });

  it('expects an anonymous NextAuth session payload without a user', () => {
    const expect_ = findCheck('auth-session-anonymous').expect;

    expect(expect_.statuses).toEqual([200]);
    expect(expect_.anonymousSession).toBe(true);
  });

  it('treats the turns cron route as refused without auth', () => {
    expect(
      findCheck('cron-turns-unauthenticated-refused').expect.statuses,
    ).toEqual([401, 403, 405]);
  });
});

describe('expectation evaluators', () => {
  it('accepts only the expected statuses', () => {
    expect(evaluateStatus(200, [200])).toBeNull();
    expect(evaluateStatus(405, [401, 403, 405])).toBeNull();
    expect(evaluateStatus(500, [200])).toBe('status 500, expected one of 200');
    expect(evaluateStatus(302, [200])).toBe('status 302, expected one of 200');
  });

  it('reports every missing body marker', () => {
    expect(evaluateMarkers('alpha beta', ['beta'])).toEqual([]);
    expect(evaluateMarkers('alpha', ['alpha', 'gone'])).toEqual([
      'missing body marker: gone',
    ]);
  });

  it('detects invalid JSON bodies', () => {
    expect(evaluateJsonBody('{"a":1}')).toBeNull();
    expect(evaluateJsonBody('[]')).toBeNull();
    expect(evaluateJsonBody('not json')).toBe(
      'response body is not valid JSON',
    );
  });

  it('enforces the anonymous session contract', () => {
    expect(evaluateAnonymousSession('{}')).toEqual([]);
    expect(evaluateAnonymousSession('{"user":{"id":7}}')).toEqual([
      'session payload unexpectedly carries a user; expected an unauthenticated session',
    ]);
    expect(evaluateAnonymousSession('null')).toEqual([
      'session payload is not a JSON object',
    ]);
    expect(evaluateAnonymousSession('[]')).toEqual([
      'session payload is not a JSON object',
    ]);
    expect(evaluateAnonymousSession('<html></html>')).toEqual([
      'response body is not valid JSON',
    ]);
  });

  it('passes a page check only on the expected status with all markers present', () => {
    const check = findCheck('custom-404');

    expect(
      evaluateCheckResponse(check, {
        status: 404,
        body: '<html>"page":"/404" ... Page not found</html>',
      }),
    ).toEqual([]);
    expect(
      evaluateCheckResponse(check, {
        status: 404,
        body: '"page":"/_error" generic error page',
      }),
    ).toEqual([
      'missing body marker: "page":"/404"',
      'missing body marker: Page not found',
    ]);
    expect(
      evaluateCheckResponse(check, {
        status: 500,
        body: '"page":"/404" Page not found',
      }),
    ).toEqual(['status 500, expected one of 404']);
  });

  it('passes the config-style JSON checks only on valid JSON', () => {
    const check = findCheck('api-config');

    expect(
      evaluateCheckResponse(check, {
        status: 200,
        body: '{"enableAttacking":true}',
      }),
    ).toEqual([]);
    expect(
      evaluateCheckResponse(check, {
        status: 200,
        body: 'Runtime config unavailable',
      }),
    ).toEqual(['response body is not valid JSON']);
  });

  it('fails the cron check when the route answers a non-refusal status', () => {
    const check = findCheck('cron-turns-unauthenticated-refused');

    for (const refused of [401, 403, 405]) {
      expect(
        evaluateCheckResponse(check, { status: refused, body: '{}' }),
      ).toEqual([]);
    }
    expect(
      evaluateCheckResponse(check, { status: 200, body: '{"processed":1}' }),
    ).toEqual(['status 200, expected one of 401/403/405']);
  });
});

describe('summary and exit code', () => {
  it('counts passed and failed checks', () => {
    const results = [
      makeCheckResult({ name: 'a', passed: true }),
      makeCheckResult({ name: 'b', passed: false, failures: ['status 500'] }),
      makeCheckResult({ name: 'c', passed: true }),
    ];

    expect(summarize(results)).toEqual({ total: 3, passed: 2, failed: 1 });
    expect(summarize([])).toEqual({ total: 0, passed: 0, failed: 0 });
  });

  it('exits 0 only when every check passed', () => {
    expect(
      exitCodeFor([makeCheckResult({}), makeCheckResult({ name: 'b' })]),
    ).toBe(0);
    expect(
      exitCodeFor([
        makeCheckResult({}),
        makeCheckResult({ name: 'b', passed: false, status: null }),
      ]),
    ).toBe(1);
    expect(exitCodeFor([])).toBe(0);
  });
});

describe('output formatting', () => {
  it('prints PASS lines with name, status and duration', () => {
    const line = formatCheckLine(
      makeCheckResult({ name: 'home', status: 200, durationMs: 87 }),
    );

    expect(line.startsWith('PASS')).toBe(true);
    expect(line).toContain('home');
    expect(line).toContain('200');
    expect(line).toContain('87ms');
  });

  it('prints FAIL lines with the failure reasons', () => {
    const line = formatCheckLine(
      makeCheckResult({
        name: 'custom-404',
        passed: false,
        status: 500,
        failures: ['status 500, expected one of 404', 'missing body marker: x'],
      }),
    );

    expect(line.startsWith('FAIL')).toBe(true);
    expect(line).toContain('custom-404');
    expect(line).toContain('500');
    expect(line).toContain('status 500, expected one of 404');
    expect(line).toContain('missing body marker: x');
  });

  it('prints ERR when the request itself failed', () => {
    const line = formatCheckLine(
      makeCheckResult({
        passed: false,
        status: null,
        failures: ['request failed: timeout'],
      }),
    );

    expect(line.startsWith('FAIL')).toBe(true);
    expect(line).toContain('ERR');
    expect(line).toContain('request failed: timeout');
  });

  it('summarizes the run against the target base URL', () => {
    expect(
      formatSummaryLines('http://127.0.0.1:8787', {
        total: 10,
        passed: 10,
        failed: 0,
      }),
    ).toEqual(['OK 10/10 smoke checks passed against http://127.0.0.1:8787']);
    expect(
      formatSummaryLines('http://127.0.0.1:8787', {
        total: 10,
        passed: 9,
        failed: 1,
      }),
    ).toEqual([
      'FAILED 1/10 smoke checks against http://127.0.0.1:8787 (9 passed)',
    ]);
  });
});

describe('argument parsing', () => {
  it('defaults to the preview deployment', () => {
    expect(parseSmokeArgs([])).toEqual({ baseUrl: DEFAULT_BASE_URL });
  });

  it('accepts --base-url in both flag forms and normalizes them', () => {
    expect(parseSmokeArgs(['--base-url', 'http://127.0.0.1:8787'])).toEqual({
      baseUrl: 'http://127.0.0.1:8787',
    });
    expect(parseSmokeArgs(['--base-url=http://127.0.0.1:8787/'])).toEqual({
      baseUrl: 'http://127.0.0.1:8787',
    });
  });

  it('rejects unknown arguments, missing values and non-http URLs', () => {
    expect(() => parseSmokeArgs(['--url', 'http://x'])).toThrow(UsageError);
    expect(() => parseSmokeArgs(['--base-url'])).toThrow(UsageError);
    expect(() => parseSmokeArgs(['--base-url', 'openthrone'])).toThrow(
      UsageError,
    );
    expect(() =>
      parseSmokeArgs(['--base-url', 'ftp://127.0.0.1:8787']),
    ).toThrow(UsageError);
  });

  it('strips any path suffix so check paths join against the origin', () => {
    expect(normalizeBaseUrl('https://example.com/base/path')).toBe(
      'https://example.com',
    );
  });
});

describe('transient 5xx retry', () => {
  it('retries only server-side error statuses', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(true);
    }
    for (const status of [200, 301, 401, 403, 404, 405]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });

  it('retries a 5xx answer and passes once a refusal status arrives', async () => {
    let requests = 0;
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => {
        requests += 1;
        return new Response('{}', { status: requests <= 2 ? 503 : 401 });
      },
    });

    try {
      const results = await runSmokeChecks(`http://127.0.0.1:${server.port}`, [
        {
          name: 'flaky-refusal',
          method: 'GET',
          path: '/turns',
          expect: { statuses: [401, 403, 405] },
        },
      ]);

      expect(requests).toBe(3);
      expect(results[0]?.passed).toBe(true);
      expect(results[0]?.status).toBe(401);
    } finally {
      server.stop(true);
    }
  });

  it('fails with the last status after exhausting the retries', async () => {
    let requests = 0;
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => {
        requests += 1;
        return new Response('overloaded', { status: 503 });
      },
    });

    try {
      const results = await runSmokeChecks(`http://127.0.0.1:${server.port}`, [
        {
          name: 'down-route',
          method: 'GET',
          path: '/turns',
          expect: { statuses: [401, 403, 405] },
        },
      ]);

      expect(requests).toBe(3);
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.status).toBe(503);
      expect(results[0]?.failures[0]).toContain('503');
    } finally {
      server.stop(true);
    }
  });
});

describe('sequential runner', () => {
  it('fails a check without throwing when the server is unreachable', async () => {
    // Closed port on loopback: connection refused, no network access needed.
    const results = await runSmokeChecks('http://127.0.0.1:9', [
      {
        name: 'unreachable',
        method: 'GET',
        path: '/anything',
        expect: { statuses: [200] },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.status).toBeNull();
    expect(results[0]?.failures[0]).toContain('request failed');
  });
});
