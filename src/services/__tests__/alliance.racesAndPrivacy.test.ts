import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the service loads.
const { AllianceService, redactAllianceForViewer } =
  await import('../Alliance.service');

// Synthetic accounts and alliance.
const LEADER_ID = 5;
const MEMBER_ID = 6;
const OUTSIDER_ID = 7;
const ALLIANCE_ID = 3;
const CREATION_COST = 100000000n;
const LEVEL_10_XP = 1_000_000_000;

const outsideTx = (name: string) =>
  vi.fn(async () => {
    throw new Error(`${name} read outside the transaction`);
  });

/**
 * Transactions are serialized at their first row lock, like Postgres FOR
 * UPDATE on the same rows: a second transaction waits at its first $queryRaw
 * until the first commits or rolls back. Reads before the lock would race.
 */
/** Row locks taken, one array per transaction in start order. */
let locks: string[][];
let tail: Promise<void>;
const installSerializedTransactions = (tx: Record<string, unknown>) => {
  locks = [];
  tail = Promise.resolve();
  mockPrisma.$transaction = vi.fn(
    async (operation: (client: unknown) => Promise<unknown>) => {
      const previous = tail;
      let unlock!: () => void;
      tail = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      let waited = false;
      const txLocks: string[] = [];
      locks.push(txLocks);
      const client = {
        ...tx,
        $queryRaw: async (
          strings: TemplateStringsArray,
          ...values: number[]
        ) => {
          const sql = strings.join('?');
          expect(sql).toContain('FOR UPDATE');
          txLocks.push(`${/FROM (\w+)/.exec(sql)?.[1]}:${values[0]}`);
          if (!waited) {
            waited = true;
            await previous;
          }
          return [];
        },
      };
      try {
        return await operation(client);
      } finally {
        unlock();
      }
    },
  );
};

const settle = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error.message,
  );

describe('alliance roster and treasury privacy (ALL-08)', () => {
  const fullAlliance = (rosterVisibility: 'PUBLIC' | 'MEMBERS_ONLY') => ({
    id: ALLIANCE_ID,
    name: 'Synthetic Pact',
    leader_id: LEADER_ID,
    roster_visibility: rosterVisibility,
    gold_in_bank: 123456n,
    leader: { display_name: 'Leader' },
    _count: { members: 2 },
    alliance_roles: [{ id: 1, name: 'Member', permissions: { a: true } }],
    members: [
      {
        id: 1,
        user_id: LEADER_ID,
        user: { id: LEADER_ID, display_name: 'Leader' },
        role: { id: 1, name: 'Member', permissions: { edit_ranks: true } },
      },
      {
        id: 2,
        user_id: MEMBER_ID,
        user: { id: MEMBER_ID, display_name: 'Member' },
        role: { id: 1, name: 'Member', permissions: { edit_ranks: true } },
      },
    ],
  });

  beforeEach(() => {
    mockPrisma.alliances = {
      findUnique: vi.fn(async () => fullAlliance('MEMBERS_ONLY')),
      findMany: vi.fn(async () => [
        fullAlliance('PUBLIC'),
        { ...fullAlliance('MEMBERS_ONLY'), id: 4 },
      ]),
    };
    mockPrisma.alliance_memberships = {
      findMany: vi.fn(async ({ where }: any) =>
        where.user_id === MEMBER_ID ? [{ alliance_id: ALLIANCE_ID }] : [],
      ),
    };
  });

  it('gives a signed-out visitor no treasury and no hidden roster', async () => {
    const { alliance, isMember } = await AllianceService.getAllianceForViewer(
      ALLIANCE_ID,
      null,
    );

    expect(isMember).toBe(false);
    expect(alliance.gold_in_bank).toBeUndefined();
    expect(alliance.members).toBeUndefined();
    expect(alliance.alliance_roles).toBeUndefined();
    expect(alliance._count.members).toBe(2);
    expect(alliance.name).toBe('Synthetic Pact');
  });

  it('hides a MEMBERS_ONLY roster and the treasury from a signed-in non-member', async () => {
    const { alliance, isMember } = await AllianceService.getAllianceForViewer(
      ALLIANCE_ID,
      OUTSIDER_ID,
    );

    expect(isMember).toBe(false);
    expect(alliance.gold_in_bank).toBeUndefined();
    expect(alliance.members).toBeUndefined();
  });

  it('shows the full roster and treasury to a member', async () => {
    const { alliance, isMember } = await AllianceService.getAllianceForViewer(
      ALLIANCE_ID,
      MEMBER_ID,
    );

    expect(isMember).toBe(true);
    expect(alliance.gold_in_bank).toBe('123456n');
    expect(alliance.members).toHaveLength(2);
    expect(alliance.alliance_roles).toHaveLength(1);
  });

  it('shows a PUBLIC roster to non-members, without treasury or role permissions', () => {
    const view = redactAllianceForViewer(fullAlliance('PUBLIC'), false);

    expect(view.gold_in_bank).toBeUndefined();
    expect(view.alliance_roles).toBeUndefined();
    expect(view.members).toHaveLength(2);
    expect(view.members[0].role).toEqual({ id: 1, name: 'Member' });
  });

  it('fails closed when roster_visibility is missing', () => {
    const { roster_visibility: _omit, ...alliance } = fullAlliance('PUBLIC');

    expect(redactAllianceForViewer(alliance, false).members).toBeUndefined();
  });

  it('lists treasury only for alliances the viewer belongs to', async () => {
    const asMember = await AllianceService.getAllAlliances(
      undefined,
      MEMBER_ID,
    );
    const asOutsider = await AllianceService.getAllAlliances(
      undefined,
      OUTSIDER_ID,
    );

    expect(asMember[0].gold_in_bank).toBe('123456n');
    expect(asMember[1].gold_in_bank).toBeUndefined();
    expect(asMember[1].members).toBeUndefined();
    expect(asOutsider.every((a: any) => a.gold_in_bank === undefined)).toBe(
      true,
    );
    expect(asOutsider[0].members).toHaveLength(2);
  });
});

