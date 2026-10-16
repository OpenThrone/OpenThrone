import { beforeEach, describe, expect, test, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
// Dynamic imports deliberately install the Prisma test boundary before service loading.
const { AllianceBankService } = await import('../AllianceBank.service');
const { depositGold, withdrawGold } = await import('../Bank.service');

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
  mockPrisma.alliance_memberships = {
    count: vi.fn(async ({ where }: { where: { user_id: number } }) =>
      where.user_id === 10 || where.user_id === 11 ? 1 : 0,
    ),
  } as any;
  mockPrisma.alliance_bank_history = { create: vi.fn(async () => ({})) } as any;
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
