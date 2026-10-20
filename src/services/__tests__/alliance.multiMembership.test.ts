import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the services load.
const { AllianceService } = await import('../Alliance.service');
const { MAX_ALLIANCE_MEMBERSHIPS } = await import('@/constants/alliances');

// Synthetic data (#66): a player may belong to up to three alliances and
// lead at most one. Alliances 1-4 are open; user 20 starts with no memberships.
const PLAYER = 20;
const OTHER = 21;

type Membership = { id: number; alliance_id: number; user_id: number };

let memberships: Membership[];
let alliances: Record<number, Record<string, any>>;
let nextId: number;

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error.message,
  );

const matches = (row: Record<string, any>, where: Record<string, any>) =>
  Object.entries(where ?? {}).every(([key, value]) => {
    if (value && typeof value === 'object' && 'not' in value) {
      return row[key] !== value.not;
    }
    return row[key] === value;
  });

beforeEach(() => {
  nextId = 1000;
  memberships = [];
  alliances = {};
  for (const id of [1, 2, 3, 4]) {
    alliances[id] = {
      id,
      name: `Pact ${id}`,
      leader_id: 100 + id,
      join_mode: 'OPEN',
      is_public: true,
      alliance_roles: [{ id: 500 + id, name: 'Member' }],
      _count: { members: 1 },
    };
  }
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (operation: any) =>
    operation(mockPrisma),
  );
  mockPrisma.alliances = {
    findFirst: vi.fn(
      async ({ where }: any) =>
        Object.values(alliances).find((a) => matches(a, where)) ?? null,
    ),
    findUnique: vi.fn(async ({ where }: any) => alliances[where.id] ?? null),
    create: vi.fn(async ({ data }: any) => {
      const created = { id: ++nextId, ...data };
      alliances[created.id] = created;
      return created;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const target = Object.values(alliances).find((a) => matches(a, where));
      if (!target) return { count: 0 };
      Object.assign(target, data);
      return { count: 1 };
    }),
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
    findFirst: vi.fn(
      async ({ where }: any) =>
        memberships.find((m) => matches(m, where)) ?? null,
    ),
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
    create: vi.fn(async ({ data }: any) => ({ id: ++nextId, ...data })),
  };
  mockPrisma.users = {
    findUnique: vi.fn(async () => ({
      experience: 1e12,
      gold: 10n ** 12n,
      display_name: 'Synthetic',
    })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
});

const joinAs = (userId: number, allianceId: number) =>
  AllianceService.joinAlliance(userId, { allianceId });

describe('joining several alliances', () => {
  it('allows a second and a third alliance', async () => {
    expect(await reason(joinAs(PLAYER, 1))).toBeNull();
    expect(await reason(joinAs(PLAYER, 2))).toBeNull();
    expect(await reason(joinAs(PLAYER, 3))).toBeNull();
    expect(
      memberships.filter((m) => m.user_id === PLAYER).map((m) => m.alliance_id),
    ).toEqual([1, 2, 3]);
  });

  it('refuses a fourth alliance with the limit message', async () => {
    await joinAs(PLAYER, 1);
    await joinAs(PLAYER, 2);
    await joinAs(PLAYER, 3);
    expect(await reason(joinAs(PLAYER, 4))).toBe(
      `You can only be a member of ${MAX_ALLIANCE_MEMBERSHIPS} alliances`,
    );
    expect(memberships).toHaveLength(3);
  });

  it('refuses joining the same alliance twice', async () => {
    await joinAs(PLAYER, 1);
    expect(await reason(joinAs(PLAYER, 1))).toBe(
      'You are already a member of this alliance',
    );
    expect(memberships).toHaveLength(1);
  });

  it('applies the same limits to join requests', async () => {
    mockPrisma.alliance_join_requests = {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    };
    await joinAs(PLAYER, 1);
    expect(await reason(AllianceService.createJoinRequest(PLAYER, 1))).toBe(
      'You are already a member of this alliance',
    );
    expect(
      await reason(AllianceService.createJoinRequest(PLAYER, 2)),
    ).toBeNull();
    await joinAs(PLAYER, 2);
    await joinAs(PLAYER, 3);
    expect(await reason(AllianceService.createJoinRequest(PLAYER, 4))).toBe(
      `You can only be a member of ${MAX_ALLIANCE_MEMBERSHIPS} alliances`,
    );
  });
});

describe('creating an alliance', () => {
  const create = (name: string) =>
    AllianceService.createAlliance(PLAYER, { name } as any);

  it('is allowed while belonging to other alliances', async () => {
    await joinAs(PLAYER, 1);
    expect(await reason(create('Fresh Pact'))).toBeNull();
    expect(memberships.filter((m) => m.user_id === PLAYER)).toHaveLength(2);
  });

  it('is refused while already leading an alliance', async () => {
    expect(await reason(create('First Pact'))).toBeNull();
    expect(await reason(create('Second Pact'))).toBe(
      'You already lead an alliance',
    );
  });

  it('is refused at the membership limit', async () => {
    await joinAs(PLAYER, 1);
    await joinAs(PLAYER, 2);
    await joinAs(PLAYER, 3);
    expect(await reason(create('Fourth Pact'))).toBe(
      `You can only be a member of ${MAX_ALLIANCE_MEMBERSHIPS} alliances`,
    );
  });
});

describe('transferring leadership', () => {
  it('refuses a new leader who already leads another alliance', async () => {
    alliances[1].leader_id = PLAYER;
    alliances[2].leader_id = OTHER;
    memberships.push({ id: 1, alliance_id: 1, user_id: OTHER });
    expect(
      await reason(
        AllianceService.transferLeadership(1, PLAYER, {
          allianceId: 1,
          newLeaderId: OTHER,
        }),
      ),
    ).toBe('New leader already leads another alliance');
    expect(alliances[1].leader_id).toBe(PLAYER);
  });

  it('allows a member who leads nothing', async () => {
    alliances[1].leader_id = PLAYER;
    memberships.push({ id: 1, alliance_id: 1, user_id: OTHER });
    expect(
      await reason(
        AllianceService.transferLeadership(1, PLAYER, {
          allianceId: 1,
          newLeaderId: OTHER,
        }),
      ),
    ).toBeNull();
    expect(alliances[1].leader_id).toBe(OTHER);
  });
});
