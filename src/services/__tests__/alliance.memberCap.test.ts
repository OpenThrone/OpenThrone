import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the services load.
const { AllianceService } = await import('../Alliance.service');
const { getAllianceLevel } = await import('@/constants/allianceLevels');

// Synthetic alliance 1 (Alliance Hall member cap): leader 100 at Camp
// (cap 10). Players 200+ are outsiders with no memberships.
const ALLIANCE_ID = 1;
const LEADER = 100;
const OUTSIDER = 200;
const CAMP_CAP = getAllianceLevel(0).maxMembers;

type Membership = { id: number; alliance_id: number; user_id: number };

let alliance: Record<string, any>;
let memberships: Membership[];
let requests: Record<string, any>[];
let nextId: number;

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error.message,
  );

const matches = (row: Record<string, any>, where: Record<string, any>) =>
  Object.entries(where ?? {}).every(([key, value]) => row[key] === value);

/** Fills the alliance with the leader plus synthetic members up to `count`. */
const fillTo = (count: number) => {
  memberships = [{ id: 1, alliance_id: ALLIANCE_ID, user_id: LEADER }];
  for (let i = 1; i < count; i++) {
    memberships.push({
      id: 1 + i,
      alliance_id: ALLIANCE_ID,
      user_id: 1000 + i,
    });
  }
};

const allianceRow = () => ({
  ...alliance,
  _count: {
    members: memberships.filter((m) => m.alliance_id === ALLIANCE_ID).length,
  },
});

beforeEach(() => {
  nextId = 5000;
  alliance = {
    id: ALLIANCE_ID,
    name: 'Pact',
    leader_id: LEADER,
    status: 'ACTIVE',
    hall_level: 0,
    join_mode: 'OPEN',
    is_public: true,
    alliance_roles: [{ id: 50, name: 'Member' }],
  };
  fillTo(1);
  requests = [];

  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (operation: any) =>
    operation(mockPrisma),
  );
  mockPrisma.alliances = {
    findUnique: vi.fn(async ({ where }: any) =>
      where.id === ALLIANCE_ID ? allianceRow() : null,
    ),
  };
  mockPrisma.alliance_memberships = {
    findUnique: vi.fn(
      async ({ where }: any) =>
        memberships.find(
          (m) =>
            m.alliance_id === where.unique_alliance_user.alliance_id &&
            m.user_id === where.unique_alliance_user.user_id,
        ) ?? null,
    ),
    findFirst: vi.fn(async ({ where }: any) => {
      const found = memberships.find((m) => matches(m, where));
      // The leader holds every permission; include role and alliance rows.
      return found
        ? { ...found, role: { permissions: {} }, alliance: allianceRow() }
        : null;
    }),
    count: vi.fn(
      async ({ where }: any) =>
        memberships.filter((m) => matches(m, where)).length,
    ),
    create: vi.fn(async ({ data }: any) => {
      const created = { id: ++nextId, ...data };
      memberships.push(created);
      return created;
    }),
  };
  mockPrisma.alliance_roles = {
    findFirst: vi.fn(async () => ({ id: 50, name: 'Member' })),
  };
  mockPrisma.alliance_join_requests = {
    findUnique: vi.fn(
      async ({ where }: any) => requests.find((r) => r.id === where.id) ?? null,
    ),
    findFirst: vi.fn(
      async ({ where }: any) => requests.find((r) => matches(r, where)) ?? null,
    ),
    create: vi.fn(async ({ data }: any) => {
      const created = { id: ++nextId, kind: 'REQUEST', ...data };
      requests.push(created);
      return created;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const target = requests.find((r) => matches(r, where));
      if (!target) return { count: 0 };
      Object.assign(target, data);
      return { count: 1 };
    }),
  };
  mockPrisma.users = {
    findFirst: vi.fn(async () => ({ id: OUTSIDER, display_name: 'Wanderer' })),
  };
});

const pendingRequest = (kind: 'REQUEST' | 'INVITE') => {
  const row = {
    id: ++nextId,
    alliance_id: ALLIANCE_ID,
    user_id: OUTSIDER,
    status: 'PENDING',
    kind,
  };
  requests.push(row);
  return row.id;
};

const FULL = /alliance is full .*Upgrade the Alliance Hall/;

describe('Alliance Hall member cap', () => {
  it('joins an open alliance below the cap', async () => {
    fillTo(CAMP_CAP - 1);
    expect(
      await reason(
        AllianceService.joinAlliance(OUTSIDER, { allianceId: ALLIANCE_ID }),
      ),
    ).toBeNull();
    expect(memberships).toHaveLength(CAMP_CAP);
  });

  it('refuses joining an open alliance at the cap', async () => {
    fillTo(CAMP_CAP);
    expect(
      await reason(
        AllianceService.joinAlliance(OUTSIDER, { allianceId: ALLIANCE_ID }),
      ),
    ).toMatch(FULL);
    expect(memberships).toHaveLength(CAMP_CAP);
  });

  it('a higher hall level raises the cap', async () => {
    fillTo(CAMP_CAP);
    alliance.hall_level = 1;
    expect(
      await reason(
        AllianceService.joinAlliance(OUTSIDER, { allianceId: ALLIANCE_ID }),
      ),
    ).toBeNull();
  });

  it('refuses accepting a join request at the cap', async () => {
    fillTo(CAMP_CAP);
    const id = pendingRequest('REQUEST');
    expect(await reason(AllianceService.acceptJoinRequest(id, LEADER))).toMatch(
      FULL,
    );
    expect(requests[0].status).toBe('PENDING');
    expect(memberships).toHaveLength(CAMP_CAP);
  });

  it('accepts a join request below the cap', async () => {
    fillTo(CAMP_CAP - 1);
    const id = pendingRequest('REQUEST');
    expect(
      await reason(AllianceService.acceptJoinRequest(id, LEADER)),
    ).toBeNull();
    expect(requests[0].status).toBe('APPROVED');
  });

  it('refuses accepting an invitation at the cap', async () => {
    fillTo(CAMP_CAP);
    const id = pendingRequest('INVITE');
    expect(
      await reason(AllianceService.respondToInvite(id, OUTSIDER, true)),
    ).toMatch(FULL);
    expect(memberships).toHaveLength(CAMP_CAP);
  });

  it('accepts an invitation below the cap', async () => {
    fillTo(CAMP_CAP - 1);
    const id = pendingRequest('INVITE');
    expect(
      await reason(AllianceService.respondToInvite(id, OUTSIDER, true)),
    ).toBeNull();
    expect(memberships).toHaveLength(CAMP_CAP);
  });

  it('refuses sending an invitation or a join request when full', async () => {
    fillTo(CAMP_CAP);
    expect(
      await reason(
        AllianceService.invitePlayer(LEADER, ALLIANCE_ID, 'Wanderer'),
      ),
    ).toMatch(FULL);
    expect(
      await reason(AllianceService.createJoinRequest(OUTSIDER, ALLIANCE_ID)),
    ).toMatch(FULL);
    expect(requests).toHaveLength(0);
  });

  it('keeps members above the cap but adds no more', async () => {
    // An admin lowered the level from Hall (20) to Camp (10).
    fillTo(15);
    expect(
      await reason(
        AllianceService.joinAlliance(OUTSIDER, { allianceId: ALLIANCE_ID }),
      ),
    ).toMatch(/15\/10 members/);
    expect(memberships).toHaveLength(15);
  });
});
