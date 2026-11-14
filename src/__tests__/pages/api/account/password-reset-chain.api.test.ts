/* eslint-disable no-console -- the assertions read the rate-limit store keys,
   not console; this header only keeps the file free of accidental console use. */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  vi,
} from 'bun:test';
import { createHash } from 'crypto';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import type { RateLimitStore } from 'test/utils/rateLimitStore';
import { installRateLimitStore } from 'test/utils/rateLimitStore';
import { installSessionSpy } from 'test/utils/sessionCookie';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Anonymous callers: the spy returns `req.testSession ?? null`, and requests
// below never set it — exactly the logged-out player the recovery flow serves.
installSessionSpy(vi);

// Guard wiring is captured, not executed: bun runs the whole suite in one
// process and earlier files replace '@/middleware/apiGuard' with pass-through
// captures that persist, so relying on the real guard's 422/405/429 behavior
// here is order-dependent. The guard's internals are covered by its own
// middleware tests; this file pins the registration contract and drives the
// handlers directly.
const guardOptions: unknown[] = [];
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: (options: unknown) => {
    guardOptions.push(options);
    return (handler: any) => (req: any, res: any) =>
      handler(req, res, { query: req.query ?? {}, body: req.body ?? {} });
  },
}));

// The mailer facade is the seam: AuthService.requestPasswordReset goes
// through Email.service.sendImmediate -> sendMail. Mocking '@/lib/mailer'
// keeps the real Email.service in the chain while guaranteeing no real SMTP.
const sendMail = vi.fn(async () => ({ messageId: 'synthetic-message-id' }));
mock.module('@/lib/mailer', () => ({
  getMailDriver: () => 'noop',
  sendMail,
  __resetMailerModuleCacheForTests: () => {},
}));

// Guard-captured routes and real AuthService/AccountService on top of the
// shared mock prisma.
const resetRoute = require('../../../../pages/api/account/reset').default;
const verifyRoute = require('../../../../pages/api/account/verify').default;
const passChangeRoute =
  require('../../../../pages/api/account/passChange').default;
const { verifyPassword } = require('@/lib/passwordHash');

const EMAIL = 'reset-player@example.com';
const USER_ID = 7;
const NEW_PASSWORD = 'synthetic-new-password-9';
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const savedUrlRoot = process.env.NEXT_PUBLIC_URL_ROOT;

const hashResetToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** Raw token as mailed to the player, extracted from the mailer facade call. */
const tokenFromMail = (call = 0): string => {
  const input = sendMail.mock.calls[call]?.[0] as { text: string };
  // The token rides in the reset link's fragment, never as visible text.
  const token = /verify#token=([0-9a-f]+)/.exec(input?.text ?? '')?.[1];
  if (!token) throw new Error('no reset token found in the mailed text');
  return token;
};

const makeRes = () => {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
    getHeader: vi.fn(() => undefined),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const callRoute = async (
  route: any,
  {
    body,
    method = 'POST',
    ip = '203.0.113.10',
    url,
  }: { body?: unknown; method?: string; ip?: string; url: string },
) => {
  const res = makeRes();
  await route(
    {
      method,
      url,
      headers: { host: 'localhost:3000' },
      // resolveClientIp keys the rate limit off the socket peer (forwarded
      // headers only count behind a trusted proxy), so the peer IS the IP.
      socket: { remoteAddress: ip },
      query: {},
      body,
    },
    res,
  );
  return res;
};

const callReset = (body: unknown, ip = '203.0.113.10') =>
  callRoute(resetRoute, { body, ip, url: '/api/account/reset' });
const callVerify = (body: unknown, ip = '203.0.113.10') =>
  callRoute(verifyRoute, { body, ip, url: '/api/account/verify' });
const callPassChange = (body: unknown, ip = '203.0.113.10') =>
  callRoute(passChangeRoute, { body, ip, url: '/api/account/passChange' });

type ResetRow = {
  id: number;
  userId: number;
  verificationCode: string;
  status: number;
  type: string;
  createdAt: Date;
};

/** Subset of Prisma's passwordReset `where` the service actually issues. */
const rowMatches = (row: ResetRow, where: any): boolean => {
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (
    where.verificationCode !== undefined &&
    row.verificationCode !== where.verificationCode
  )
    return false;
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.type !== undefined && row.type !== where.type) return false;
  const created = where.createdAt;
  if (created?.gt && !(row.createdAt > created.gt)) return false;
  return true;
};