describe('createAlliance re-checks inside a locked transaction (ALL-02)', () => {
  let state: { gold: bigint; led: number[]; memberships: number };
  let tx: any;

  beforeEach(() => {
    state = { gold: CREATION_COST + 1n, led: [], memberships: 0 };
    mockPrisma.alliances = {
      findFirst: outsideTx('alliances.findFirst'),
      create: outsideTx('alliances.create'),
    };
    mockPrisma.alliance_memberships = { count: outsideTx('memberships.count') };
    mockPrisma.users = {
      findUnique: outsideTx('users.findUnique'),
      update: outsideTx('users.update'),
      updateMany: outsideTx('users.updateMany'),
    };
    tx = {
      alliances: {
        findFirst: vi.fn(async ({ where }: any) =>
          where.leader_id !== undefined && state.led.length > 0
            ? { id: state.led[0] }
            : null,
        ),
        create: vi.fn(async ({ data }: any) => {
          state.led.push(10 + state.led.length);
          return { id: state.led.at(-1), ...data };
        }),
      },
      alliance_roles: { create: vi.fn(async () => ({ id: 1 })) },
      alliance_memberships: {
        count: vi.fn(async () => state.memberships),
        create: vi.fn(async () => {
          state.memberships += 1;
          return {};
        }),
      },
      users: {
        findUnique: vi.fn(async () => ({
          experience: LEVEL_10_XP,
          gold: state.gold,
          display_name: 'Founder',
        })),
        updateMany: vi.fn(async ({ where, data }: any) => {
          if (state.gold < where.gold.gte) return { count: 0 };
          state.gold -= data.gold.decrement;
          return { count: 1 };
        }),
      },
    };
    installSerializedTransactions(tx);
  });

  it('lets only one of two parallel creates by the same user succeed', async () => {
    const outcomes = await Promise.all([
      settle(AllianceService.createAlliance(LEADER_ID, { name: 'First' })),
      settle(AllianceService.createAlliance(LEADER_ID, { name: 'Second' })),
    ]);

    expect(outcomes).toEqual([null, 'You already lead an alliance']);
    expect(state.led).toHaveLength(1);
    expect(state.gold).toBe(1n);
    expect(locks).toEqual([[`users:${LEADER_ID}`], [`users:${LEADER_ID}`]]);
  });

  it('deducts the fee as a guarded relative decrement before creating', async () => {
    await AllianceService.createAlliance(LEADER_ID, { name: 'Guarded' });

    expect(tx.users.updateMany).toHaveBeenCalledWith({
      where: { id: LEADER_ID, gold: { gte: CREATION_COST } },
      data: { gold: { decrement: CREATION_COST } },
    });
  });

  it('creates nothing when the guarded debit matches no row', async () => {
    tx.users.updateMany.mockResolvedValueOnce({ count: 0 });

    const outcome = await settle(
      AllianceService.createAlliance(LEADER_ID, { name: 'Broke' }),
    );

    expect(outcome).toBe('Insufficient gold to create alliance');
    expect(tx.alliances.create).not.toHaveBeenCalled();
  });
});

