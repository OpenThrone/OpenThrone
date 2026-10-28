import { beforeEach, describe, expect, it, mock, spyOn, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: () => (h: any) => (req: any, res: any) =>
    h(req, res, { query: req.query ?? {}, body: req.body ?? {} }),
}));
silenceLogger();

// Synthetic accounts and log; none correspond to real players.
const ATTACKER_ID = 1;
const DEFENDER_ID = 2;
const OUTSIDER_ID = 7;
const LOG_ID = 100;
const ROOM_ID = 42;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const setAdmins = (admins: number[]) => {
  mockPrisma.staffRoleAssignment.findFirst.mockImplementation(
    async ({ where }: any) =>
      admins.includes(where.userId) && where.role === 'ADMINISTRATOR'
        ? { id: 1 }
        : null,
  );
};

const aclRoute = require('../../../../pages/api/attack/logs/[id]/acl').default;
const retestRoute = require('../../../../pages/api/attack/retest/[id]').default;
const battleTestRoute =
  require('../../../../pages/api/attack/battleTest').default;

beforeEach(() => {
  resetMockPrisma();
  mockPrisma.$transaction = vi.fn(async (cb: any) =>
    typeof cb === 'function' ? cb(mockPrisma) : cb,
  );
  mockPrisma.$queryRaw = vi.fn(async () => []);
  setAdmins([]);
  mockPrisma.attack_log = {
    findUnique: vi.fn(async () => ({
      id: LOG_ID,
      attacker_id: ATTACKER_ID,
      defender_id: DEFENDER_ID,
      stats: {},
      pillaged_gold: 5n,
    })),
  };
  mockPrisma.attack_log_acl = {
    findMany: vi.fn(async () => []),
    createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
  };
  mockPrisma.alliance_memberships = {
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  };
  mockPrisma.chatRoom = {
    findUnique: vi.fn(async () => ({
      id: ROOM_ID,
      participants: [
        { userId: ATTACKER_ID },
        { userId: DEFENDER_ID },
        { userId: OUTSIDER_ID },
      ],
    })),
  };
});

const grantedUserIds = () =>
  mockPrisma.attack_log_acl.createMany.mock.calls.flatMap(([arg]: any[]) =>
    arg.data.map((entry: any) => entry.shared_with_user_id),
  );

describe('attack log ACL grant (ATK-01)', () => {
  it('rejects a grant by a user who cannot read the log', async () => {
    const res = makeRes();

    await aclRoute(
      {
        method: 'POST',
        query: { id: String(LOG_ID) },
        body: { roomId: ROOM_ID, participantIds: [ATTACKER_ID] },
        session: { user: { id: OUTSIDER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.attack_log_acl.createMany).not.toHaveBeenCalled();
  });

  it('rejects resharing by a recipient even when they belong to the room', async () => {
    mockPrisma.attack_log.findUnique.mockResolvedValue({
      id: LOG_ID,
      attacker_id: ATTACKER_ID,
      defender_id: DEFENDER_ID,
      acl: [
        { shared_with_user_id: OUTSIDER_ID, shared_with_alliance_id: null },
      ],
    });
    const res = makeRes();

    await aclRoute(
      {
        method: 'POST',
        query: { id: String(LOG_ID) },
        body: { roomId: ROOM_ID },
        session: { user: { id: OUTSIDER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.attack_log_acl.createMany).not.toHaveBeenCalled();
  });

  it('rejects a reader sharing to a room they are not in', async () => {
    mockPrisma.chatRoom.findUnique.mockResolvedValue({
      id: ROOM_ID,
      participants: [{ userId: DEFENDER_ID }],
    });
    const res = makeRes();

    await aclRoute(
      {
        method: 'POST',
        query: { id: String(LOG_ID) },
        body: { roomId: ROOM_ID },
        session: { user: { id: ATTACKER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.attack_log_acl.createMany).not.toHaveBeenCalled();
  });

  it('ignores a body userId and acts as the session user', async () => {
    // Body claims the attacker; the session user is an outsider who is in the room.
    const res = makeRes();

    await aclRoute(
      {
        method: 'POST',
        query: { id: String(LOG_ID) },
        body: { userId: ATTACKER_ID, roomId: ROOM_ID },
        session: { user: { id: OUTSIDER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.attack_log_acl.createMany).not.toHaveBeenCalled();
  });

  it('lets the attacker share with room members, ignoring participantIds for authorisation', async () => {
    const res = makeRes();

    await aclRoute(
      {
        method: 'POST',
        query: { id: String(LOG_ID) },
        body: { userId: OUTSIDER_ID, roomId: ROOM_ID, participantIds: [99] },
        session: { user: { id: ATTACKER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(grantedUserIds().sort()).toEqual([DEFENDER_ID, OUTSIDER_ID].sort());
  });
});

describe('attack log retest (RET-01)', () => {
  it('rejects a user who cannot read the log, even a site admin', async () => {
    setAdmins([OUTSIDER_ID]);
    const res = makeRes();

    await retestRoute(
      {
        method: 'GET',
        query: { id: String(LOG_ID) },
        session: { user: { id: OUTSIDER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.attack_log.findUnique).toHaveBeenCalledTimes(1);
  });

  it('lets a share recipient retest', async () => {
    mockPrisma.attack_log.findUnique.mockResolvedValue({
      id: LOG_ID,
      attacker_id: ATTACKER_ID,
      defender_id: DEFENDER_ID,
      acl: [
        { shared_with_user_id: OUTSIDER_ID, shared_with_alliance_id: null },
      ],
      stats: {},
      pillaged_gold: 5n,
    });
    const res = makeRes();

    await retestRoute(
      {
        method: 'GET',
        query: { id: String(LOG_ID) },
        session: { user: { id: OUTSIDER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets the defender retest their own log', async () => {
    const res = makeRes();

    await retestRoute(
      {
        method: 'GET',
        query: { id: String(LOG_ID) },
        session: { user: { id: DEFENDER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('attack battleTest (ATK-02)', () => {
  it('rejects a non-admin before any defender value is simulated', async () => {
    const simulate = spyOn(
      (require('@/services/Battle.service') as any).BattleService,
      'simulateBattle',
    ).mockResolvedValue({});
    const res = makeRes();

    await battleTestRoute(
      {
        method: 'GET',
        query: { dId: String(DEFENDER_ID) },
        session: { user: { id: OUTSIDER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(simulate).not.toHaveBeenCalled();
    simulate.mockRestore();
  });

  it('runs the simulation for an admin', async () => {
    setAdmins([OUTSIDER_ID]);
    const simulate = spyOn(
      (require('@/services/Battle.service') as any).BattleService,
      'simulateBattle',
    ).mockResolvedValue({ ok: true });
    const res = makeRes();

    await battleTestRoute(
      {
        method: 'GET',
        query: { dId: String(DEFENDER_ID) },
        session: { user: { id: OUTSIDER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(simulate).toHaveBeenCalledWith(
      expect.objectContaining({ defenderId: DEFENDER_ID }),
    );
    simulate.mockRestore();
  });
});