describe('password-reset emailed-token chain (guard-none surface)', () => {
  let store: RateLimitStore;
  let resetRows: ResetRow[];
  let nextResetId: number;
  let passwordUpdates: Array<{ where: any; data: any }>;

  beforeEach(() => {
    // Emailed links need an absolute HTTPS root (renderEmail refuses otherwise).
    process.env.NEXT_PUBLIC_URL_ROOT = 'https://example.test';
    resetMockPrisma();
    store = installRateLimitStore(mockPrisma, vi);
    // The Auth service locks the user row inside its transaction with a raw
    // FOR UPDATE select; delegate everything else to the rate-limit store.
    const limiterRaw = mockPrisma.$queryRaw;
    mockPrisma.$queryRaw = vi.fn((strings: any, ...values: unknown[]) => {
      const sql = Array.isArray(strings) ? strings.join('?') : String(strings);
      if (sql.includes('FOR UPDATE')) return Promise.resolve([]);
      return limiterRaw(strings, ...values);
    });
    mockPrisma.$transaction = vi.fn(
      async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
        callback(mockPrisma),
    );

    resetRows = [];
    nextResetId = 1;
    passwordUpdates = [];
    mockPrisma.passwordReset = {
      findMany: vi.fn(async ({ where }: any) =>
        resetRows.filter((row) => rowMatches(row, where)),
      ),
      create: vi.fn(async ({ data }: any) => {
        const row: ResetRow = {
          id: nextResetId++,
          createdAt: new Date(),
          status: 0,
          ...data,
        };
        resetRows.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hits = resetRows.filter((row) => rowMatches(row, where));
        hits.forEach((row) => Object.assign(row, data));
        return { count: hits.length };
      }),
    };
    mockPrisma.users = {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.email === EMAIL || where.id === USER_ID)
          return { id: USER_ID, email: EMAIL };
        return null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        passwordUpdates.push({ where, data });
        return { id: where.id, ...data };
      }),
    };

    sendMail.mockClear();
    sendMail.mockResolvedValue({ messageId: 'synthetic-message-id' });

    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    if (!process.env.NEXTAUTH_SECRET) {
      process.env.NEXTAUTH_SECRET = 'synthetic-session-test-secret';
    }
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_URL;
    if (savedUrlRoot === undefined) delete process.env.NEXT_PUBLIC_URL_ROOT;
    else process.env.NEXT_PUBLIC_URL_ROOT = savedUrlRoot;
  });

  describe('the full emailed-token flow', () => {
    it('mails a token, verifies it, and completes the reset with the password actually re-hashed', async () => {
      // 1. Request: generic 200 + the mailer facade receives the send.
      const resetRes = await callReset({ email: EMAIL });
      expect(resetRes.status).toHaveBeenCalledWith(200);
      expect(resetRes.json).toHaveBeenCalledWith({
        status: true,
        message: 'If the account exists, a password reset email has been sent.',
      });
      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe(EMAIL);
      expect(mail.subject).toBe('Reset your OpenThrone password');
      expect(mail.text).toContain('/account/password-reset/verify');

      const token = tokenFromMail();
      // The token is stored hashed (sha256), never in the clear.
      expect(resetRows).toHaveLength(1);
      expect(resetRows[0].verificationCode).toBe(hashResetToken(token));
      expect(resetRows[0].status).toBe(0);

      // 2. Verify: the emailed token is accepted (route replies res.json —
      // implicit 200 — so status() is never called on the happy path).
      const verifyRes = await callVerify({ email: EMAIL, verify: token });
      expect(verifyRes.status).not.toHaveBeenCalled();
      expect(verifyRes.json).toHaveBeenCalledWith({
        status: true,
        verified: true,
      });

      // 3. Complete: 200 and the stored hash verifies against the new password.
      const changeRes = await callPassChange({
        email: EMAIL,
        verify: token,
        newPassword: NEW_PASSWORD,
      });
      expect(changeRes.json).toHaveBeenCalledWith({
        status: true,
        passwordChanged: true,
      });
      expect(passwordUpdates).toHaveLength(1);
      expect(passwordUpdates[0].where).toEqual({ id: USER_ID });
      const storedHash = passwordUpdates[0].data.password_hash;
      expect(typeof storedHash).toBe('string');
      await expect(verifyPassword(storedHash, NEW_PASSWORD)).resolves.toBe(
        true,
      );
      await expect(
        verifyPassword(storedHash, 'definitely-not-the-password'),
      ).resolves.toBe(false);

      // Consumption flipped the row: no second mail was sent, one row exists.
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(resetRows[0].status).toBe(1);
    });

    it('enforces single use: the same token cannot verify or complete a second reset', async () => {
      await callReset({ email: EMAIL });
      const token = tokenFromMail();
      await callPassChange({
        email: EMAIL,
        verify: token,
        newPassword: NEW_PASSWORD,
      });
      expect(passwordUpdates).toHaveLength(1);

      const replay = await callPassChange({
        email: EMAIL,
        verify: token,
        newPassword: 'another-synthetic-password',
      });
      expect(replay.status).toHaveBeenCalledWith(400);
      expect(replay.json).toHaveBeenCalledWith({
        status: false,
        error: 'Invalid or expired verification code',
      });
      expect(passwordUpdates).toHaveLength(1);

      const reverify = await callVerify({ email: EMAIL, verify: token });
      expect(reverify.status).toHaveBeenCalledWith(400);
      expect(reverify.json).toHaveBeenCalledWith({
        status: false,
        error: 'Invalid or expired verification code',
      });
    });

    it('invalidates previously mailed tokens when a new reset is requested', async () => {
      await callReset({ email: EMAIL });
      const firstToken = tokenFromMail(0);
      await callReset({ email: EMAIL });
      const secondToken = tokenFromMail(1);
      expect(secondToken).not.toBe(firstToken);
      expect(resetRows).toHaveLength(2);

      const oldTokenRes = await callVerify({
        email: EMAIL,
        verify: firstToken,
      });
      expect(oldTokenRes.status).toHaveBeenCalledWith(400);

      const newTokenRes = await callVerify({
        email: EMAIL,
        verify: secondToken,
      });
      expect(newTokenRes.status).not.toHaveBeenCalled();
      expect(newTokenRes.json).toHaveBeenCalledWith({
        status: true,
        verified: true,
      });
    });
  });

  describe('refusals', () => {
    it('rejects an expired token (3-hour lifetime)', async () => {
      resetRows.push({
        id: nextResetId++,
        userId: USER_ID,
        verificationCode: hashResetToken('expired-plaintext-token'),
        status: 0,
        type: 'PASSWORD',
        createdAt: new Date(Date.now() - THREE_HOURS_MS - 60_000),
      });

      const verifyRes = await callVerify({
        email: EMAIL,
        verify: 'expired-plaintext-token',
      });
      expect(verifyRes.status).toHaveBeenCalledWith(400);

      const changeRes = await callPassChange({
        email: EMAIL,
        verify: 'expired-plaintext-token',
        newPassword: NEW_PASSWORD,
      });
      expect(changeRes.status).toHaveBeenCalledWith(400);
      expect(changeRes.json).toHaveBeenCalledWith({
        status: false,
        error: 'Invalid or expired verification code',
      });
      expect(passwordUpdates).toHaveLength(0);
    });

    it('rejects an unknown token without touching the password', async () => {
      const verifyRes = await callVerify({
        email: EMAIL,
        verify: 'never-issued-token',
      });
      expect(verifyRes.status).toHaveBeenCalledWith(400);

      const changeRes = await callPassChange({
        email: EMAIL,
        verify: 'never-issued-token',
        newPassword: NEW_PASSWORD,
      });
      expect(changeRes.status).toHaveBeenCalledWith(400);
      expect(changeRes.json).toHaveBeenCalledWith({
        status: false,
        error: 'Invalid or expired verification code',
      });
      expect(passwordUpdates).toHaveLength(0);
    });

    it('does not disclose whether an email has an account (reset stays 200, no mail)', async () => {
      const resetRes = await callReset({ email: 'stranger@example.com' });
      expect(resetRes.status).toHaveBeenCalledWith(200);
      expect(resetRes.json).toHaveBeenCalledWith({
        status: true,
        message: 'If the account exists, a password reset email has been sent.',
      });
      expect(sendMail).not.toHaveBeenCalled();
      expect(resetRows).toHaveLength(0);

      const verifyRes = await callVerify({
        email: 'stranger@example.com',
        verify: 'any-token',
      });
      expect(verifyRes.status).toHaveBeenCalledWith(400);

      const changeRes = await callPassChange({
        email: 'stranger@example.com',
        verify: 'any-token',
        newPassword: NEW_PASSWORD,
      });
      // Same answer as a wrong code, so the address is not disclosed.
      expect(changeRes.status).toHaveBeenCalledWith(400);
      expect(changeRes.json).toHaveBeenCalledWith({
        status: false,
        error: 'Invalid or expired verification code',
      });
      expect(passwordUpdates).toHaveLength(0);
    });

    it('refuses malformed bodies at the right layer (guard 422, handler 400)', async () => {
      // reset and verify register strict body schemas at the guard: parsing
      // these payloads there is what answers 422 in production.
      const [resetGuard, verifyGuard] = guardOptions as {
        bodySchema: { safeParse: (v: unknown) => { success: boolean } };
      }[];
      expect(
        resetGuard.bodySchema.safeParse({ email: 'not-an-email' }).success,
      ).toBe(false);
      expect(verifyGuard.bodySchema.safeParse({ email: EMAIL }).success).toBe(
        false,
      );

      // passChange's guard schema is intentionally loose; the handler itself
      // rejects weak passwords with 400.
      const shortPassword = await callPassChange({
        email: EMAIL,
        verify: 'some-token',
        newPassword: 'short',
      });
      expect(shortPassword.status).toHaveBeenCalledWith(400);
      expect(shortPassword.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid request body' }),
      );
    });

    it('registers POST-only methods on all three routes', () => {
      const methods = (guardOptions as { methods: string[] }[]).map(
        (o) => o.methods,
      );
      expect(methods).toEqual([['POST'], ['POST'], ['POST']]);
    });
  });

  describe('failure and abuse containment', () => {
    it('still answers 200 and invalidates the token when the mail send fails', async () => {
      sendMail.mockRejectedValueOnce(new Error('synthetic SMTP failure'));

      const res = await callReset({ email: EMAIL });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: true,
        message: 'If the account exists, a password reset email has been sent.',
      });

      // The undelivered token must not stay usable.
      const token = tokenFromMail(0);
      expect(resetRows).toHaveLength(1);
      expect(resetRows[0].status).toBe(1);
      const verifyRes = await callVerify({ email: EMAIL, verify: token });
      expect(verifyRes.status).toHaveBeenCalledWith(400);
    });

    it('shares the password_reset profile across all three routes', async () => {
      // All three registrations name the same profile, so they draw on one
      // 6/min-per-IP budget in production; the limiter's own behavior (429
      // past the cap, per-IP isolation) is covered by the guard's tests.
      const profiles = (guardOptions as { rateLimitProfile?: string }[]).map(
        (o) => o.rateLimitProfile,
      );
      expect(profiles).toEqual([
        'password_reset',
        'password_reset',
        'password_reset',
      ]);

      // Repeated verify calls exercise the shared handler path (unknown
      // token -> 400) without tripping a real limiter in this harness.
      for (let i = 0; i < 6; i++) {
        const res = await callVerify(
          { email: EMAIL, verify: 'flood-token' },
          '203.0.113.77',
        );
        expect(res.status).toHaveBeenCalledWith(400);
      }
      expect(mockPrisma.passwordReset.findMany).toHaveBeenCalledTimes(6);
    });

    it('caps code attempts at 5 per account per 3h even across IPs and even with the correct code', async () => {
      await callReset({ email: EMAIL }, '203.0.113.101');
      const token = tokenFromMail();

      // Five wrong-code attempts, each from a fresh IP so the shared
      // per-IP password_reset profile never trips first.
      for (let i = 0; i < 5; i++) {
        const res = await callPassChange(
          { email: EMAIL, verify: `wrong-${i}`, newPassword: NEW_PASSWORD },
          `203.0.113.${110 + i}`,
        );
        expect(res.status).toHaveBeenCalledWith(400);
      }
      expect(
        store.consumed.filter(
          (key) => key === `password-reset-code:${USER_ID}`,
        ),
      ).toHaveLength(5);
      expect(passwordUpdates).toHaveLength(0);

      // Sixth attempt carries the CORRECT token — still refused.
      const locked = await callPassChange(
        { email: EMAIL, verify: token, newPassword: NEW_PASSWORD },
        '203.0.113.130',
      );
      expect(locked.status).toHaveBeenCalledWith(429);
      expect(locked.json).toHaveBeenCalledWith({
        status: false,
        error: 'Too many verification attempts. Request a new code.',
      });
      expect(passwordUpdates).toHaveLength(0);
    });
  });
});