describe('joinAlliance re-checks inside a locked transaction (ALL-04)', () => {
  let memberships: number[];
  let tx: any;

  beforeEach(() => {
    memberships = [];
    mockPrisma.alliances = { findUnique: outsideTx('alliances.findUnique') };
    mockPrisma.alliance_memberships = {
      findFirst: outsideTx('memberships.findFirst'),
      count: outsideTx('memberships.count'),
      create: outsideTx('memberships.create'),
    };
    tx = {
      alliances: {
        findUnique: vi.fn(async () => ({
          id: ALLIANCE_ID,
          join_mode: 'OPEN',
          is_public: true,
          alliance_roles: [{ id: 1, name: 'Member' }],
        })),
      },
      alliance_memberships: {
        findFirst: vi.fn(async () =>
          memberships.length ? { alliance_id: memberships[0] } : null,
        ),
        // joinAlliance checks the same-alliance membership by composite key.
        findUnique: vi.fn(async ({ where }: any) =>
          memberships.includes(where.unique_alliance_user?.alliance_id)
            ? { alliance_id: where.unique_alliance_user.alliance_id }
            : null,
        ),
        count: vi.fn(async () => memberships.length),
        create: vi.fn(async ({ data }: any) => {
          memberships.push(data.alliance_id);
          return data;
        }),
      },
    };
    installSerializedTransactions(tx);
  });

  it('locks the alliance then the user and admits a double join only once', async () => {
    const outcomes = await Promise.all([
      settle(AllianceService.joinAlliance(OUTSIDER_ID, { allianceId: 3 })),
      settle(AllianceService.joinAlliance(OUTSIDER_ID, { allianceId: 3 })),
    ]);

    expect(outcomes).toEqual([
      null,
      'You are already a member of this alliance',
    ]);
    expect(memberships).toEqual([ALLIANCE_ID]);
    expect(locks[0]).toEqual([
      `alliances:${ALLIANCE_ID}`,
      `users:${OUTSIDER_ID}`,
    ]);
  });
});

describe('acceptJoinRequest re-checks inside a locked transaction (ALL-04)', () => {
  let request: { status: string; kind?: string };
  let tx: any;

  beforeEach(() => {
    request = { status: 'PENDING', kind: 'REQUEST' };
    mockPrisma.alliance_join_requests = {
      // The only unlocked read: which rows to lock.
      findUnique: vi.fn(async () => ({
        alliance_id: ALLIANCE_ID,
        user_id: OUTSIDER_ID,
      })),
      update: outsideTx('join_requests.update'),
    };
    mockPrisma.alliance_memberships = {
      findFirst: outsideTx('memberships.findFirst'),
      count: outsideTx('memberships.count'),
    };
    tx = {
      alliance_join_requests: {
        findUnique: vi.fn(async () => ({
          id: 1,
          alliance_id: ALLIANCE_ID,
          user_id: OUTSIDER_ID,
          ...request,
        })),
        updateMany: vi.fn(async ({ where, data }: any) => {
          if (request.status !== where.status) return { count: 0 };
          request.status = data.status;
          return { count: 1 };
        }),
      },
      alliance_memberships: {
        findFirst: vi.fn(async () => ({
          role: { permissions: {} },
          alliance: { leader_id: LEADER_ID },
        })),
        findUnique: vi.fn(async () => null),
        count: vi.fn(async () => 0),
        create: vi.fn(async () => ({})),
      },
      alliance_roles: { findFirst: vi.fn(async () => ({ id: 1 })) },
    };
    installSerializedTransactions(tx);
  });

  it('approves a parallel double accept only once', async () => {
    const outcomes = await Promise.all([
      settle(AllianceService.acceptJoinRequest(1, LEADER_ID)),
      settle(AllianceService.acceptJoinRequest(1, LEADER_ID)),
    ]);

    expect(outcomes).toEqual([null, 'Request not found or already processed']);
    expect(tx.alliance_memberships.create).toHaveBeenCalledTimes(1);
    expect(locks[0]).toEqual([
      `alliances:${ALLIANCE_ID}`,
      `users:${OUTSIDER_ID}`,
      'alliance_join_requests:1',
    ]);
  });

  it('re-checks the applicant membership limit inside the transaction', async () => {
    tx.alliance_memberships.count.mockResolvedValueOnce(3);

    const outcome = await settle(
      AllianceService.acceptJoinRequest(1, LEADER_ID),
    );

    expect(outcome).toBe('User is already in 3 alliances');
    expect(tx.alliance_memberships.create).not.toHaveBeenCalled();
    expect(request.status).toBe('PENDING');
  });
});

