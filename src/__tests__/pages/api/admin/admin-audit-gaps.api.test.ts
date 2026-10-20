import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);

// Synthetic staff and player ids; none correspond to real accounts.
const MODERATOR_ID = 3;
const ADMIN_ID = 1;
const TARGET_ID = 10;
const OTHER_ID = 11;
const IP = '192.0.2.1';

const logAction = vi.fn();
const logActionStrict = vi.fn(async (_entry: any, _client?: any) => undefined);
mock.module('@/utils/auditLogger', () => ({
  logAction,
  logActionStrict,
  getRequestIp: () => IP,
}));
silenceLogger();

// Authorization is covered elsewhere; this pass-through guard only parses the
// query the way withApiGuard does so the audit behaviour can be asserted.
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard:
    (options: any) => (handler: any) => async (req: any, res: any) => {
      if (!options.methods.includes(req.method))
        return res.status(405).json({ message: 'Method not allowed' });
      const query = options.querySchema
        ? options.querySchema.parse(req.query)
        : (req.query ?? {});
      return handler(req, res, {
        requestId: 'test',
        actor: { type: 'session_admin', userId: Number(req.session.user.id) },
        actorType: 'session_admin',
        query,
        body: req.body,
      });
    },
}));

// Load routes fresh so a route cached by another file's guard mock is not reused.
delete require.cache[
  require.resolve('../../../../pages/api/admin/users/index')
];
const usersListHandler =
  require('../../../../pages/api/admin/users/index').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/users/[userId]')
];
const userDetailHandler =
  require('../../../../pages/api/admin/users/[userId]').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/moderation/bans/index')
];
const bansHandler =
  require('../../../../pages/api/admin/moderation/bans/index').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/attacks/index')
];
const attacksHandler =
  require('../../../../pages/api/admin/attacks/index').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/abuse/cheat-signals')
];
const cheatSignalsHandler =
  require('../../../../pages/api/admin/abuse/cheat-signals').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/abuse/investigation-signals')
];
const investigationHandler =
  require('../../../../pages/api/admin/abuse/investigation-signals').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/simulation/run')
];
const simulationHandler =
  require('../../../../pages/api/admin/simulation/run').default;

