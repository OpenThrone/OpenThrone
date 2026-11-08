import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
// The real alliance lock and borrowing check run against the stubbed tx.
const { extendAllianceForce } =
  await import('./AllianceForceExtension.service');

describe('alliance loan extension quantity cap', () => {
  let tx: any;
  const later = new Date(Date.now() + 86400000);
  const contract = {
    id: 9,
    kind: 'ALLIANCE',
    allianceId: 5,
    userId: 2,
    eraId: 1,
    status: 'ACTIVE',
    expiresAt: later,
    survivingQuantity: 600,
  };
  const extend = () =>
    extendAllianceForce({
      contractId: 9,
      actorId: 2,
      days: 1,
      operationId: '123e4567-e89b-42d3-a456-426614174000',
    });
  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      serverSetting: { findMany: vi.fn().mockResolvedValue([]) },
      forceEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      forceContract: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(contract),
        // 1,200 borrowed in total; this contract is 600 of it.
        aggregate: vi
          .fn()
          .mockResolvedValue({ _sum: { survivingQuantity: 1200 } }),
        update: vi.fn().mockResolvedValue(contract),
      },
      alliance_memberships: {
        findUnique: vi.fn().mockResolvedValue({ role_id: 1 }),
      },
      alliances: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ leader_id: 3 }),
      },
      allianceForcePolicy: {
        findFirstOrThrow: vi
          .fn()
          .mockResolvedValue({ settings: { lendingMode: 'MANUAL' } }),
      },
    };
    mockPrisma.serverSetting.findMany = vi
      .fn()
      .mockResolvedValue([{ key: 'force.maxQuantity', value: 1000 }]);
    mockPrisma.forceContract.findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue(contract);
    mockPrisma.$transaction = vi.fn((fn) => fn(tx));
  });
  it('refuses when total borrowing exceeds the runtime cap', async () => {
    await expect(extend()).rejects.toThrow(
      'Loan exceeds the current force quantity limit',
    );
    expect(tx.forceContract.update).not.toHaveBeenCalled();
  });
  it('extends when total borrowing is within the cap', async () => {
    tx.forceContract.aggregate = vi
      .fn()
      .mockResolvedValue({ _sum: { survivingQuantity: 900 } });
    await extend();
    expect(tx.forceContract.update).toHaveBeenCalledTimes(1);
  });
});