describe('transferLeadership re-checks inside a locked transaction (ALL-04)', () => {
  let leaderId: number;
  let tx: any;

  beforeEach(() => {
    leaderId = LEADER_ID;
    mockPrisma.alliances = {
      findFirst: outsideTx('alliances.findFirst'),
      update: outsideTx('alliances.update'),
    };
    mockPrisma.alliance_memberships = {
      findFirst: outsideTx('memberships.findFirst'),
    };
    tx = {
      alliances: {
        findFirst: vi.fn(async ({ where }: any) => {
          if (where.id === ALLIANCE_ID && where.leader_id !== undefined) {
            return where.leader_id === leaderId ? { id: ALLIANCE_ID } : null;
          }
          return null; // new leader leads no other alliance
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          if (where.leader_id !== leaderId) return { count: 0 };
          leaderId = data.leader_id;
          return { count: 1 };
        }),
        findUnique: vi.fn(async () => ({
          id: ALLIANCE_ID,
          leader_id: leaderId,
        })),
      },
      alliance_memberships: { findFirst: vi.fn(async () => ({ id: 2 })) },
    };
    installSerializedTransactions(tx);
  });

  it('lets only one of two parallel transfers by the same leader succeed', async () => {
    const outcomes = await Promise.all([
      settle(
        AllianceService.transferLeadership(ALLIANCE_ID, LEADER_ID, {
          allianceId: ALLIANCE_ID,
          newLeaderId: MEMBER_ID,
        }),
      ),
      settle(
        AllianceService.transferLeadership(ALLIANCE_ID, LEADER_ID, {
          allianceId: ALLIANCE_ID,
          newLeaderId: OUTSIDER_ID,
        }),
      ),
    ]);

    expect(outcomes).toEqual([
      null,
      'Alliance not found or you are not the leader',
    ]);
    expect(leaderId).toBe(MEMBER_ID);
    expect(locks[0]).toEqual([
      `alliances:${ALLIANCE_ID}`,
      `users:${LEADER_ID}`,
      `users:${MEMBER_ID}`,
    ]);
  });

  it('refuses a new leader who already leads another alliance', async () => {
    tx.alliances.findFirst.mockImplementation(async ({ where }: any) =>
      where.leader_id === LEADER_ID ? { id: ALLIANCE_ID } : { id: 99 },
    );

    const outcome = await settle(
      AllianceService.transferLeadership(ALLIANCE_ID, LEADER_ID, {
        allianceId: ALLIANCE_ID,
        newLeaderId: MEMBER_ID,
      }),
    );

    expect(outcome).toBe('New leader already leads another alliance');
    expect(tx.alliances.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a new leader who left before the lock was acquired', async () => {
    tx.alliance_memberships.findFirst.mockResolvedValueOnce(null);

    const outcome = await settle(
      AllianceService.transferLeadership(ALLIANCE_ID, LEADER_ID, {
        allianceId: ALLIANCE_ID,
        newLeaderId: MEMBER_ID,
      }),
    );

    expect(outcome).toBe('New leader must be a member of the alliance');
    expect(leaderId).toBe(LEADER_ID);
  });
});
