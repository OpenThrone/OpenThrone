import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

// Mock Prisma client to avoid Bun import issues with @prisma/client
mock.module('@prisma/client', () => ({
  Prisma: {},
  PrismaClient() {},
}));

// Bypass authentication by mocking the withAuth middleware to return the handler directly
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

// Bypass apiGuard and idempotency middleware
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: () => (h: any) => (req: any, res: any) =>
    h(req, res, { query: req.query ?? {}, body: req.body ?? {} }),
}));
mock.module('@/middleware/idempotency', () => ({
  enforceIdempotency: () => (h: any) => h,
}));
mock.module('@/lib/socket', () => ({
  getSocketIO: () => ({ to: () => ({ emit: () => {} }) }),
}));

const spyHandler = require('../../../pages/api/spy/[id]').default;

describe('API spy/[id]', () => {
  beforeEach(() => resetMockPrisma());
  // ensure attack_log.count exists on mock
  mockPrisma.attack_log.count = vi.fn().mockResolvedValue(0);

  it('returns 400 for infiltrate when not enough infiltrators', async () => {
    // mock session user
    const req: any = {
      method: 'POST',
      session: { user: { id: 1 } },
      query: { id: '2' },
      body: { type: 'INFILTRATE', spies: 5 },
    };
    mockPrisma.users.findUnique = vi.fn().mockResolvedValue({
      id: 1,
      UserUnit: [
        {
          id: 0,
          userId: 1,
          type: 'SPY',
          level: 2,
          quantity: 1,
          isMercenary: false,
        },
      ],
    });
    const res: any = {
      status: (s: number) => ({
        json: (obj: any) => ({ status: s, body: obj }),
      }),
      getHeader: () => undefined,
    };
    const result = await spyHandler(req, res);
    expect(result.status).toBe(400);
  });
});

const noopHandler = (req: any, res: any) => {};

export default noopHandler;
