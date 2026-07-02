import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

// Mock Prisma client to avoid Bun import issues
mock.module('@prisma/client', () => ({
  Prisma: {},
  PrismaClient() {},
}));

// stats.ts is default export
const handler = require('../../../pages/api/stats').default;

describe('API stats', () => {
  beforeEach(() => {
    resetMockPrisma();
  });

  it('returns correctly fetched stats with era filtering', async () => {
    const req: any = { method: 'GET' };
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res: any = {
      status,
      setHeader: vi.fn(),
    };

    const mockStartDate = new Date('2024-01-01');

    // Setup mocks - era must be set on mockPrisma before handler runs
    mockPrisma.era = {
      findFirst: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Era Test',
        startDate: mockStartDate,
      }),
      create: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Era Test',
        startDate: mockStartDate,
      }),
    };
    mockPrisma.users.count = vi.fn().mockResolvedValue(1234);
    mockPrisma.attack_log.count = vi.fn().mockResolvedValue(5678);
    mockPrisma.alliances = { count: vi.fn().mockResolvedValue(90) };

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      players: 1234,
      battles: 5678,
      alliances: 90,
      epoch: 'Era Test',
    });

    // Verify filtering
    expect(mockPrisma.users.count).toHaveBeenCalledWith({
      where: { currentEraId: 1 },
    });
    expect(mockPrisma.attack_log.count).toHaveBeenCalledWith({
      where: { timestamp: { gte: mockStartDate } },
    });
  });

  it('handles errors gracefully', async () => {
    const req: any = { method: 'GET' };
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res: any = {
      status,
      setHeader: vi.fn(),
    };

    mockPrisma.users.count = vi.fn().mockRejectedValue(new Error('DB Error'));
    mockPrisma.era = {
      findFirst: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Era Test',
        startDate: new Date(),
      }),
    };

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: 'Failed to fetch stats' });
  });

  it('returns 405 for non-GET methods', async () => {
    const req: any = { method: 'POST' };
    const end = vi.fn();
    const status = vi.fn().mockReturnValue({ end });
    const res: any = {
      status,
      setHeader: vi.fn(),
    };

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(405);
    expect(end).toHaveBeenCalledWith('Method POST Not Allowed');
  });
});
