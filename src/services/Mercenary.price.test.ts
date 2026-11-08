import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { MercenaryService, mercenaryOffer, MercenaryPriceChangedError } =
  await import('./Mercenary.service');

describe('mercenary price quote', () => {
  let tx: any;
  const command = {
    userId: 1,
    type: 'OFFENSE' as const,
    level: 1,
    quantity: 2,
    termDays: 1 as const,
    operationId: '123e4567-e89b-42d3-a456-426614174000',
  };
  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn(),
      serverSetting: { findMany: vi.fn().mockResolvedValue([]) },
      forceEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      users: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 1,
          currentEraId: 1,
          fort_level: 10,
          economy_level: 99,
          gold: 100000000n,
        }),
        // Stored-strength refresh after the hire reads the full roster.
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          currentEraId: 1,
          fort_level: 10,
          race: 'HUMAN',
          class: 'FIGHTER',
          experience: 0,
          UserUnit: [],
          UserItem: [],
          UserStructureUpgrade: [],
          UserBattleUpgrade: [],
          UserBonusPoints: [],
          forceContracts: [],
          wounded_units: [],
        }),
        update: vi.fn(),
      },
      userUnit: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 1000 } }),
      },
      era: { findFirst: vi.fn().mockResolvedValue({ id: 1 }) },
      forceContract: {
        aggregate: vi
          .fn()
          .mockResolvedValue({ _sum: { survivingQuantity: 0 } }),
        create: vi.fn().mockResolvedValue({ id: 7 }),
      },
    };
    mockPrisma.$transaction = vi.fn((fn) => fn(tx));
    mockPrisma.serverSetting.findMany = vi
      .fn()
      .mockRejectedValue(new Error('global connection used'));
  });
  it('rejects an outdated quote without spending gold and reads settings on the transaction', async () => {
    await expect(
      MercenaryService.hire({ ...command, expectedTotal: '0' }),
    ).rejects.toBeInstanceOf(MercenaryPriceChangedError);
    expect(tx.serverSetting.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.serverSetting.findMany).not.toHaveBeenCalled();
    expect(tx.users.update).not.toHaveBeenCalled();
    expect(tx.forceContract.create).not.toHaveBeenCalled();
  });
  it('charges the displayed total when the quote matches', async () => {
    const offer = mercenaryOffer('OFFENSE', 1);
    const total = 2n * (offer.mobilization + offer.dailyPrice);
    await MercenaryService.hire({
      ...command,
      expectedTotal: total.toString(),
    });
    expect(tx.users.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { gold: { decrement: total } } }),
    );
  });
});
