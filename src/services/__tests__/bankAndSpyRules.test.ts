import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
// Dynamic imports deliberately install the Prisma test boundary before service loading.
const { AllianceBankService } = await import('../AllianceBank.service');
const { depositGold, withdrawGold } = await import('../Bank.service');
const { invalidateRuntimeConfigCache } =
  await import('../RuntimeConfig.service');
const { EconomyUpgrades } = await import('@/constants');

// The mock transaction client is the same object as the root client, so call order
// across tx.* and root methods is observable.
let order: string[];

beforeEach(() => {
  order = [];
  mockPrisma.$queryRaw = vi.fn(async () => {
    order.push('lock');
    return [];
  });
  mockPrisma.$transaction = vi.fn(
    async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
      callback(mockPrisma),
  );
  mockPrisma.alliances = {
    findUnique: vi.fn(async () => ({ leader_id: 10 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  } as any;
  const isMember = (userId: number) => userId === 10 || userId === 11;
  mockPrisma.alliance_memberships = {
    count: vi.fn(async ({ where }: { where: { user_id: number } }) =>
      isMember(where.user_id) ? 1 : 0,
    ),
    // Transfers resolve the actor's role by the composite unique key.
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { unique_alliance_user: { user_id: number } };
      }) =>
        isMember(where.unique_alliance_user.user_id)
          ? {
              user_id: where.unique_alliance_user.user_id,
              role: { permissions: {} },
            }
          : null,
    ),
  } as any;
  mockPrisma.alliance_bank_history = {
    create: vi.fn(async () => ({})),
    aggregate: vi.fn(async () => ({ _sum: { amount: null } })),
  } as any;
  mockPrisma.users = {
    findUnique: vi.fn(async () => ({ id: 1, gold: 1000n, gold_in_bank: 500n })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async () => ({})),
  } as any;
  mockPrisma.bank_history = {
    findMany: vi.fn(async () => []),
    create: vi.fn(async () => ({})),
    count: vi.fn(async () => 0),
  } as any;
});

