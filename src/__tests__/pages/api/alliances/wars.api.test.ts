import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

// War permission and target validation (declare_war permission, no self-war,
// exactly one defender) live in AllianceWarService; the routes are pinned to
// the service contract. The UI confirm step is client-side (DeclareWarModal),
// so on the server the guard is the service's target validation.
const declareWar = vi.fn();
const getActiveWars = vi.fn();
mock.module('@/services', () => ({
  AllianceWarService: { declareWar, getActiveWars },
}));

const declareRoute =
  require('../../../../pages/api/alliances/wars/declare').default;
const indexRoute =
  require('../../../../pages/api/alliances/wars/index').default;

const DECLARER_ID = 5;
const OUTSIDER_ID = 7;
const ALLIANCE_ID = 3;
const ENEMY_ALLIANCE_ID = 9;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const makeReq = (
  method: string,
  extra: { body?: unknown; query?: unknown; session?: object | null } = {},
) => ({
  method,
  headers: {},
  session:
    extra.session === undefined ? { user: { id: DECLARER_ID } } : extra.session,
  body: extra.body ?? {},
  query: extra.query ?? {},
});

beforeEach(() => {
  resetMockPrisma();
  declareWar.mockReset();
  getActiveWars.mockReset();
  mockPrisma.alliance_memberships = {
    findFirst: vi.fn(async () => ({ id: 42 })),
  };
});

describe('POST /api/alliances/wars/declare', () => {
  it('declares a war against an enemy alliance with the declarer id attached', async () => {
    const war = {
      id: 77,
      attacker_alliance_id: ALLIANCE_ID,
      defender_alliance_id: ENEMY_ALLIANCE_ID,
      defender_user_id: null,
      declared_by_user_id: DECLARER_ID,
      status: 'WARMUP',
    };
    declareWar.mockResolvedValue(war);
    const res = makeRes();

    await declareRoute(
      makeReq('POST', {
        body: {
          allianceId: ALLIANCE_ID,
          defenderAllianceId: ENEMY_ALLIANCE_ID,
        },
      }),
      res,
    );

    expect(declareWar).toHaveBeenCalledWith({
      allianceId: ALLIANCE_ID,
      defenderAllianceId: ENEMY_ALLIANCE_ID,
      defenderUserId: undefined,
      declarerUserId: DECLARER_ID,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(war);
  });

  it('supports declaring on a lone user instead of an alliance', async () => {
    declareWar.mockResolvedValue({ id: 78, defender_user_id: 12 });
    const res = makeRes();

    await declareRoute(
      makeReq('POST', {
        body: { allianceId: ALLIANCE_ID, defenderUserId: 12 },
      }),
      res,
    );

    expect(declareWar).toHaveBeenCalledWith(
      expect.objectContaining({
        allianceId: ALLIANCE_ID,
        defenderAllianceId: undefined,
        defenderUserId: 12,
        declarerUserId: DECLARER_ID,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards the target guard refusal when no defender is supplied', async () => {
    // The service's schema refine is the confirm guard: a declaration must
    // name exactly one defender. The route surfaces it as a 400.
    declareWar.mockRejectedValue(
      new Error('Must provide either defenderAllianceId or defenderUserId'),
    );
    const res = makeRes();

    await declareRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID } }),
      res,
    );

    expect(declareWar).toHaveBeenCalledWith(
      expect.objectContaining({ allianceId: ALLIANCE_ID }),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Must provide either defenderAllianceId or defenderUserId',
    });
  });

  it.each([
    ['no declare_war permission', 'You do not have permission to declare war'],
    ['self-war', 'Cannot declare war on your own alliance'],
    ['duplicate war', 'War already declared against this alliance'],
  ])('surfaces the %s refusal as a sanitized 400', async (_label, message) => {
    declareWar.mockRejectedValue(new Error(message));
    const res = makeRes();

    await declareRoute(
      makeReq('POST', {
        body: {
          allianceId: ALLIANCE_ID,
          defenderAllianceId: ENEMY_ALLIANCE_ID,
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: message });
  });

  it('rejects a body without allianceId with field errors', async () => {
    const res = makeRes();

    await declareRoute(
      makeReq('POST', { body: { defenderAllianceId: ENEMY_ALLIANCE_ID } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid request body',
      details: { allianceId: [expect.stringContaining('Required')] },
    });
    expect(declareWar).not.toHaveBeenCalled();
  });

  it('sanitizes internal failures to the generic message', async () => {
    declareWar.mockRejectedValue(
      Object.assign(new Error('ECONNREFUSED 127.0.0.1:5432'), {
        name: 'PrismaClientInitializationError',
      }),
    );
    const res = makeRes();

    await declareRoute(
      makeReq('POST', {
        body: { allianceId: ALLIANCE_ID, defenderUserId: 12 },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Something went wrong. Please try again.',
    });
  });

  it('returns 405 for non-POST methods', async () => {
    const res = makeRes();

    await declareRoute(makeReq('GET'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
    expect(declareWar).not.toHaveBeenCalled();
  });
});

describe('GET /api/alliances/wars', () => {
  it('lists active wars for a member', async () => {
    getActiveWars.mockResolvedValue([{ id: 77, status: 'ACTIVE' }]);
    const res = makeRes();

    await indexRoute(
      makeReq('GET', { query: { allianceId: String(ALLIANCE_ID) } }),
      res,
    );

    expect(mockPrisma.alliance_memberships.findFirst).toHaveBeenCalledWith({
      where: { alliance_id: ALLIANCE_ID, user_id: DECLARER_ID },
      select: { id: true },
    });
    expect(getActiveWars).toHaveBeenCalledWith(ALLIANCE_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ id: 77, status: 'ACTIVE' }]);
  });

  it('gates non-members out with 403 and reads no wars', async () => {
    mockPrisma.alliance_memberships.findFirst = vi.fn(async () => null);
    const res = makeRes();

    await indexRoute(
      makeReq('GET', {
        query: { allianceId: String(ALLIANCE_ID) },
        session: { user: { id: OUTSIDER_ID } },
      }),
      res,
    );

    expect(mockPrisma.alliance_memberships.findFirst).toHaveBeenCalledWith({
      where: { alliance_id: ALLIANCE_ID, user_id: OUTSIDER_ID },
      select: { id: true },
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'You are not a member of this alliance',
    });
    expect(getActiveWars).not.toHaveBeenCalled();
  });

  it('requires allianceId in the query', async () => {
    const res = makeRes();

    await indexRoute(makeReq('GET', { query: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'allianceId is required' });
    expect(getActiveWars).not.toHaveBeenCalled();
  });

  it('maps service failures to a sanitized 400', async () => {
    getActiveWars.mockRejectedValue(new Error('war lookup exploded'));
    const res = makeRes();

    await indexRoute(
      makeReq('GET', { query: { allianceId: String(ALLIANCE_ID) } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'war lookup exploded' });
  });

  it('returns 405 for non-GET methods', async () => {
    const res = makeRes();

    await indexRoute(makeReq('POST'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
    expect(getActiveWars).not.toHaveBeenCalled();
  });
});
