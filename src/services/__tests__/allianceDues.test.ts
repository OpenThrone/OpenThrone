import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the services load.
const { AllianceService, redactMemberDuesForViewer } =
  await import('../Alliance.service');
const { AllianceDuesService } = await import('../AllianceDues.service');
const { getDuesPeriodStart } = await import('@/constants/allianceDues');

// Synthetic alliance 4 (join fee and dues): leader 10; treasurer 11 holds
// set_dues; member 12 holds nothing; outsider 50 has no memberships.
const ALLIANCE_ID = 4;
const LEADER = 10;
const TREASURER = 11;
const MEMBER = 12;
const OUTSIDER = 50;
const DAY = 24 * 60 * 60 * 1000;

type Row = Record<string, any>;

let alliance: Row;
let memberships: Row[];
let gold: Record<number, bigint>;
let history: Row[];
let requests: Row[];
let nextId: number;

const ROLES: Record<number, Row> = {
  1: { id: 1, name: 'Member', permissions: {} },
  2: { id: 2, name: 'Treasurer', permissions: { set_dues: true } },
};

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error.message,
  );

/** Minimal Prisma `where` matcher for the fields these services use. */
const matches = (row: Row, where: Row = {}): boolean =>
  Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    const value = row[key];
    if (cond === null) return value === null || value === undefined;
    if (cond instanceof Date) return value?.getTime?.() === cond.getTime();
    if (typeof cond === 'object') {
      if ('not' in cond) return value !== cond.not;
      if ('lt' in cond) return value != null && value < cond.lt;
      if ('gte' in cond) return value != null && value >= cond.gte;
      if ('gt' in cond) return value != null && value > cond.gt;
      return true;
    }
    return value === cond;
  });

const member = (userId: number, roleId: number, extra: Row = {}) => ({
  id: ++nextId,
  alliance_id: ALLIANCE_ID,
  user_id: userId,
  role_id: roleId,
  dues_arrears: 0n,
  dues_paid_through: null,
  ...extra,
});

const withRole = (row: Row | undefined) =>
  row ? { ...row, role: ROLES[row.role_id] } : null;

