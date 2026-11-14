import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Emulate the guard: method gate plus the route's own zod query and body
// schemas, so the route's server-side validation is what is under test.
const guardRegistrations: any[] = [];
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: (options: any) => {
    guardRegistrations.push(options);
    return (handler: any) => async (req: any, res: any) => {
      if (!options.methods.includes(req.method)) {
        return res.status(405).json({ message: 'Method not allowed' });
      }
      const query = options.querySchema?.safeParse(req.query);
      if (query && !query.success) {
        return res.status(422).json({ message: 'Invalid query parameters' });
      }
      const body =
        req.method === 'GET'
          ? undefined
          : options.bodySchema?.safeParse(req.body);
      if (body && !body.success) {
        return res.status(422).json({ message: 'Invalid request body' });
      }
      return handler(req, res, { query: query?.data, body: body?.data });
    };
  },
}));

const route = (await import('@/pages/api/admin/game/alliances/[allianceId]'))
  .default;

// Synthetic admin 1 editing synthetic alliance 7.
const ADMIN_ID = 1;
const ALLIANCE_ID = 7;

let alliance: { join_fee: bigint; dues_amount: bigint; dues_period: string };
let memberUpdates: any[];
let audits: any[];

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const post = async (body: unknown) => {
  const res = makeRes();
  await route(
    {
      method: 'POST',
      headers: {},
      query: { allianceId: String(ALLIANCE_ID) },
      body,
      session: { user: { id: ADMIN_ID } },
      socket: { remoteAddress: '192.0.2.1' },
    } as any,
    res,
  );
  return {
    status: res.status.mock.calls[0]?.[0],
    json: res.json.mock.calls[0]?.[0],
  };
};

const setDues = (patch: Record<string, unknown> = {}) =>
  post({
    action: 'set_dues',
    joinFee: 0,
    duesAmount: 0,
    duesPeriod: 'NONE',
    ...patch,
  });

beforeEach(() => {
  alliance = { join_fee: 0n, dues_amount: 0n, dues_period: 'NONE' };
  memberUpdates = [];
  audits = [];
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (operation: any) => {
    const snapshot = { ...alliance };
    try {
      return await operation(mockPrisma);
    } catch (error) {
      alliance = snapshot;
      throw error;
    }
  });
  mockPrisma.alliances = {
    findUnique: vi.fn(async () => ({ ...alliance })),
    update: vi.fn(async ({ data }: any) => {
      Object.assign(alliance, data);
      return alliance;
    }),
  };
  mockPrisma.alliance_memberships = {
    updateMany: vi.fn(async (args: any) => {
      memberUpdates.push(args);
      return { count: 3 };
    }),
  };
  mockPrisma.auditLog = {
    create: vi.fn(async ({ data }: any) => {
      audits.push(data);
      return data;
    }),
  };
});

describe('admin alliance join fee and dues edit', () => {
  it('sets fee and dues, starts the new period now and audits it', async () => {
    const { status } = await setDues({
      joinFee: 250_000,
      duesAmount: 100_000,
      duesPeriod: 'WEEKLY',
    });
    expect(status).toBe(200);
    expect(alliance).toEqual({
      join_fee: 250_000n,
      dues_amount: 100_000n,
      dues_period: 'WEEKLY',
    });
    // A new period marks every member paid through the current week.
    expect(memberUpdates).toHaveLength(1);
    expect(memberUpdates[0].data.dues_paid_through).toBeInstanceOf(Date);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'ADMIN_ALLIANCE_SET_DUES',
      userId: ADMIN_ID,
      entityType: 'Alliance',
      entityId: ALLIANCE_ID,
    });
    expect(JSON.stringify(audits[0].details)).toContain('"duesPeriod":"NONE"');
  });

  it("changing only the amount keeps members' paid-through dates", async () => {
    alliance = { join_fee: 0n, dues_amount: 100n, dues_period: 'DAILY' };
    expect(
      (await setDues({ duesAmount: 200, duesPeriod: 'DAILY' })).status,
    ).toBe(200);
    expect(memberUpdates).toHaveLength(0);
  });

  it.each([
    [{ joinFee: 10_000_001 }, 422],
    [{ joinFee: -1 }, 422],
    [{ joinFee: '100' }, 422],
    [{ joinFee: null }, 422],
    [{ duesPeriod: 'HOURLY' }, 422],
    [{ duesAmount: 20_000_001, duesPeriod: 'MONTHLY' }, 422],
    [{ duesAmount: 1_000_001, duesPeriod: 'DAILY' }, 400],
    [{ duesAmount: 5_000_001, duesPeriod: 'WEEKLY' }, 400],
    [{ duesAmount: 10, duesPeriod: 'NONE' }, 400],
    [{ duesAmount: 0, duesPeriod: 'DAILY' }, 400],
  ])('refuses %p without writing', async (patch, code) => {
    const { status } = await setDues(patch);
    expect(status).toBe(code);
    expect(alliance.dues_period).toBe('NONE');
    expect(alliance.join_fee).toBe(0n);
    expect(audits).toHaveLength(0);
  });

  it('refuses setting what is already set', async () => {
    const { status, json } = await setDues();
    expect(status).toBe(400);
    expect(json.error).toMatch(/already set/);
    expect(audits).toHaveLength(0);
  });
  it('refuses a stale edit instead of undoing a leader change made meanwhile', async () => {
    // The drawer loaded no fee; the leader has since set 2,000.
    alliance = { join_fee: 2_000n, dues_amount: 0n, dues_period: 'NONE' };
    const { status, json } = await setDues({
      joinFee: 0,
      duesAmount: 40_000,
      duesPeriod: 'WEEKLY',
      expected: { joinFee: 0, duesAmount: 0, duesPeriod: 'NONE' },
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/changed since you opened/);
    expect(alliance).toEqual({
      join_fee: 2_000n,
      dues_amount: 0n,
      dues_period: 'NONE',
    });
    expect(audits).toHaveLength(0);
  });

  it('saves when the expected values still match', async () => {
    const { status } = await setDues({
      duesAmount: 40_000,
      duesPeriod: 'WEEKLY',
      expected: { joinFee: 0, duesAmount: 0, duesPeriod: 'NONE' },
    });
    expect(status).toBe(200);
    expect(alliance.dues_amount).toBe(40_000n);
  });
});
