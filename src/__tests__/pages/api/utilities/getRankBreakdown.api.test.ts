import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
silenceLogger();

const handler =
  require('../../../../pages/api/utilities/getRankBreakdown').default;
const {
  invalidateRuntimeConfigCache,
} = require('@/services/RuntimeConfig.service');

function setLoginDisabled(disabled: boolean) {
  process.env.NEXT_PUBLIC_DISABLE_LOGIN = String(disabled);
  invalidateRuntimeConfigCache();
}

const originalLogin = process.env.NEXT_PUBLIC_DISABLE_LOGIN;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('rank breakdown uses the shared current-era participant filter', () => {
  beforeEach(() => {
    resetMockPrisma();
    invalidateRuntimeConfigCache();
    mockPrisma.users.findMany = vi.fn().mockResolvedValue([]);
  });
  afterEach(() => {
    if (originalLogin === undefined)
      delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    else process.env.NEXT_PUBLIC_DISABLE_LOGIN = originalLogin;
    invalidateRuntimeConfigCache();
  });

  it('ranks only current-era participants with an active staff role during maintenance', async () => {
    setLoginDisabled(true);
    const res = makeRes();

    await handler({ method: 'GET', session: { user: { id: 7 } } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { where } = mockPrisma.users.findMany.mock.calls[0][0];
    expect(where).toMatchObject({
      id: { gt: 0 },
      currentEraId: 1,
      staffRoleAssignments: {
        some: {
          role: { in: ['ADMINISTRATOR', 'MODERATOR'] },
          revokedAt: null,
        },
      },
    });
    expect(where.last_active).toEqual({ gte: expect.any(Date) });
  });

  it('ranks current-era participants without a staff clause when login is open', async () => {
    setLoginDisabled(false);
    const res = makeRes();

    await handler({ method: 'GET', session: { user: { id: 125 } } }, res);

    const { where } = mockPrisma.users.findMany.mock.calls[0][0];
    expect(where.currentEraId).toBe(1);
    expect(where.staffRoleAssignments).toBeUndefined();
  });
});