const makeRes = () => {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const makeReq = (actorId: number, overrides: Record<string, unknown> = {}) =>
  ({
    method: 'GET',
    headers: {},
    url: '/api/admin/test',
    socket: { remoteAddress: IP },
    session: { user: { id: String(actorId) } },
    query: {},
    body: undefined,
    ...overrides,
  }) as any;

const syntheticUser = (id: number) => ({
  id,
  display_name: `player-${id}`,
  email: `player-${id}@example.com`,
  last_active: new Date('2026-01-01T00:00:00Z'),
  created_at: new Date('2025-01-01T00:00:00Z'),
  currentEraId: 1,
  gold: BigInt(0),
  gold_in_bank: BigInt(0),
  experience: 0,
  UserUnit: [],
  UserItem: [],
  statusHistories: [],
  permissions: [],
  staffRoleAssignments: [],
});

beforeEach(() => {
  resetMockPrisma();
  logAction.mockClear();
  logActionStrict.mockReset();
  logActionStrict.mockImplementation(async () => undefined);
  mockPrisma.era = { findFirst: vi.fn(async () => ({ id: 1 })) };
});

describe('ADM-19: staff reads of account emails are audited', () => {
  beforeEach(() => {
    mockPrisma.users.findMany = vi.fn(async () => [
      syntheticUser(TARGET_ID),
      syntheticUser(OTHER_ID),
    ]);
    mockPrisma.users.count = vi.fn(async () => 2);
    mockPrisma.users.findUnique = vi.fn(async () => syntheticUser(TARGET_ID));
  });

  it('writes one audit row per user-list request without the email search term', async () => {
    const res = makeRes();
    await usersListHandler(
      makeReq(MODERATOR_ID, {
        query: { email: 'player-1', username: 'play', limit: '25' },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledTimes(1);
    const entry = logActionStrict.mock.calls[0][0];
    expect(entry).toMatchObject({
      userId: MODERATOR_ID,
      action: 'ADMIN_USERS_LIST_READ',
      ip: IP,
      details: {
        filters: {
          id: null,
          username: 'play',
          emailFilter: true,
          status: null,
        },
        limit: 25,
        offset: 0,
        resultCount: 2,
        total: 2,
        userIds: [TARGET_ID, OTHER_ID],
      },
    });
    expect(JSON.stringify(entry)).not.toContain('player-1');
    expect(JSON.stringify(entry)).not.toContain('@example.com');
  });

  it('returns no user list when its audit row cannot be written', async () => {
    logActionStrict.mockRejectedValueOnce(new Error('audit down'));
    const res = makeRes();
    await usersListHandler(makeReq(MODERATOR_ID), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch users' });
  });

  it('audits a user-detail read against the target account', async () => {
    const res = makeRes();
    await userDetailHandler(
      makeReq(MODERATOR_ID, { query: { userId: String(TARGET_ID) } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith({
      userId: MODERATOR_ID,
      action: 'ADMIN_USER_DETAIL_READ',
      ip: IP,
      targetUserId: TARGET_ID,
    });
  });

  it('withholds the user detail when its audit row cannot be written', async () => {
    logActionStrict.mockRejectedValueOnce(new Error('audit down'));
    const res = makeRes();
    await userDetailHandler(
      makeReq(MODERATOR_ID, { query: { userId: String(TARGET_ID) } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(200);
  });

  it('audits the banned-users list, which carries emails', async () => {
    mockPrisma.accountStatusHistory.findMany = vi.fn(async () => [
      { id: 1, user_id: TARGET_ID, user: syntheticUser(TARGET_ID) },
    ]);
    mockPrisma.accountStatusHistory.count = vi.fn(async () => 1);
    const res = makeRes();
    await bansHandler(makeReq(MODERATOR_ID), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith({
      userId: MODERATOR_ID,
      action: 'ADMIN_BANNED_USERS_READ',
      ip: IP,
      details: {
        limit: 50,
        offset: 0,
        resultCount: 1,
        total: 1,
        userIds: [TARGET_ID],
      },
    });
  });
});

describe('ADM-19: attack, cheat and investigation reads are audited', () => {
  it('audits a single attack read with both participants', async () => {
    mockPrisma.attack_log.findUnique = vi.fn(async () => ({
      id: 42,
      timestamp: new Date('2026-01-01T00:00:00Z'),
      type: 'attack',
      winner: TARGET_ID,
      pillaged_gold: BigInt(5),
      attacker_losses_total: 0,
      defender_losses_total: 0,
      attackerPlayer: { id: OTHER_ID, display_name: 'attacker' },
      defenderPlayer: { id: TARGET_ID, display_name: 'defender' },
      stats: {},
    }));
    const res = makeRes();
    await attacksHandler(makeReq(MODERATOR_ID, { query: { id: '42' } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith({
      userId: MODERATOR_ID,
      action: 'ADMIN_ATTACK_READ',
      ip: IP,
      targetUserId: TARGET_ID,
      entityType: 'attack_log',
      entityId: 42,
      details: { attackerId: OTHER_ID, defenderId: TARGET_ID },
    });
  });

  it('audits the attack ledger with its filter and result count', async () => {
    mockPrisma.attack_log.count = vi.fn(async () => 1);
    mockPrisma.attack_log.findMany = vi.fn(async () => [
      { id: 42, pillaged_gold: null },
    ]);
    const res = makeRes();
    await attacksHandler(
      makeReq(MODERATOR_ID, { query: { playerId: String(TARGET_ID) } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith({
      userId: MODERATOR_ID,
      action: 'ADMIN_ATTACKS_LIST_READ',
      ip: IP,
      targetUserId: TARGET_ID,
      details: {
        playerId: TARGET_ID,
        type: null,
        from: null,
        to: null,
        page: 1,
        resultCount: 1,
        total: 1,
      },
    });
  });

  it('audits the cheat-signal list against the filtered player', async () => {
    mockPrisma.cheatSignal = {
      findMany: vi.fn(async () => [{ id: 7, userId: TARGET_ID }]),
      count: vi.fn(async () => 1),
    };
    const res = makeRes();
    await cheatSignalsHandler(
      makeReq(MODERATOR_ID, {
        query: { userId: String(TARGET_ID), status: 'OPEN' },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith({
      userId: MODERATOR_ID,
      action: 'ADMIN_CHEAT_SIGNALS_READ',
      ip: IP,
      targetUserId: TARGET_ID,
      details: {
        status: 'OPEN',
        severity: null,
        limit: 25,
        offset: 0,
        resultCount: 1,
        total: 1,
      },
    });
  });

  it('audits investigation signals and withholds them when the audit fails', async () => {
    mockPrisma.$transaction = vi.fn(async () => ({
      since: '2026-01-01T00:00:00.000Z',
      until: '2026-01-07T00:00:00.000Z',
      findings: [{ type: 'FEEDING' }],
      limitedTypes: [],
      snapshotCoverage: {},
    }));

    const res = makeRes();
    await investigationHandler(makeReq(MODERATOR_ID), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith({
      userId: MODERATOR_ID,
      action: 'ADMIN_INVESTIGATION_SIGNALS_READ',
      ip: IP,
      details: { days: 7, resultCount: 1 },
    });

    logActionStrict.mockRejectedValueOnce(new Error('audit down'));
    const failed = makeRes();
    await expect(
      investigationHandler(makeReq(MODERATOR_ID), failed),
    ).rejects.toThrow('audit down');
    expect(failed.json).not.toHaveBeenCalled();
  });
});

describe('ADM-19: simulation runs are audited', () => {
  const body = { populationSize: 2, days: 1, levelRange: [1, 2], seed: 7 };

  it('records the validated configuration before running', async () => {
    const res = makeRes();
    await simulationHandler(makeReq(ADMIN_ID, { method: 'POST', body }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledTimes(1);
    expect(logActionStrict.mock.calls[0][0]).toMatchObject({
      userId: ADMIN_ID,
      action: 'ADMIN_SIMULATION_RUN',
      ip: IP,
      details: {
        config: { populationSize: 2, days: 1, levelRange: [1, 2], seed: 7 },
      },
    });
  });

  it('does not run a simulation that cannot be recorded', async () => {
    logActionStrict.mockRejectedValueOnce(new Error('audit down'));
    const res = makeRes();
    await simulationHandler(makeReq(ADMIN_ID, { method: 'POST', body }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(200);
  });
});
