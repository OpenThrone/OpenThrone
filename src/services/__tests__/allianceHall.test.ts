import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the services load.
const { AllianceBankService } = await import('../AllianceBank.service');
const { AllianceUpgradeService } = await import('../AllianceUpgrade.service');
const { ALLIANCE_LEVELS, getAllianceLevel, ALLIANCE_DEPOSIT_WINDOW_MS } =
  await import('@/constants/allianceLevels');

// Synthetic alliance 3 (Alliance Hall levels): leader 5; builder 6 holds
// upgrade_alliance; member 8 holds nothing; outsider 99.
const ALLIANCE_ID = 3;
const LEADER = 5;
const BUILDER = 6;
const MEMBER = 8;
const OUTSIDER = 99;
const HOUR = 60 * 60 * 1000;

const ROLES: Record<number, { permissions: Record<string, boolean> }> = {
  [LEADER]: { permissions: {} },
  [BUILDER]: { permissions: { upgrade_alliance: true } },
  [MEMBER]: { permissions: {} },
};

let alliance: {
  status: string;
  hall_level: number;
  gold_in_bank: bigint;
  leader_id: number;
};
let memberCount: number;
let userGold: Record<number, bigint>;
let history: any[];

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error.message,
  );

const deposit = (amount: bigint, userId = MEMBER) =>
  AllianceBankService.deposit({ allianceId: ALLIANCE_ID, userId, amount });

const buy = (level: number, actorId = LEADER) =>
  AllianceUpgradeService.purchase({ allianceId: ALLIANCE_ID, actorId, level });

/** A DEPOSIT row by MEMBER `hoursAgo` hours before now. */
const pastDeposit = (hoursAgo: number) => ({
  alliance_id: ALLIANCE_ID,
  transaction_type: 'DEPOSIT',
  amount: 1n,
  performed_by_user_id: MEMBER,
  related_user_id: MEMBER,
  created_at: new Date(Date.now() - hoursAgo * HOUR),
});

beforeEach(() => {
  alliance = {
    status: 'ACTIVE',
    hall_level: 0,
    gold_in_bank: 0n,
    leader_id: LEADER,
  };
  memberCount = 3;
  userGold = { [LEADER]: 0n, [BUILDER]: 0n, [MEMBER]: 10_000_000n };
  history = [];

  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (operation: any) => {
    // Emulate rollback: restore state when the operation throws.
    const snapshot = {
      alliance: { ...alliance },
      userGold: { ...userGold },
      history: [...history],
    };
    try {
      return await operation(mockPrisma);
    } catch (error) {
      alliance = snapshot.alliance;
      userGold = snapshot.userGold;
      history = snapshot.history;
      throw error;
    }
  });
  mockPrisma.alliances = {
    findUnique: vi.fn(async () => ({ id: ALLIANCE_ID, ...alliance })),
    updateMany: vi.fn(async ({ where, data }: any) => {
      if (
        where.hall_level !== undefined &&
        where.hall_level !== alliance.hall_level
      )
        return { count: 0 };
      if (alliance.gold_in_bank < (where.gold_in_bank?.gte ?? 0n))
        return { count: 0 };
      if (data.gold_in_bank?.decrement !== undefined)
        alliance.gold_in_bank -= data.gold_in_bank.decrement;
      if (data.gold_in_bank?.increment !== undefined)
        alliance.gold_in_bank += data.gold_in_bank.increment;
      if (data.hall_level !== undefined) alliance.hall_level = data.hall_level;
      return { count: 1 };
    }),
  };
  mockPrisma.alliance_memberships = {
    findUnique: vi.fn(async ({ where }: any) => {
      const userId = where.unique_alliance_user.user_id;
      return ROLES[userId] ? { user_id: userId, role: ROLES[userId] } : null;
    }),
    count: vi.fn(async ({ where }: any) =>
      where.user_id !== undefined
        ? ROLES[where.user_id]
          ? 1
          : 0
        : memberCount,
    ),
  };
  mockPrisma.users = {
    findUnique: vi.fn(async ({ where }: any) => ({ gold: userGold[where.id] })),
    updateMany: vi.fn(async ({ where, data }: any) => {
      if (userGold[where.id] < (where.gold?.gte ?? 0n)) return { count: 0 };
      userGold[where.id] -= data.gold.decrement;
      return { count: 1 };
    }),
  };
  mockPrisma.alliance_bank_history = {
    create: vi.fn(async ({ data }: any) => {
      const row = { created_at: new Date(), ...data };
      history.push(row);
      return row;
    }),
    findMany: vi.fn(async ({ where }: any) =>
      history
        .filter(
          (h) =>
            h.alliance_id === where.alliance_id &&
            h.performed_by_user_id === where.performed_by_user_id &&
            h.transaction_type === where.transaction_type &&
            h.created_at > where.created_at.gt,
        )
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime()),
    ),
  };
});

