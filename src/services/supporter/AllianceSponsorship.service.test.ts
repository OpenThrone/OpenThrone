import { expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { convertPool } =
  await import('@/services/supporter/AllianceSponsorship.service');
it('converts whole months and preserves the remainder', async () => {
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  const end = new Date(Date.now() + 10 * 86400000);
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
