import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  vi,
} from 'bun:test';

import prisma from '@/lib/prisma';

// Restore the shared prisma mock after each test so other suites keep their own $transaction
const originalTransaction = (prisma as any).$transaction;

afterEach(() => {
  (prisma as any).$transaction = originalTransaction;
});

// Bypass the auth wrapper so the handler is called directly with a fake session
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

const handler = require('../../../../pages/api/battle/upgrades').default;

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: any) => {
    res.body = body;
    return res;
  });
  res.setHeader = vi.fn();
  return res;
};

describe('API battle/upgrades userId binding (F-03)', () => {
  beforeEach(() => {
    (prisma as any).$transaction = mock(async () => {
      throw new Error('transaction should not run for a mismatched user');
    });
  });

  it('rejects a body userId that differs from the session user', async () => {
    const req: any = {
      method: 'POST',
      session: { user: { id: 7 } },
      body: {
        userId: 8,
        items: [{ type: 'OFFENSE', level: 1, quantity: 1 }],
        operation: 'sell',
      },
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it('rejects requests without a session', async () => {
    const req: any = {
      method: 'POST',
      session: undefined,
      body: { userId: 7, items: [{ type: 'OFFENSE', level: 1, quantity: 1 }] },
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });
});