describe('alliance bank withdraw rules', () => {
  test('a non-member requester is rejected before any balance change', async () => {
    await expect(
      AllianceBankService.withdraw({
        allianceId: 1,
        requesterId: 99,
        targetUserId: 11,
        amount: 10n,
      }),
    ).rejects.toThrow('You are not a member of this alliance');
    expect(mockPrisma.alliances.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });

  test('a withdrawal to a non-member target is rejected', async () => {
    await expect(
      AllianceBankService.withdraw({
        allianceId: 1,
        requesterId: 10,
        targetUserId: 99,
        amount: 10n,
      }),
    ).rejects.toThrow('Target user is not a member of this alliance');
    expect(mockPrisma.alliances.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });

  test('the alliance row is locked before leadership and balance are evaluated', async () => {
    mockPrisma.alliances.updateMany = vi.fn(async () => {
      order.push('debit');
      return { count: 1 };
    });
    await AllianceBankService.withdraw({
      allianceId: 1,
      requesterId: 10,
      targetUserId: 11,
      amount: 10n,
    });
    expect(order[0]).toBe('lock');
    // Alliance row, then the target user row (see lockAllianceThenUsers).
    expect(order).toEqual(['lock', 'lock', 'debit']);
    expect(mockPrisma.alliances.updateMany).toHaveBeenCalledWith({
      where: { id: 1, gold_in_bank: { gte: 10n } },
      data: { gold_in_bank: { decrement: 10n } },
    });
  });

  test('a conditional debit that matches no row fails instead of going negative', async () => {
    mockPrisma.alliances.updateMany = vi.fn(async () => ({ count: 0 }));
    await expect(
      AllianceBankService.withdraw({
        allianceId: 1,
        requesterId: 10,
        targetUserId: 11,
        amount: 10n,
      }),
    ).rejects.toThrow('Insufficient alliance funds');
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });
});

describe('alliance bank deposit rules', () => {
  test('deposit requires the debit to match exactly one row', async () => {
    mockPrisma.users.updateMany = vi.fn(async () => ({ count: 0 }));
    await expect(
      AllianceBankService.deposit({ allianceId: 1, userId: 10, amount: 10n }),
    ).rejects.toThrow('Insufficient gold');
    expect(mockPrisma.alliances.updateMany).not.toHaveBeenCalled();
  });
});

describe('hand-to-bank deposit cap is enforced under the user lock', () => {
  test('the max-deposit count is read inside the locked transaction', async () => {
    mockPrisma.bank_history.findMany = vi.fn(async () => {
      order.push('history');
      return Array.from({ length: 10_000 }, () => ({}));
    });
    await expect(depositGold(1, 10)).rejects.toThrow(
      'Maximum deposits reached',
    );
    expect(order[0]).toBe('lock');
    expect(order.indexOf('history')).toBeGreaterThan(order.indexOf('lock'));
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });

  test('a balance that changed under the update is rejected instead of double-applied', async () => {
    mockPrisma.users.updateMany = vi.fn(async () => ({ count: 0 }));
    await expect(depositGold(1, 100)).rejects.toThrow(
      'Your gold balance changed, please try again',
    );
    expect(mockPrisma.bank_history.create).not.toHaveBeenCalled();
  });

  test('a deposit within the cap debits with a conditional update', async () => {
    await depositGold(1, 100);
    expect(mockPrisma.users.updateMany).toHaveBeenCalledWith({
      where: { id: 1, gold: { gte: 100n } },
      data: {
        gold: { decrement: 100n },
        gold_in_bank: { increment: 100n },
      },
    });
  });
});

describe('bank withdraw is a conditional debit', () => {
  test('withdrawing more than the bank holds is rejected', async () => {
    await expect(withdrawGold(1, 501n)).rejects.toThrow(
      'Not enough gold for withdrawal',
    );
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });
});

describe('hand-to-bank bank capacity', () => {
  // A level 0 economy (Farm) banks up to 10,000,000 gold.
  const FARM_CAP = 10_000_000n;

  const setUser = (user: Record<string, unknown>) => {
    mockPrisma.users.findUnique = vi.fn(async () => ({
      id: 1,
      gold: 100_000_000n,
      ...user,
    }));
  };

  test('allows a deposit that exactly fills the bank', async () => {
    setUser({ gold_in_bank: FARM_CAP - 1000n });
    await depositGold(1, 1000);
    expect(mockPrisma.users.updateMany).toHaveBeenCalled();
  });

  test('refuses a deposit past the capacity, before moving any gold', async () => {
    setUser({ gold_in_bank: FARM_CAP - 1000n });
    await expect(depositGold(1, 1001)).rejects.toThrow(
      'has room for 1,000 more',
    );
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });

  test('a balance already over capacity stays, but cannot grow', async () => {
    setUser({ gold_in_bank: FARM_CAP + 5000n });
    await expect(depositGold(1, 1)).rejects.toThrow('has room for 0 more');
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });

  test('economy upgrades raise the capacity', async () => {
    setUser({ gold_in_bank: FARM_CAP, economy_level: 1 });
    await depositGold(1, 1000);
    expect(mockPrisma.users.updateMany).toHaveBeenCalled();
  });

  test('over-capacity gold can still be withdrawn', async () => {
    setUser({ gold_in_bank: FARM_CAP + 5000n });
    await withdrawGold(1, 1000);
    expect(mockPrisma.users.updateMany).toHaveBeenCalled();
  });
});

describe('hand-to-bank deposit cap percent and rolling window', () => {
  // Hand holds 1000 gold (see beforeEach), so each percent maps to an exact limit.
  const setCapPercent = (value: number | null) => {
    mockPrisma.serverSetting.findMany = vi.fn(async () =>
      value === null ? [] : [{ key: 'bank.depositCapPercent', value }],
    );
    invalidateRuntimeConfigCache();
  };

  afterEach(() => {
    setCapPercent(null);
  });

  test('without an override the cap is 80% of gold on hand', async () => {
    setCapPercent(null);
    await expect(depositGold(1, 801)).rejects.toThrow(
      'exceeds the maximum allowed (80% of gold on hand)',
    );
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
    await depositGold(1, 800);
    expect(mockPrisma.users.updateMany).toHaveBeenCalledTimes(1);
  });

  test('the cap is read from bank.depositCapPercent at deposit time', async () => {
    setCapPercent(50);
    await expect(depositGold(1, 501)).rejects.toThrow(
      'exceeds the maximum allowed (50% of gold on hand)',
    );
    await depositGold(1, 500);
    expect(mockPrisma.users.updateMany).toHaveBeenCalledTimes(1);

    // The same amount that was refused passes once the setting is raised.
    setCapPercent(90);
    await depositGold(1, 501);
    expect(mockPrisma.users.updateMany).toHaveBeenCalledTimes(2);
  });

  test('a deposit beyond gold on hand is refused before the percent cap', async () => {
    setCapPercent(100);
    await expect(depositGold(1, 1001)).rejects.toThrow(
      'Not enough gold for deposit',
    );
  });

  test('only deposits inside the last 24 hours count toward the daily limit', async () => {
    const now = new Date('2026-06-15T12:00:00Z').getTime();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const limit = EconomyUpgrades[0].depositsPerDay;
      const hours = (h: number) => new Date(now - h * 3_600_000);
      // The mocked table honours the query's lower bound like the database.
      const rows = [
        ...Array.from({ length: limit - 1 }, () => ({ date_time: hours(2) })),
        // Older than the window: must not be counted against the user.
        ...Array.from({ length: 5 }, () => ({ date_time: hours(25) })),
      ];
      mockPrisma.bank_history.findMany = vi.fn(
        async ({ where }: { where: { date_time: { gte: Date } } }) =>
          rows.filter((row) => row.date_time >= where.date_time.gte),
      );

      await depositGold(1, 100);
      const { where } = mockPrisma.bank_history.findMany.mock.calls[0][0];
      expect(where.date_time.gte.getTime()).toBe(now - 24 * 3_600_000);

      // One more deposit inside the window fills it; the next is refused.
      rows.push({ date_time: hours(1) });
      await expect(depositGold(1, 100)).rejects.toThrow(
        'Maximum deposits reached',
      );
    } finally {
      nowSpy.mockRestore();
    }
  });
});