describe('Alliance Hall table', () => {
  it('matches the owner-approved numbers', () => {
    expect(
      ALLIANCE_LEVELS.map((l) => [
        l.level,
        l.name,
        l.cost,
        l.minMembers,
        l.maxMembers,
        l.depositsPer24h,
        l.treasuryCap,
      ]),
    ).toEqual([
      [0, 'Camp', 0n, 0, 10, 2, 5_000_000n],
      [1, 'Hall', 2_000_000n, 5, 20, 3, 25_000_000n],
      [2, 'Great Hall', 10_000_000n, 10, 35, 4, 100_000_000n],
      [3, 'Keep', 50_000_000n, 20, 50, 5, 500_000_000n],
      [4, 'Citadel', 250_000_000n, 30, 75, 6, 2_000_000_000n],
      [5, 'Stronghold', 1_000_000_000n, 50, 100, 8, 10_000_000_000n],
    ]);
  });

  it('treats missing or out-of-range levels as the nearest level', () => {
    expect(getAllianceLevel(undefined).level).toBe(0);
    expect(getAllianceLevel(null).level).toBe(0);
    expect(getAllianceLevel(-2).level).toBe(0);
    expect(getAllianceLevel(9).level).toBe(5);
  });

  it('every level stays buyable: its cost fits under the cap below it', () => {
    for (const level of ALLIANCE_LEVELS.slice(1)) {
      expect(level.cost).toBeLessThanOrEqual(
        ALLIANCE_LEVELS[level.level - 1].treasuryCap,
      );
      expect(level.minMembers).toBeLessThanOrEqual(
        ALLIANCE_LEVELS[level.level - 1].maxMembers,
      );
    }
  });
});

describe('deposits per member per rolling 24 hours', () => {
  it('allows the level limit and refuses the next with the reopen time', async () => {
    expect(await reason(deposit(100n))).toBeNull();
    expect(await reason(deposit(100n))).toBeNull();
    const refusal = await reason(deposit(100n));
    expect(refusal).toMatch(/Camp allows 2 deposits per member every 24 hours/);
    expect(refusal).toMatch(/next deposit opens in (23h 59m|24h 0m)/);
    expect(refusal).toMatch(/Upgrade the Alliance Hall/);
    expect(alliance.gold_in_bank).toBe(200n);
    expect(history).toHaveLength(2);
  });

  it('reopens a slot once the oldest deposit leaves the window', async () => {
    history.push(pastDeposit(25), pastDeposit(23));
    // 25h ago is outside the window: one slot used, one free.
    expect(await reason(deposit(100n))).toBeNull();

    history = [pastDeposit(23.5), pastDeposit(2)];
    expect(await reason(deposit(100n))).toMatch(/opens in 30m/);
  });

  it('counts only this member and this alliance', async () => {
    history.push(
      { ...pastDeposit(1), performed_by_user_id: LEADER },
      { ...pastDeposit(1), alliance_id: 4 },
    );
    expect(await reason(deposit(100n))).toBeNull();
    expect(await reason(deposit(100n))).toBeNull();
  });

  it('a higher hall level allows more deposits', async () => {
    alliance.hall_level = 1;
    history.push(pastDeposit(3), pastDeposit(2));
    expect(await reason(deposit(100n))).toBeNull();
    expect(await reason(deposit(100n))).toMatch(/Hall allows 3 deposits/);
  });

  it('reports the window helper slots for the Upgrades tab', async () => {
    const { getDepositWindow } = await import('../AllianceBank.service');
    history.push(pastDeposit(20), pastDeposit(10));
    const window = await getDepositWindow(
      mockPrisma as any,
      ALLIANCE_ID,
      MEMBER,
      2,
    );
    expect(window.used).toBe(2);
    expect(window.nextSlotAt?.getTime()).toBe(
      history[0].created_at.getTime() + ALLIANCE_DEPOSIT_WINDOW_MS,
    );
  });
});

