import { expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { convertPool } =
  await import('@/services/supporter/AllianceSponsorship.service');
it('converts whole months and preserves the remainder', async () => {
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  const end = new Date(Date.now() + 10 * 86400000);
  mockPrisma.alliances = {
    findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
  };
  mockPrisma.allianceSponsorship = {
    findUnique: vi
      .fn()
      .mockResolvedValue({ poolCents: 1200, activeUntil: end }),
    update: vi.fn().mockResolvedValue({}),
  };
  await convertPool(3);
  expect(mockPrisma.allianceSponsorship.update).toHaveBeenCalledWith({
    where: { allianceId: 3 },
    data: {
      poolCents: 202,
      activeUntil: new Date(end.getTime() + 60 * 86400000),
    },
  });
});

it('keeps the pool unconverted while the alliance is reserved', async () => {
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockPrisma.alliances = {
    findUnique: vi.fn().mockResolvedValue({ status: 'RESERVED' }),
  };
  mockPrisma.allianceSponsorship = {
    findUnique: vi
      .fn()
      .mockResolvedValue({ poolCents: 1200, activeUntil: null }),
    update: vi.fn().mockResolvedValue({}),
  };
  await convertPool(3);
  expect(mockPrisma.allianceSponsorship.update).not.toHaveBeenCalled();
});
