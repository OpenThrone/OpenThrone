import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
vi.mock('@/services', () => ({
  GeneralService: {
    getUserData: vi.fn(async () => ({ id: 125, display_name: 'Player' })),
  },
}));
silenceLogger();

const handler = require('../../../../pages/api/general/getUser').default;

const makeReq = (userId: number, headers: Record<string, string> = {}) =>
  ({
    method: 'GET',
    headers,
    socket: { remoteAddress: '203.0.113.10' },
    session: { user: { id: userId } },
  }) as any;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

const seenInsertCount = () => mockPrisma.$transaction.mock.calls.length;

describe('daily seen telemetry on authenticated activity', () => {
  beforeEach(() => {
    mockPrisma.loginEvent = { create: vi.fn(async () => ({})) };
    mockPrisma.$transaction = vi.fn(
      async (callback: (tx: unknown) => unknown) =>
        callback({ $executeRaw: vi.fn(async () => 1) }),
    );
  });

  it('records one SEEN row per user per UTC day, not one per request', async () => {
    const res1 = makeRes();
    await handler(
      makeReq(125, { 'user-agent': 'Synthetic Browser/1.0' }),
      res1,
    );
    expect(res1.status).toHaveBeenCalledWith(200);
    expect(seenInsertCount()).toBe(1);

    const res2 = makeRes();
    await handler(makeReq(125), res2);
    expect(res2.status).toHaveBeenCalledWith(200);
    // The in-process daily guard holds: no second insert today.
    expect(seenInsertCount()).toBe(1);
  });

  it('does not record seen telemetry for an impersonated session', async () => {
    const req = makeReq(126);
    req.session = {
      user: { id: 126, impersonatedBy: 7, impersonationExpiresAt: 1 },
    };
    await handler(req, makeRes());
    expect(seenInsertCount()).toBe(0);
  });

  it('never fails the request when telemetry cannot be written', async () => {
    mockPrisma.$transaction = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const res = makeRes();
    await handler(makeReq(127), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 125 }));
  });
});