describe('treasury cap', () => {
  it('refuses a deposit past the cap and names the room left', async () => {
    alliance.gold_in_bank = 4_900_000n;
    const refusal = await reason(deposit(200_000n));
    expect(refusal).toMatch(/Camp holds at most 5,000,000 gold/);
    expect(refusal).toMatch(/at most 100,000 more/);
    expect(alliance.gold_in_bank).toBe(4_900_000n);
    expect(userGold[MEMBER]).toBe(10_000_000n);
  });

  it('accepts a deposit that lands exactly on the cap', async () => {
    alliance.gold_in_bank = 4_900_000n;
    expect(await reason(deposit(100_000n))).toBeNull();
    expect(alliance.gold_in_bank).toBe(5_000_000n);
  });

  it('a treasury already over the cap takes no deposits', async () => {
    alliance.gold_in_bank = 6_000_000n;
    expect(await reason(deposit(1n))).toMatch(/at most 0 more/);
  });

  it('still applies the 80% of gold on hand rule', async () => {
    userGold[MEMBER] = 1_000n;
    expect(await reason(deposit(801n))).toMatch(/80%/);
  });
});

describe('buying Alliance Hall levels', () => {
  beforeEach(() => {
    alliance.gold_in_bank = 3_000_000n;
    memberCount = 5;
  });

  it('debits the treasury, raises the level and records the purchase', async () => {
    expect(await reason(buy(1))).toBeNull();
    expect(alliance.hall_level).toBe(1);
    expect(alliance.gold_in_bank).toBe(1_000_000n);
    expect(history).toEqual([
      expect.objectContaining({
        transaction_type: 'UPGRADE',
        amount: 2_000_000n,
        performed_by_user_id: LEADER,
        notes: 'Level 1',
      }),
    ]);
  });

  it('refuses when the member requirement is unmet', async () => {
    memberCount = 4;
    expect(await reason(buy(1))).toMatch(/Hall needs at least 5 members/);
    expect(alliance).toMatchObject({ hall_level: 0, gold_in_bank: 3_000_000n });
  });

  it('refuses when the treasury cannot pay', async () => {
    alliance.gold_in_bank = 1_999_999n;
    expect(await reason(buy(1))).toMatch(/Not enough treasury gold/);
    expect(alliance).toMatchObject({ hall_level: 0, gold_in_bank: 1_999_999n });
    expect(history).toHaveLength(0);
  });

  it('refuses while the alliance is reserved', async () => {
    alliance.status = 'RESERVED';
    expect(await reason(buy(1))).toMatch(/reserved/);
    expect(alliance.hall_level).toBe(0);
  });

  it('refuses a member without upgrade_alliance and an outsider', async () => {
    expect(await reason(buy(1, MEMBER))).toMatch(/permission to buy/);
    expect(await reason(buy(1, OUTSIDER))).toMatch(/not a member/);
    expect(alliance.hall_level).toBe(0);
  });

  it('lets a rank with upgrade_alliance buy for the leader', async () => {
    expect(await reason(buy(1, BUILDER))).toBeNull();
    expect(alliance.hall_level).toBe(1);
    expect(history[0].performed_by_user_id).toBe(BUILDER);
  });

  it('buys one level at a time and refuses a stale or skipped level', async () => {
    expect(await reason(buy(2))).toMatch(/only level 1 can be bought/);
    expect(await reason(buy(1))).toBeNull();
    // A double click resends level 1: nothing more is charged.
    expect(await reason(buy(1))).toMatch(/only level 2 can be bought/);
    expect(alliance.gold_in_bank).toBe(1_000_000n);
  });

  it('refuses past the top level', async () => {
    alliance.hall_level = 5;
    await expect(buy(6)).rejects.toThrow();
    expect(alliance.hall_level).toBe(5);
  });
});

describe('upgrade status', () => {
  it('shows the viewer permission and deposit slots, members only', async () => {
    mockPrisma.alliances.findUnique = vi.fn(async () => ({
      id: ALLIANCE_ID,
      ...alliance,
      hall_level: 1,
    }));
    history.push(pastDeposit(1));
    const leader = await AllianceUpgradeService.getStatus(ALLIANCE_ID, LEADER);
    expect(leader).toMatchObject({ hallLevel: 1, canUpgrade: true });
    const member = await AllianceUpgradeService.getStatus(ALLIANCE_ID, MEMBER);
    expect(member).toMatchObject({
      canUpgrade: false,
      memberCount: 3,
      deposits: { used: 1, limit: 3, nextSlotAt: null },
    });
    await expect(
      AllianceUpgradeService.getStatus(ALLIANCE_ID, OUTSIDER),
    ).rejects.toThrow(/Forbidden/);
  });
});