beforeEach(() => {
  nextId = 100;
  alliance = {
    id: ALLIANCE_ID,
    name: 'Tollkeepers',
    leader_id: LEADER,
    status: 'ACTIVE',
    hall_level: 0,
    join_mode: 'OPEN',
    is_public: true,
    gold_in_bank: 4_990_000n,
    join_fee: 0n,
    dues_amount: 0n,
    dues_period: 'NONE',
    alliance_roles: [{ id: 1, name: 'Member' }],
  };
  memberships = [member(LEADER, 2), member(TREASURER, 2), member(MEMBER, 1)];
  gold = {
    [LEADER]: 1_000_000n,
    [TREASURER]: 1_000_000n,
    [MEMBER]: 1_000_000n,
    [OUTSIDER]: 1_000_000n,
  };
  history = [];
  requests = [];

  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (operation: any) => {
    // Emulate rollback: restore state when the operation throws.
    const snapshot = {
      alliance: { ...alliance },
      memberships: memberships.map((m) => ({ ...m })),
      gold: { ...gold },
      history: [...history],
      requests: requests.map((r) => ({ ...r })),
    };
    try {
      return await operation(mockPrisma);
    } catch (error) {
      alliance = snapshot.alliance;
      memberships = snapshot.memberships;
      gold = snapshot.gold;
      history = snapshot.history;
      requests = snapshot.requests;
      throw error;
    }
  });
  mockPrisma.alliances = {
    findUnique: vi.fn(async ({ where }: any) =>
      where.id === ALLIANCE_ID
        ? {
            ...alliance,
            _count: {
              members: memberships.filter((m) => m.alliance_id === ALLIANCE_ID)
                .length,
            },
          }
        : null,
    ),
    findMany: vi.fn(async ({ where }: any) =>
      matches(alliance, where) ? [{ id: ALLIANCE_ID }] : [],
    ),
    update: vi.fn(async ({ data }: any) => {
      if (data.gold_in_bank?.increment !== undefined)
        alliance.gold_in_bank += data.gold_in_bank.increment;
      for (const key of ['join_fee', 'dues_amount', 'dues_period'])
        if (data[key] !== undefined) alliance[key] = data[key];
      return alliance;
    }),
  };
  mockPrisma.alliance_memberships = {
    findUnique: vi.fn(async ({ where }: any) =>
      withRole(
        memberships.find(
          (m) =>
            m.alliance_id === where.unique_alliance_user.alliance_id &&
            m.user_id === where.unique_alliance_user.user_id,
        ),
      ),
    ),
    findFirst: vi.fn(async ({ where }: any) => {
      const found = memberships.find((m) => matches(m, where));
      return found ? { ...withRole(found), alliance: { ...alliance } } : null;
    }),
    findMany: vi.fn(async ({ where }: any) =>
      memberships
        .filter((m) => matches(m, where))
        .sort((a, b) => a.user_id - b.user_id)
        .map((m) => ({ ...m })),
    ),
    count: vi.fn(
      async ({ where }: any) =>
        memberships.filter((m) => matches(m, where)).length,
    ),
    create: vi.fn(async ({ data }: any) => {
      const created = member(data.user_id, data.role_id, data);
      memberships.push(created);
      return created;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const rows = memberships.filter((m) => matches(m, where));
      for (const row of rows) {
        if (data.dues_arrears?.decrement !== undefined)
          row.dues_arrears -= data.dues_arrears.decrement;
        else if (data.dues_arrears !== undefined)
          row.dues_arrears = data.dues_arrears;
        if ('dues_paid_through' in data)
          row.dues_paid_through = data.dues_paid_through;
      }
      return { count: rows.length };
    }),
  };
  mockPrisma.alliance_roles = {
    findFirst: vi.fn(async () => ({ id: 1, name: 'Member' })),
  };
  mockPrisma.alliance_join_requests = {
    findUnique: vi.fn(
      async ({ where }: any) => requests.find((r) => r.id === where.id) ?? null,
    ),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const target = requests.find((r) => matches(r, where));
      if (!target) return { count: 0 };
      Object.assign(target, data);
      return { count: 1 };
    }),
  };
  mockPrisma.users = {
    findUnique: vi.fn(async ({ where }: any) => ({ gold: gold[where.id] })),
    updateMany: vi.fn(async ({ where, data }: any) => {
      if ((gold[where.id] ?? 0n) < (where.gold?.gte ?? 0n)) return { count: 0 };
      gold[where.id] -= data.gold.decrement;
      return { count: 1 };
    }),
  };
  mockPrisma.alliance_bank_history = {
    create: vi.fn(async ({ data }: any) => {
      history.push(data);
      return data;
    }),
  };
});

