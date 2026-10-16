import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  vi,
} from 'bun:test';
import speakeasy from 'speakeasy';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import type { RateLimitStore } from 'test/utils/rateLimitStore';
import { installRateLimitStore } from 'test/utils/rateLimitStore';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Several suites replace withApiGuard process-wide with this same kind of
// pass-through (Bun module mocks are global), so this suite does too and tests
// the route itself. Guard behaviour for restricted sessions is covered in
// src/__tests__/middleware/apiGuard.restricted.test.ts.
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: () => (h: any) => (req: any, res: any) =>
    h(req, res, {
      query: req.query ?? {},
      body: req.body ?? {},
      accountRestriction: req.accountRestriction ?? null,
    }),
}));

const route = require('../../../../pages/api/appeals/index').default;
const argon2 = require('argon2');

const STAFF_ID = 3;
const PLAYER_ID = 7;
const BAN_RECORD_ID = 41;
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const APPEAL_BODY = 'Synthetic appeal text for review.';

// Synthetic fixture; the hash is a placeholder and argon2.verify is stubbed.
const player = {
  id: PLAYER_ID,
  password_hash: '$argon2id$synthetic-placeholder',
  twoFactorSecret: null as string | null,
};

const makeRes = () => {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
    getHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

let currentStatus: string | null = 'ACTIVE';
const setStatus = (status: string | null) => {
  currentStatus = status;
};

const call = async (
  req: { method: string; query?: any; body?: any },
  sessionUserId: number | null,
) => {
  const res = makeRes();
  await route(
    {
      headers: {},
      query: {},
      session: sessionUserId ? { user: { id: sessionUserId } } : undefined,
      ...req,
    },
    res,
  );
  return res;
};

describe('ban appeals', () => {
  let store: RateLimitStore;
  let verifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMockPrisma();
    store = installRateLimitStore(mockPrisma, vi);
    process.env.DISABLE_TURNSTILE = 'true';
    setStatus('ACTIVE');
    // Real permission path: staff role plus grant lookup, as in src/utils/authorization.
    mockPrisma.staffRoleAssignment.findMany = vi.fn(async ({ where }: any) =>
      where.userId === STAFF_ID ? [{ role: 'MODERATOR' }] : [],
    );
    mockPrisma.permissionGrant.findMany = vi.fn(async ({ where }: any) =>
      where.user_id === STAFF_ID ? [{ type: 'MANAGE_BAN_APPEALS' }] : [],
    );
    mockPrisma.accountStatusHistory = {
      findFirst: vi.fn(async () =>
        currentStatus
          ? {
              id: BAN_RECORD_ID,
              status: currentStatus,
              start_date: new Date(0),
              end_date: null,
            }
          : null,
      ),
    };
    mockPrisma.banAppeal = {
      findMany: vi.fn(async () => [{ id: 1, body: 'synthetic appeal' }]),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({ id: 99, ...data })),
    };
    // Session check reads by id; credential check reads by email.
    mockPrisma.users.findUnique = vi.fn(async ({ where }: any) =>
      where.id ? { email: `user${where.id}@example.com` } : player,
    );
    verifySpy = vi.spyOn(argon2, 'verify').mockResolvedValue(true);
  });

  afterEach(() => {
    verifySpy.mockRestore();
    delete process.env.DISABLE_TURNSTILE;
    player.twoFactorSecret = null;
  });

  describe('staff listing (APP-01)', () => {
    it('returns 403 to a logged-in non-staff user and reads no appeals', async () => {
      const res = await call({ method: 'GET' }, PLAYER_ID);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPrisma.banAppeal.findMany).not.toHaveBeenCalled();
    });

    it('returns 401 when there is no session', async () => {
      const res = await call({ method: 'GET' }, null);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockPrisma.banAppeal.findMany).not.toHaveBeenCalled();
    });

    it('lists appeals for a reviewer, with a bounded page size', async () => {
      const res = await call({ method: 'GET' }, STAFF_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockPrisma.banAppeal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('never lists all appeals to a banned reviewer', async () => {
      setStatus('BANNED');
      const res = await call({ method: 'GET' }, STAFF_ID);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPrisma.banAppeal.findMany).not.toHaveBeenCalled();
    });
  });

  describe('restricted sessions', () => {
    it.each(['BANNED', 'SUSPENDED'])(
      'lets a %s player read only their own appeals',
      async (status) => {
        setStatus(status);
        const res = await call(
          { method: 'GET', query: { scope: 'mine' } },
          PLAYER_ID,
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockPrisma.banAppeal.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { userId: PLAYER_ID } }),
        );
        const { select } = mockPrisma.banAppeal.findMany.mock.calls[0][0];
        expect(select.decidedBy).toBeUndefined();
        expect(select.assignedTo).toBeUndefined();
        expect(res.json.mock.calls[0][0].restriction).toMatchObject({
          id: BAN_RECORD_ID,
          status,
        });
      },
    );

    it('lets a banned session file an appeal against its own ban', async () => {
      setStatus('BANNED');
      const res = await call(
        { method: 'POST', body: { body: APPEAL_BODY } },
        PLAYER_ID,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockPrisma.banAppeal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: PLAYER_ID,
          accountStatusHistoryId: BAN_RECORD_ID,
        }),
      });
    });

    it('rejects an appeal naming another status record', async () => {
      setStatus('BANNED');
      const res = await call(
        {
          method: 'POST',
          body: { body: APPEAL_BODY, accountStatusHistoryId: 1234 },
        },
        PLAYER_ID,
      );
      expect(res.status).toHaveBeenCalledWith(422);
      expect(mockPrisma.banAppeal.create).not.toHaveBeenCalled();
    });

    it('refuses an appeal from an unrestricted account', async () => {
      const res = await call(
        { method: 'POST', body: { body: APPEAL_BODY } },
        PLAYER_ID,
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'no_active_restriction' });
    });

    it('returns the pending appeal instead of filing a duplicate', async () => {
      setStatus('SUSPENDED');
      mockPrisma.banAppeal.findFirst = vi.fn(async () => ({
        id: 5,
        status: 'IN_REVIEW',
      }));
      const res = await call(
        { method: 'POST', body: { body: APPEAL_BODY } },
        PLAYER_ID,
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'appeal_exists',
        appeal: { id: 5, status: 'IN_REVIEW' },
      });
      expect(mockPrisma.banAppeal.create).not.toHaveBeenCalled();
    });
  });

  describe('signed-out appeals re-verify credentials', () => {
    const credentialBody = (extra: Record<string, string> = {}) => ({
      email: 'banned@example.com',
      password: 'synthetic-password',
      body: APPEAL_BODY,
      ...extra,
    });

    beforeEach(() => setStatus('BANNED'));

    it('files the appeal once the password verifies', async () => {
      const res = await call({ method: 'POST', body: credentialBody() }, null);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockPrisma.banAppeal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: PLAYER_ID,
          accountStatusHistoryId: BAN_RECORD_ID,
        }),
      });
      // A correct password is not a failure.
      expect(store.windowCount('login:fail:account:banned@example.com')).toBe(
        0,
      );
    });

    it('rejects a wrong password and counts it against the login budget', async () => {
      verifySpy.mockResolvedValue(false);
      const res = await call({ method: 'POST', body: credentialBody() }, null);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid_credentials' });
      expect(mockPrisma.banAppeal.create).not.toHaveBeenCalled();
      expect(store.windowCount('login:fail:account:banned@example.com')).toBe(
        1,
      );
    });

    it('requires a captcha token when Turnstile is enforced', async () => {
      const flags = [
        'DISABLE_TURNSTILE',
        'NEXT_PUBLIC_DISABLE_TURNSTILE',
        'NEXT_PUBLIC_USE_CAPTCHA',
      ] as const;
      const saved = flags.map((flag) => process.env[flag]);
      for (const flag of flags) delete process.env[flag];
      try {
        const res = await call(
          { method: 'POST', body: credentialBody() },
          null,
        );
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'captcha_failed' });
        expect(verifySpy).not.toHaveBeenCalled();
        expect(store.consumed).not.toContain(
          'login:fail:account:banned@example.com',
        );
      } finally {
        flags.forEach((flag, index) => {
          if (saved[index] === undefined) delete process.env[flag];
          else process.env[flag] = saved[index];
        });
      }
    });

    it('requires the authenticator code for a 2FA account', async () => {
      player.twoFactorSecret = TOTP_SECRET;
      const missing = await call(
        { method: 'POST', body: credentialBody() },
        null,
      );
      expect(missing.json).toHaveBeenCalledWith({ error: 'totp_required' });

      const totpToken = speakeasy.totp({
        secret: TOTP_SECRET,
        encoding: 'base32',
      });
      const res = await call(
        { method: 'POST', body: credentialBody({ totpToken }) },
        null,
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 401 without a session or credentials', async () => {
      const res = await call(
        { method: 'POST', body: { body: APPEAL_BODY } },
        null,
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockPrisma.banAppeal.create).not.toHaveBeenCalled();
    });
  });
});
