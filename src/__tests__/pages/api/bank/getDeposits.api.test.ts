import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

// Bypass authentication by mocking the withAuth middleware to return the handler directly
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

const route = require('../../../../pages/api/bank/getDeposits').default;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

beforeEach(() => {
  resetMockPrisma();
  mockPrisma.users = {
    findUnique: vi.fn(async () => ({
      id: 1,
      gold: 1000n,
      gold_in_bank: 500n,
    })),
  } as any;
  mockPrisma.bank_history = {
    findMany: vi.fn(async () => []),
    create: vi.fn(async () => ({})),
  } as any;
});

describe('GET /api/bank/getDeposits (parity)', () => {
  it('returns remaining deposits and a zero countdown when none were used', async () => {
    const res = makeRes();

    await route({ method: 'GET', session: { user: { id: 1 } } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      deposits: 3, // economy level 0 => 3 deposits per day
      nextDepositAvailable: 0,
    });
  });

  it('counts down from the oldest deposit in the window', async () => {
    mockPrisma.bank_history.findMany = vi.fn(async () => [
      { date_time: new Date(Date.now() - 60_000) },
    ]);
    const res = makeRes();

    await route({ method: 'GET', session: { user: { id: 1 } } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.deposits).toBe(2);
    expect(body.nextDepositAvailable).toEqual(
      expect.objectContaining({ hours: 23 }),
    );
  });

  it('returns 404 when the user row is missing', async () => {
    mockPrisma.users.findUnique = vi.fn(async () => null);
    const res = makeRes();

    await route({ method: 'GET', session: { user: { id: 1 } } } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });

  it('returns 401 when the session is missing', async () => {
    const res = makeRes();

    await route({ method: 'GET', session: null } as any, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
  });

  it('maps service failures to 400 with the error message', async () => {
    mockPrisma.bank_history.findMany = vi.fn(async () => {
      throw new Error('boom');
    });
    const res = makeRes();

    await route({ method: 'GET', session: { user: { id: 1 } } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'boom' });
  });
});