const pending = (kind: 'REQUEST' | 'INVITE') => {
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

const outsiderMembership = () =>
  memberships.find((m) => m.user_id === OUTSIDER);

const JOIN_PATHS = {
  'open join': () =>
    AllianceService.joinAlliance(OUTSIDER, { allianceId: ALLIANCE_ID }),
  'accepted join request': () =>
    AllianceService.acceptJoinRequest(pending('REQUEST'), LEADER),
  'accepted invitation': () =>
    AllianceService.respondToInvite(pending('INVITE'), OUTSIDER, true),
};

describe('join fee', () => {
  const paths = Object.keys(JOIN_PATHS) as (keyof typeof JOIN_PATHS)[];

  it.each(paths)(
    'charges the fee from gold on hand into the treasury: %s',
    async (path) => {
      const join = JOIN_PATHS[path];
      alliance.join_fee = 250_000n;
      expect(await reason(join())).toBeNull();
      expect(gold[OUTSIDER]).toBe(750_000n);
      // Above the Camp treasury cap (5,000,000): fees are not held to it.
      expect(alliance.gold_in_bank).toBe(5_240_000n);
      expect(outsiderMembership()).toBeDefined();
      expect(history).toEqual([
        expect.objectContaining({
          transaction_type: 'FEE',
          amount: 250_000n,
          related_user_id: OUTSIDER,
          performed_by_user_id: OUTSIDER,
        }),
      ]);
    },
  );

  it.each(paths)(
    'refuses without enough gold and writes nothing: %s',
    async (path) => {
      const join = JOIN_PATHS[path];
      alliance.join_fee = 2_000_000n;
      expect(await reason(join())).toMatch(/join fee is 2,000,000 gold/);
      expect(gold[OUTSIDER]).toBe(1_000_000n);
      expect(alliance.gold_in_bank).toBe(4_990_000n);
      expect(outsiderMembership()).toBeUndefined();
      expect(history).toHaveLength(0);
      for (const request of requests) expect(request.status).toBe('PENDING');
    },
  );

  it('charges nothing when the fee is 0', async () => {
    expect(await reason(JOIN_PATHS['open join']())).toBeNull();
    expect(gold[OUTSIDER]).toBe(1_000_000n);
    expect(history).toHaveLength(0);
  });

  it('refuses a join whose confirmed fee no longer matches', async () => {
    alliance.join_fee = 500_000n;
    expect(
      await reason(
        AllianceService.joinAlliance(OUTSIDER, {
          allianceId: ALLIANCE_ID,
          expectedFee: 100_000n,
        }),
      ),
    ).toMatch(/join fee is now 500,000 gold/);
    expect(outsiderMembership()).toBeUndefined();
    expect(gold[OUTSIDER]).toBe(1_000_000n);
    expect(
      await reason(
        AllianceService.joinAlliance(OUTSIDER, {
          allianceId: ALLIANCE_ID,
          expectedFee: 500_000n,
        }),
      ),
    ).toBeNull();
    expect(gold[OUTSIDER]).toBe(500_000n);
  });

  it('a pending request pays the fee current at acceptance', async () => {
    const id = pending('REQUEST');
    alliance.join_fee = 300_000n;
    expect(
      await reason(AllianceService.acceptJoinRequest(id, LEADER)),
    ).toBeNull();
    expect(gold[OUTSIDER]).toBe(700_000n);
  });

  it('marks a new member paid through the current period', async () => {
    alliance.dues_amount = 1_000n;
    alliance.dues_period = 'DAILY';
    await JOIN_PATHS['open join']();
    expect(outsiderMembership()?.dues_paid_through?.getTime()).toBe(
      getDuesPeriodStart('DAILY')?.getTime(),
    );
  });
});

describe('fee and dues settings', () => {
  const save = (actorId: number, values: Row) =>
    AllianceDuesService.updateSettings({
      allianceId: ALLIANCE_ID,
      actorId,
      joinFee: 0,
      duesAmount: 0,
      duesPeriod: 'NONE',
      ...values,
    });

  it('the leader and a set_dues rank may save; others may not', async () => {
    expect(await reason(save(LEADER, { joinFee: 1_000 }))).toBeNull();
    expect(await reason(save(TREASURER, { joinFee: 2_000 }))).toBeNull();
    expect(alliance.join_fee).toBe(2_000n);
    expect(await reason(save(MEMBER, { joinFee: 3_000 }))).toMatch(
      /permission to set the join fee/,
    );
    expect(await reason(save(OUTSIDER, { joinFee: 3_000 }))).toMatch(
      /not a member/,
    );
    expect(alliance.join_fee).toBe(2_000n);
  });

  it.each([
    [{ joinFee: 10_000_001 }, /join fee can be at most 10,000,000/],
    [{ duesAmount: 1_000_001, duesPeriod: 'DAILY' }, /at most 1,000,000/],
    [{ duesAmount: 5_000_001, duesPeriod: 'WEEKLY' }, /at most 5,000,000/],
    [{ duesAmount: 20_000_001, duesPeriod: 'MONTHLY' }, /at most 20,000,000/],
    [{ duesAmount: 500, duesPeriod: 'NONE' }, /how often/],
    [{ duesAmount: 0, duesPeriod: 'WEEKLY' }, /above 0/],
  ])('refuses %p', async (values, message) => {
    expect(await reason(save(LEADER, values))).toMatch(message);
    expect(alliance.dues_period).toBe('NONE');
    expect(alliance.join_fee).toBe(0n);
  });

  it('accepts each period at its maximum', async () => {
    for (const [duesPeriod, duesAmount] of [
      ['DAILY', 1_000_000],
      ['WEEKLY', 5_000_000],
      ['MONTHLY', 20_000_000],
    ] as const) {
      expect(await reason(save(LEADER, { duesAmount, duesPeriod }))).toBeNull();
    }
  });

  it('refuses while the alliance is reserved', async () => {
    alliance.status = 'RESERVED';
    expect(await reason(save(LEADER, { joinFee: 1 }))).toMatch(/reserved/);
  });

  it('a new period starts counting from now, never retroactively', async () => {
    await save(LEADER, { duesAmount: 1_000, duesPeriod: 'WEEKLY' });
    const weekStart = getDuesPeriodStart('WEEKLY')?.getTime();
    for (const m of memberships)
      expect(m.dues_paid_through?.getTime()).toBe(weekStart);
    // An immediate collection charges nobody.
    const run = await AllianceDuesService.collectForAlliance(ALLIANCE_ID);
    expect(run.charged).toBe(0);
    expect(gold[MEMBER]).toBe(1_000_000n);
  });
});

describe('dues collection', () => {
  const NOW = new Date('2026-11-12T15:00:00.000Z');
  const TODAY = getDuesPeriodStart('DAILY', NOW) as Date;
  const YESTERDAY = new Date(TODAY.getTime() - DAY);

  beforeEach(() => {
    alliance.dues_amount = 400_000n;
    alliance.dues_period = 'DAILY';
    for (const m of memberships) m.dues_paid_through = YESTERDAY;
  });

  const collect = () =>
    AllianceDuesService.collectForAlliance(ALLIANCE_ID, NOW);
  const row = (userId: number) =>
    memberships.find((m) => m.user_id === userId)!;

  it('takes full dues from gold on hand into the treasury; the leader is exempt', async () => {
    const run = await collect();
    expect(run).toMatchObject({ charged: 2, collected: 800_000n });
    expect(gold[LEADER]).toBe(1_000_000n);
    expect(gold[MEMBER]).toBe(600_000n);
    expect(gold[TREASURER]).toBe(600_000n);
    expect(alliance.gold_in_bank).toBe(5_790_000n);
    expect(row(MEMBER).dues_paid_through.getTime()).toBe(TODAY.getTime());
    expect(row(MEMBER).dues_arrears).toBe(0n);
    expect(history.map((h) => [h.transaction_type, h.related_user_id])).toEqual(
      [
        ['TAX', TREASURER],
        ['TAX', MEMBER],
      ],
    );
  });

  it('a member short of gold pays what they have and owes the rest', async () => {
    gold[MEMBER] = 150_000n;
    const run = await collect();
    expect(gold[MEMBER]).toBe(0n);
    expect(row(MEMBER).dues_arrears).toBe(250_000n);
    expect(run.arrearsAdded).toBe(250_000n);
    // Nobody is removed.
    expect(row(MEMBER)).toBeDefined();
  });

  it('collects arrears first, together with the new period', async () => {
    row(MEMBER).dues_arrears = 300_000n;
    gold[MEMBER] = 500_000n;
    await collect();
    // Owed 300,000 + 400,000; paid 500,000.
    expect(gold[MEMBER]).toBe(0n);
    expect(row(MEMBER).dues_arrears).toBe(200_000n);
  });

  it('is idempotent: a second run in the same period charges nobody', async () => {
    await collect();
    const second = await collect();
    expect(second.charged).toBe(0);
    expect(gold[MEMBER]).toBe(600_000n);
    expect(history).toHaveLength(2);
  });

  it('charges one period after missed runs, never a pile', async () => {
    for (const m of memberships)
      m.dues_paid_through = new Date(TODAY.getTime() - 5 * DAY);
    await collect();
    expect(gold[MEMBER]).toBe(600_000n);
  });

  it('a member without a paid-through date is only marked, not charged', async () => {
    row(MEMBER).dues_paid_through = null;
    await collect();
    expect(gold[MEMBER]).toBe(1_000_000n);
    expect(row(MEMBER).dues_paid_through.getTime()).toBe(TODAY.getTime());
  });

  it('a member who joined in this period is not charged until the next', async () => {
    row(MEMBER).dues_paid_through = TODAY;
    await collect();
    expect(gold[MEMBER]).toBe(1_000_000n);
  });

  it('a reserved alliance collects nothing', async () => {
    alliance.status = 'RESERVED';
    const run = await collect();
    expect(run.charged).toBe(0);
    expect(gold[MEMBER]).toBe(1_000_000n);
    expect(row(MEMBER).dues_paid_through.getTime()).toBe(YESTERDAY.getTime());
  });

  it('collectAll skips alliances without dues', async () => {
    alliance.dues_period = 'NONE';
    alliance.dues_amount = 0n;
    expect((await AllianceDuesService.collectAll(NOW)).alliances).toBe(0);
    expect(gold[MEMBER]).toBe(1_000_000n);
  });
});

describe('paying arrears', () => {
  const pay = (amount: number, userId = MEMBER) =>
    AllianceDuesService.payArrears({ allianceId: ALLIANCE_ID, userId, amount });

  beforeEach(() => {
    memberships.find((m) => m.user_id === MEMBER)!.dues_arrears = 300_000n;
  });

  it('pays from gold on hand into the treasury, capped at what is owed', async () => {
    const result = await pay(1_000_000);
    expect(result.paid).toBe(300_000n);
    expect(gold[MEMBER]).toBe(700_000n);
    expect(alliance.gold_in_bank).toBe(5_290_000n);
    expect(memberships.find((m) => m.user_id === MEMBER)!.dues_arrears).toBe(
      0n,
    );
    expect(history[0]).toMatchObject({
      transaction_type: 'TAX',
      related_user_id: MEMBER,
    });
  });

  it('pays part of the arrears', async () => {
    await pay(100_000);
    expect(memberships.find((m) => m.user_id === MEMBER)!.dues_arrears).toBe(
      200_000n,
    );
  });

  it('refuses without the gold and changes nothing', async () => {
    gold[MEMBER] = 50_000n;
    expect(await reason(pay(300_000))).toMatch(/need 300,000 gold on hand/);
    expect(gold[MEMBER]).toBe(50_000n);
    expect(memberships.find((m) => m.user_id === MEMBER)!.dues_arrears).toBe(
      300_000n,
    );
  });

  it('refuses when nothing is owed or for an outsider', async () => {
    expect(await reason(pay(1, TREASURER))).toMatch(/owe no dues/);
    expect(await reason(pay(1, OUTSIDER))).toMatch(/not a member/);
  });
});

describe('arrears visibility', () => {
  const view = {
    leader_id: LEADER,
    members: [
      { user_id: LEADER, role: ROLES[2], dues_arrears: '0n' },
      { user_id: TREASURER, role: ROLES[2], dues_arrears: '0n' },
      { user_id: MEMBER, role: ROLES[1], dues_arrears: '5n' },
      {
        user_id: 13,
        role: { permissions: { manage_bank: true } },
        dues_arrears: '7n',
      },
    ],
  };
  const arrearsSeen = (viewerId: number | null) =>
    redactMemberDuesForViewer(view, viewerId).members.map(
      (m: Row) => m.dues_arrears ?? null,
    );

  it('the leader, set_dues and manage_bank see every member', () => {
    expect(arrearsSeen(LEADER)).toEqual(['0n', '0n', '5n', '7n']);
    expect(arrearsSeen(TREASURER)).toEqual(['0n', '0n', '5n', '7n']);
    expect(arrearsSeen(13)).toEqual(['0n', '0n', '5n', '7n']);
  });

  it('other members see only their own; outsiders none', () => {
    expect(arrearsSeen(MEMBER)).toEqual([null, null, '5n', null]);
    expect(arrearsSeen(null)).toEqual([null, null, null, null]);
  });
});
