import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);

// The routes' guard configuration is what is under test: record it, then run
// the handler directly. The real guard's 401/403 behaviour has its own suite.
const guards: Array<{ options: any }> = [];
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: (options: any) => (handler: any) => {
    guards.push({ options });
    return async (req: any, res: any) => handler(req, res, { body: req.body });
  },
}));
const logActionStrict = vi.fn(async () => undefined);
mock.module('@/utils/auditLogger', () => ({
  logAction: vi.fn(),
  logActionStrict,
  getRequestIp: () => '192.0.2.1',
}));

delete require.cache[
  require.resolve('../../../../pages/api/admin/abuse/cheat-signals')
];
const listHandler =
  require('../../../../pages/api/admin/abuse/cheat-signals').default;

const listGuard = guards[guards.length - 1].options;
delete require.cache[
  require.resolve('../../../../pages/api/admin/abuse/cheat-signals/[action]')
];
const actionHandler =
  require('../../../../pages/api/admin/abuse/cheat-signals/[action]').default;

const actionGuard = guards[guards.length - 1].options;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};
const req = (over: Record<string, unknown> = {}) => ({
  method: 'GET',
  query: {},
  session: { user: { id: '3' } },
  ...over,
});

beforeEach(() => {
  logActionStrict.mockClear();
  mockPrisma.cheatSignal = {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  };
  mockPrisma.users.findMany = vi.fn(async () => []);
});

describe('abuse signal admin routes are staff-only', () => {
  it('requires a staff permission and a session on both routes', () => {
    expect(listGuard.authMode).toBe('permission');
    expect(listGuard.requiredAnyPermissions).toEqual(['VIEW_CHEAT_SIGNALS']);
    expect(listGuard.methods).toEqual(['GET']);
    expect(actionGuard.authMode).toBe('permission');
    expect(actionGuard.requiredAnyPermissions).toEqual([
      'MANAGE_ACCOUNT_STATUS',
    ]);
    expect(actionGuard.methods).toEqual(['POST']);
  });
});

describe('abuse signal list route', () => {
  it('filters by type, severity, status and any involved player', async () => {
    const res = makeRes();
    await listHandler(
      req({
        query: {
          type: 'RESOURCE_FUNNELLING',
          severity: 'HIGH',
          status: 'OPEN',
          userId: '42',
        },
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const { where } = mockPrisma.cheatSignal.findMany.mock.calls[0][0];
    expect(where.type).toBe('RESOURCE_FUNNELLING');
    expect(where.severity).toBe('HIGH');
    expect(where.status).toBe('OPEN');
    expect(where.OR).toEqual([
      { userId: 42 },
      { relatedUserId: 42 },
      { linkedUserIds: { has: 42 } },
    ]);
  });

  it('rejects unknown filter values instead of throwing', async () => {
    for (const query of [
      { type: 'NOPE' },
      { severity: 'EXTREME' },
      { status: 'MAYBE' },
      { userId: 'abc' },
    ]) {
      const res = makeRes();
      await listHandler(req({ query }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockPrisma.cheatSignal.findMany).not.toHaveBeenCalled();
  });

  it('caps the page size and audits the read', async () => {
    const res = makeRes();
    await listHandler(
      req({ query: { limit: '5000', type: 'BOT_TIMING' } }),
      res,
    );
    expect(mockPrisma.cheatSignal.findMany.mock.calls[0][0].take).toBe(100);
    expect(logActionStrict).toHaveBeenCalledTimes(1);
    expect(logActionStrict.mock.calls[0][0]).toMatchObject({
      action: 'ADMIN_CHEAT_SIGNALS_READ',
      details: { type: 'BOT_TIMING', limit: 100 },
    });
  });
});

describe('abuse signal review route', () => {
  const post = (action: string, body: Record<string, unknown>) =>
    req({
      method: 'POST',
      url: `/api/admin/abuse/cheat-signals/${action}`,
      body,
    });

  it('requires a note to dismiss', async () => {
    const res = makeRes();
    await actionHandler(post('dismiss', { signalId: 5 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'A note is required to dismiss',
    });
  });

  it('rejects unknown actions', async () => {
    const res = makeRes();
    await actionHandler(post('ban', { signalId: 5 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
