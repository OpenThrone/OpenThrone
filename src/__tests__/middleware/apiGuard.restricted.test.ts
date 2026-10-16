import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import {
  installSessionSpy,
  sessionRequestFields,
} from 'test/utils/sessionCookie';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Real guard; sessions via a real JWT cookie or the shared spy
// (see test/utils/sessionCookie).
installSessionSpy(vi);
const { withApiGuard } = require('../../middleware/apiGuard');
const { authOptions } = require('../../pages/api/auth/[...nextauth]');

const USER_ID = 7;

const makeRes = () => {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    getHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

const run = async (
  options: Record<string, unknown>,
  status: string,
  impersonatedBy?: number,
  url?: string,
) => {
  mockPrisma.accountStatusHistory = {
    findFirst: vi.fn(async () => ({
      id: 1,
      status,
      start_date: new Date(0),
      end_date: null,
    })),
  };
  const inner = vi.fn(async (_req: any, res: any) => res.status(200).json({}));
  const res = makeRes();
  const session = await sessionRequestFields(authOptions, {
    id: USER_ID,
    email: 'restricted@example.com',
    ...(impersonatedBy ? { impersonatedBy } : {}),
  });
  await withApiGuard({ methods: ['GET'], ...options })(inner)(
    {
      method: 'GET',
      url,
      headers: { host: 'localhost:3000' },
      query: {},
      ...session,
    },
    res,
  );
  return { inner, res };
};

describe('apiGuard restricted-account allowlist', () => {
  beforeEach(() => {
    resetMockPrisma();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    mockPrisma.users.findUnique = vi.fn(async () => ({
      email: 'restricted@example.com',
    }));
  });

  it('blocks banned sessions on ordinary routes', async () => {
    const { inner, res } = await run({ authMode: 'required' }, 'BANNED');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(inner).not.toHaveBeenCalled();
  });

  it.each(['BANNED', 'SUSPENDED'])(
    'admits a %s session on an opted-in route and tells the handler',
    async (status) => {
      const { inner } = await run(
        { authMode: 'required', allowRestrictedAccount: true },
        status,
      );
      expect(inner).toHaveBeenCalledTimes(1);
      expect(inner.mock.calls[0][2].accountRestriction).toBe(status);
    },
  );

  it.each(['VACATION', 'CLOSED'])(
    'keeps %s sessions out even on opted-in routes',
    async (status) => {
      const { inner, res } = await run(
        { authMode: 'required', allowRestrictedAccount: true },
        status,
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(inner).not.toHaveBeenCalled();
    },
  );

  it('never admits a restricted session to staff routes', async () => {
    const { inner, res } = await run(
      { authMode: 'admin', allowRestrictedAccount: true },
      'BANNED',
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(inner).not.toHaveBeenCalled();
  });

  it('passes a null restriction for an unrestricted session', async () => {
    const { inner } = await run(
      { authMode: 'required', allowRestrictedAccount: true },
      'ACTIVE',
    );
    expect(inner.mock.calls[0][2].accountRestriction).toBeNull();
  });
});

describe('apiGuard impersonated staff access', () => {
  beforeEach(() => {
    resetMockPrisma();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    mockPrisma.users.findUnique = vi.fn(async () => ({
      email: 'restricted@example.com',
    }));
    // Simulate a target promoted after impersonation started.
    mockPrisma.staffRoleAssignment.findFirst = vi.fn(async () => ({
      role: 'ADMINISTRATOR',
    }));
    mockPrisma.staffRoleAssignment.findMany = vi.fn(async () => [
      { role: 'ADMINISTRATOR' },
    ]);
    mockPrisma.permissionGrant.findMany = vi.fn(async () => [
      { type: 'MANAGE_USERS' },
    ]);
  });

  it.each([
    { authMode: 'admin' },
    { authMode: 'permission', requiredAnyPermissions: ['MANAGE_USERS'] },
    { authMode: 'required', requiredAnyPermissions: ['MANAGE_USERS'] },
    { authMode: 'optional', requiredAllPermissions: ['MANAGE_USERS'] },
  ])('rejects impersonation on a privileged route: %j', async (options) => {
    const { inner, res } = await run(options, 'ACTIVE', 99);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(inner).not.toHaveBeenCalled();
    expect(mockPrisma.staffRoleAssignment.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.permissionGrant.findMany).not.toHaveBeenCalled();
  });

  it('keeps ordinary player routes accessible while impersonating', async () => {
    const { inner, res } = await run({ authMode: 'required' }, 'ACTIVE', 99);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('still admits a real administrator on an admin route', async () => {
    const { inner, res } = await run({ authMode: 'admin' }, 'ACTIVE');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe('apiGuard combined permission requirements', () => {
  beforeEach(() => {
    resetMockPrisma();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    mockPrisma.users.findUnique = vi.fn(async () => ({
      email: 'restricted@example.com',
    }));
    mockPrisma.staffRoleAssignment.findFirst = vi.fn(async () => ({
      role: 'ADMINISTRATOR',
    }));
    // Keep explicit grants separate from role expansion for this test.
    mockPrisma.staffRoleAssignment.findMany = vi.fn(async () => []);
    mockPrisma.permissionGrant.findMany = vi.fn(async () => [
      { type: 'MANAGE_USERS' },
    ]);
  });

  it.each(['permission', 'admin'])(
    'requires both all and any permission groups in %s mode',
    async (authMode) => {
      const { inner, res } = await run(
        {
          authMode,
          requiredAllPermissions: ['MANAGE_USERS'],
          requiredAnyPermissions: ['MANAGE_ACCOUNT_STATUS'],
        },
        'ACTIVE',
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(inner).not.toHaveBeenCalled();
    },
  );
});

describe('apiGuard stable rate limits', () => {
  it('shares a profile bucket across query variants and dynamic targets', async () => {
    resetMockPrisma();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    mockPrisma.users.findUnique = vi.fn(async () => ({
      email: 'restricted@example.com',
    }));
    mockPrisma.rateLimitBucket = {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    };
    mockPrisma.$queryRaw = vi.fn(async () => [{ count: 1 }]);
    await run(
      { authMode: 'required', rateLimitProfile: 'admin' },
      'ACTIVE',
      undefined,
      '/api/admin/users/1?nonce=a',
    );
    await run(
      { authMode: 'required', rateLimitProfile: 'admin' },
      'ACTIVE',
      undefined,
      '/api/admin/users/2?nonce=b',
    );
    const keys = mockPrisma.$queryRaw.mock.calls.map(
      (call: unknown[]) => call[1],
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toBe('admin:unknown');
  });
});
