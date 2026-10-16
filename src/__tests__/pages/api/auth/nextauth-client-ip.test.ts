import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createHash } from 'crypto';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import type { RateLimitStore } from 'test/utils/rateLimitStore';
import { installRateLimitStore } from 'test/utils/rateLimitStore';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
const logAction = vi.fn();
vi.mock('@/utils/auditLogger', () => ({
  logActionStrict: vi.fn(async () => undefined),
  logAction,
  getRequestIp: () => 'unused-by-login',
}));
silenceLogger();

// The real API handler and next-auth core run end to end: CORS, NextAuth's
// CSRF check and callback route, then our authorize closure.
const {
  default: handler,
  authOptions,
} = require('../../../../pages/api/auth/[...nextauth]');
const argon2 = require('argon2');

const ENV_KEYS = [
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'DISABLE_TURNSTILE',
  'TRUSTED_PROXY_IPS',
  'OT_ENFORCE_PRIVILEGED_2FA',
  'NEXT_PUBLIC_DISABLE_LOGIN',
] as const;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

// Synthetic secret and account; argon2.verify is stubbed.
const SECRET = 'synthetic-nextauth-test-secret';
const CSRF_TOKEN = 'synthetic-csrf-token';
const account = {
  id: 125,
  email: 'player@example.com',
  display_name: 'Player',
  password_hash: '$argon2id$synthetic-placeholder',
  twoFactorSecret: null,
  alliance_memberships: [],
  last_active: new Date(),
};

const signInRequest = (
  remoteAddress: string,
  headers: Record<string, string> = {},
) => {
  const csrfHash = createHash('sha256')
    // NextAuth uses the secret captured at module load when one was set.
    .update(`${CSRF_TOKEN}${authOptions.secret ?? SECRET}`)
    .digest('hex');
  return {
    method: 'POST',
    url: '/api/auth/callback/credentials',
    query: { nextauth: ['callback', 'credentials'] },
    headers: { host: 'localhost:3000', ...headers },
    cookies: { 'next-auth.csrf-token': `${CSRF_TOKEN}|${csrfHash}` },
    body: {
      email: account.email,
      password: 'synthetic-password',
      csrfToken: CSRF_TOKEN,
      json: 'true',
    },
    socket: { remoteAddress },
  };
};

const makeRes = () => {
  const headers = new Map<string, unknown>();
  const res: any = {
    setHeader: vi.fn((name: string, value: unknown) => {
      headers.set(name.toLowerCase(), value);
      return res;
    }),
    getHeader: vi.fn((name: string) => headers.get(name.toLowerCase())),
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    send: vi.fn(() => res),
    end: vi.fn(() => res),
  };
  return res;
};

describe('[...nextauth] handler passes the resolved client IP to authorize', () => {
  let store: RateLimitStore;
  let verifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMockPrisma();
    store = installRateLimitStore(mockPrisma, vi);
    logAction.mockClear();
    process.env.NEXTAUTH_SECRET = SECRET;
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.DISABLE_TURNSTILE = 'true';
    process.env.OT_ENFORCE_PRIVILEGED_2FA = 'false';
    process.env.TRUSTED_PROXY_IPS = '10.0.0.9';
    delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    mockPrisma.users.findUnique = vi.fn(async () => account);
    mockPrisma.users.update = vi.fn(async () => account);
    mockPrisma.staffRoleAssignment.findFirst = vi.fn(async () => null);
    mockPrisma.accountStatusHistory = {
      findFirst: vi.fn(async () => ({
        status: 'ACTIVE',
        start_date: new Date(0),
        end_date: null,
      })),
      create: vi.fn(async () => ({})),
    };
    verifySpy = vi.spyOn(argon2, 'verify').mockResolvedValue(false);
  });

  afterEach(() => {
    verifySpy.mockRestore();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it('keys the failure budgets on the client behind trusted proxies', async () => {
    await handler(
      signInRequest('127.0.0.1', {
        'x-forwarded-for': '1.2.3.4, 198.51.100.23, 10.0.0.9',
      }),
      makeRes(),
    );

    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(store.consumed).toEqual([
      'login:fail:ip:198.51.100.23',
      `login:fail:account-ip:${account.email}:198.51.100.23`,
      `login:fail:account:${account.email}`,
    ]);
  });

  it('gives different clients separate per-IP budgets', async () => {
    await handler(
      signInRequest('127.0.0.1', { 'cf-connecting-ip': '198.51.100.1' }),
      makeRes(),
    );
    await handler(
      signInRequest('127.0.0.1', { 'cf-connecting-ip': '198.51.100.2' }),
      makeRes(),
    );
    expect(store.windowCount('login:fail:ip:198.51.100.1')).toBe(1);
    expect(store.windowCount('login:fail:ip:198.51.100.2')).toBe(1);
  });

  it('ignores forwarded headers from an untrusted peer', async () => {
    await handler(
      signInRequest('203.0.113.50', {
        'x-forwarded-for': '198.51.100.23',
        'cf-connecting-ip': '198.51.100.24',
      }),
      makeRes(),
    );
    expect(store.consumed[0]).toBe('login:fail:ip:203.0.113.50');
  });

  it('audits a successful login with the resolved IP', async () => {
    verifySpy.mockResolvedValue(true);
    const res = makeRes();
    await handler(
      signInRequest('127.0.0.1', { 'x-forwarded-for': '198.51.100.23' }),
      res,
    );
    expect(logAction).toHaveBeenCalledWith(125, 'LOGIN', '198.51.100.23', {
      method: 'credentials',
    });
    expect(res.json).toHaveBeenCalledWith({
      url: expect.not.stringContaining('error'),
    });
  });
});
