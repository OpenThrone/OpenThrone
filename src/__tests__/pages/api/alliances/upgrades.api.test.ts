import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, resetMockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);

// Capture each route's guard registration, then emulate the guard: method
// gate plus the route's own zod query and body schemas.
const guardRegistrations: any[] = [];
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: (options: any) => {
    guardRegistrations.push(options);
    return (handler: any) => async (req: any, res: any) => {
      if (!options.methods.includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      try {
        const body = options.bodySchema
          ? options.bodySchema.parse(req.body)
          : req.body;
        const query = options.querySchema
          ? options.querySchema.parse(req.query)
          : req.query;
        return handler(req, res, { body, query });
      } catch {
        return res.status(400).json({ error: 'Invalid request' });
      }
    };
  },
}));

const authWraps: any[] = [];
mock.module('@/middleware/auth', () => ({
  withAuth: (h: any, options?: any) => {
    authWraps.push(options);
    return h;
  },
}));

// Route -> AllianceUpgradeService contract only; the rules are covered by
// src/services/__tests__/allianceHall.test.ts.
const getStatus = vi.fn();
const purchase = vi.fn();
mock.module('@/services/AllianceUpgrade.service', () => ({
  AllianceUpgradeService: { getStatus, purchase },
}));

const statusRoute =
  require('../../../../pages/api/alliances/upgrades/index').default;
const purchaseRoute =
  require('../../../../pages/api/alliances/upgrades/purchase').default;

const [statusGuard, purchaseGuard] = guardRegistrations;

const USER_ID = 5;
const ALLIANCE_ID = 3;

const makeRes = () => {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const makeReq = (
  method: string,
  extra: { body?: unknown; query?: unknown },
) => ({
  method,
  headers: {},
  session: { user: { id: USER_ID } },
  body: extra.body ?? {},
  query: extra.query ?? {},
});

beforeEach(() => {
  resetMockPrisma();
  getStatus.mockReset();
  purchase.mockReset();
});

describe('guard wiring', () => {
  it('requires auth on both routes and budgets purchases as game writes', () => {
    expect(statusGuard).toMatchObject({
      methods: ['GET'],
      authMode: 'required',
    });
    expect(purchaseGuard).toMatchObject({
      methods: ['POST'],
      authMode: 'required',
    });
    expect(authWraps[1]).toMatchObject({ rateLimitProfile: 'game_write' });
  });
});

describe('GET /api/alliances/upgrades', () => {
  it('returns the status with BigInt treasury as a string', async () => {
    getStatus.mockResolvedValue({ hallLevel: 1, treasury: 5n });
    const res = makeRes();
    await statusRoute(
      makeReq('GET', { query: { allianceId: String(ALLIANCE_ID) } }),
      res,
    );
    expect(getStatus).toHaveBeenCalledWith(ALLIANCE_ID, USER_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ hallLevel: 1, treasury: '5n' });
  });

  it('maps a non-member to 403', async () => {
    getStatus.mockRejectedValue(new Error('Forbidden: only alliance members'));
    const res = makeRes();
    await statusRoute(
      makeReq('GET', { query: { allianceId: String(ALLIANCE_ID) } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('POST /api/alliances/upgrades/purchase', () => {
  it('buys for the session user, never a body-supplied actor', async () => {
    purchase.mockResolvedValue({ message: 'ok', hallLevel: 1 });
    const res = makeRes();
    await purchaseRoute(
      makeReq('POST', {
        body: { allianceId: ALLIANCE_ID, level: 1, actorId: 99 },
      }),
      res,
    );
    expect(purchase).toHaveBeenCalledWith({
      allianceId: ALLIANCE_ID,
      actorId: USER_ID,
      level: 1,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects a level outside 1..5 before the service', async () => {
    for (const level of [0, 6, 1.5, '1']) {
      const res = makeRes();
      await purchaseRoute(
        makeReq('POST', { body: { allianceId: ALLIANCE_ID, level } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(purchase).not.toHaveBeenCalled();
  });

  it('returns a refusal as a sanitized 400', async () => {
    purchase.mockRejectedValue(
      new Error('You do not have permission to buy alliance upgrades'),
    );
    const res = makeRes();
    await purchaseRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, level: 1 } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'You do not have permission to buy alliance upgrades',
    });
  });
});
