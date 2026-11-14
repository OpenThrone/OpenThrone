import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  vi,
} from 'bun:test';
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

// Route -> AllianceDuesService contract only (spied, not module-mocked, so
// the service suite in src/services/__tests__/allianceDues.test.ts keeps the
// real implementation); the rules are covered there.
const { AllianceDuesService } = await import('@/services/AllianceDues.service');
const { AllianceDuesError } = await import('@/constants/allianceDues');

const settingsRoute = (await import('@/pages/api/alliances/dues/settings'))
  .default;
const payRoute = (await import('@/pages/api/alliances/dues/pay')).default;
const statusRoute = (await import('@/pages/api/alliances/dues/status')).default;

const [settingsGuard, payGuard, statusGuard] = guardRegistrations;

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

const call = async (route: any, method: string, extra: Record<string, any>) => {
  const res = makeRes();
  await route(
    {
      method,
      headers: {},
      session: { user: { id: USER_ID } },
      body: extra.body ?? {},
      query: extra.query ?? {},
    },
    res,
  );
  return {
    status: res.status.mock.calls[0]?.[0],
    json: res.json.mock.calls[0]?.[0],
  };
};

let spies: any[] = [];
beforeEach(() => {
  resetMockPrisma?.();
  spies = [];
});
afterEach(() => {
  for (const spy of spies) spy.mockRestore();
});
const spy = (name: keyof typeof AllianceDuesService, impl: any) => {
  const s = vi.spyOn(AllianceDuesService as any, name as string);
  s.mockImplementation(impl);
  spies.push(s);
  return s;
};

describe('alliance dues routes', () => {
  it('registers writes with the game_write budget and reads signed-in only', () => {
    expect(settingsGuard).toMatchObject({
      methods: ['POST'],
      authMode: 'required',
    });
    expect(payGuard).toMatchObject({ methods: ['POST'], authMode: 'required' });
    expect(statusGuard).toMatchObject({
      methods: ['GET'],
      authMode: 'required',
    });
    expect(authWraps.slice(0, 2)).toEqual([
      { rateLimitProfile: 'game_write' },
      { rateLimitProfile: 'game_write' },
    ]);
  });

  it('saves settings as the session user and serializes BigInts', async () => {
    const update = spy('updateSettings', async () => ({
      message: 'Fee and dues saved',
      previous: { joinFee: 5n, duesAmount: 0n, duesPeriod: 'NONE' },
    }));
    const { status, json } = await call(settingsRoute, 'POST', {
      body: {
        allianceId: ALLIANCE_ID,
        joinFee: 1000,
        duesAmount: 500,
        duesPeriod: 'DAILY',
      },
    });
    expect(status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      allianceId: ALLIANCE_ID,
      actorId: USER_ID,
      joinFee: 1000,
      duesAmount: 500,
      duesPeriod: 'DAILY',
    });
    expect(JSON.stringify(json)).toContain('"joinFee":"5n"');
  });

  it.each([
    [{ duesPeriod: 'HOURLY' }],
    [{ joinFee: -1 }],
    [{ joinFee: 1.5 }],
    [{ joinFee: '1e9' }],
  ])('rejects a malformed body %p before the service', async (patch) => {
    const update = spy('updateSettings', async () => ({}));
    const { status } = await call(settingsRoute, 'POST', {
      body: {
        allianceId: ALLIANCE_ID,
        joinFee: 0,
        duesAmount: 0,
        duesPeriod: 'NONE',
        ...patch,
      },
    });
    expect(status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns a business refusal with its code', async () => {
    spy('updateSettings', async () => {
      throw new AllianceDuesError(
        'ALLIANCE_DUES_INVALID',
        'Daily dues can be at most 1,000,000 gold per member.',
      );
    });
    const { status, json } = await call(settingsRoute, 'POST', {
      body: {
        allianceId: ALLIANCE_ID,
        joinFee: 0,
        duesAmount: 2_000_000,
        duesPeriod: 'DAILY',
      },
    });
    expect(status).toBe(400);
    expect(json).toEqual({
      error: 'Daily dues can be at most 1,000,000 gold per member.',
      code: 'ALLIANCE_DUES_INVALID',
    });
  });

  it('pays arrears as the session user', async () => {
    const pay = spy('payArrears', async () => ({
      message: 'Paid',
      paid: 100n,
      arrears: 0n,
    }));
    const { status, json } = await call(payRoute, 'POST', {
      body: { allianceId: ALLIANCE_ID, amount: 100 },
    });
    expect(status).toBe(200);
    expect(pay).toHaveBeenCalledWith({
      allianceId: ALLIANCE_ID,
      userId: USER_ID,
      amount: 100,
    });
    expect(json.paid).toBe('100n');
  });

  it('refuses a zero payment before the service', async () => {
    const pay = spy('payArrears', async () => ({}));
    const { status } = await call(payRoute, 'POST', {
      body: { allianceId: ALLIANCE_ID, amount: 0 },
    });
    expect(status).toBe(400);
    expect(pay).not.toHaveBeenCalled();
  });

  it('reads the status for the session user without caching', async () => {
    const getStatus = spy('getStatus', async () => ({
      allianceId: ALLIANCE_ID,
      joinFee: 250n,
      duesAmount: 0n,
      duesPeriod: 'NONE',
      nextCollectionAt: null,
      member: null,
      canSetDues: false,
    }));
    const { status, json } = await call(statusRoute, 'GET', {
      query: { allianceId: String(ALLIANCE_ID) },
    });
    expect(status).toBe(200);
    expect(getStatus).toHaveBeenCalledWith(ALLIANCE_ID, USER_ID);
    expect(json.joinFee).toBe('250n');
  });
});
