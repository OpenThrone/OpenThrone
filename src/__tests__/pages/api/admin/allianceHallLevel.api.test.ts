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

let hallLevel: number;
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

beforeEach(() => {
  hallLevel = 1;
  audits = [];
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (operation: any) =>
    operation(mockPrisma),
  );
  mockPrisma.alliances = {
    findUnique: vi.fn(async () => ({ hall_level: hallLevel })),
    update: vi.fn(async ({ data }: any) => {
      hallLevel = data.hall_level;
      return { id: ALLIANCE_ID, hall_level: hallLevel };
    }),
  };
  mockPrisma.auditLog = {
    create: vi.fn(async ({ data }: any) => {
      audits.push(data);
      return data;
    }),
  };
});

describe('admin Alliance Hall level edit', () => {
  it('registers under MANAGE_ALLIANCES', () => {
    expect(guardRegistrations[0]).toMatchObject({
      authMode: 'permission',
      requiredAnyPermissions: ['MANAGE_ALLIANCES'],
    });
  });

  it('sets the level and writes the audit row in the same transaction', async () => {
    const { status } = await post({ action: 'set_hall_level', level: 4 });
    expect(status).toBe(200);
    expect(hallLevel).toBe(4);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'ADMIN_ALLIANCE_SET_HALL_LEVEL',
      userId: ADMIN_ID,
      entityType: 'Alliance',
      entityId: ALLIANCE_ID,
    });
    expect(JSON.stringify(audits[0].details)).toContain('"previousLevel":1');
  });

  it('accepts level 0 so staff can lower an alliance back to Camp', async () => {
    expect((await post({ action: 'set_hall_level', level: 0 })).status).toBe(
      200,
    );
    expect(hallLevel).toBe(0);
  });

  it.each([[6], [-1], [2.5], ['three'], [null]])(
    'refuses level %p without writing',
    async (level) => {
      const { status } = await post({ action: 'set_hall_level', level });
      expect(status).toBe(422);
      expect(hallLevel).toBe(1);
      expect(audits).toHaveLength(0);
    },
  );

  it('refuses a stale edit when the level changed after the drawer loaded', async () => {
    // The drawer showed level 0; the alliance has since bought level 1.
    const { status, json } = await post({
      action: 'set_hall_level',
      level: 0,
      fromLevel: 0,
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/changed to level 1/);
    expect(hallLevel).toBe(1);
    expect(audits).toHaveLength(0);
  });

  it('sets the level when the level the admin saw is still current', async () => {
    const { status } = await post({
      action: 'set_hall_level',
      level: 3,
      fromLevel: 1,
    });
    expect(status).toBe(200);
    expect(hallLevel).toBe(3);
  });

  it('refuses setting the level it already has', async () => {
    const { status, json } = await post({ action: 'set_hall_level', level: 1 });
    expect(status).toBe(400);
    expect(json.error).toMatch(/already at level 1/);
    expect(audits).toHaveLength(0);
  });
});
