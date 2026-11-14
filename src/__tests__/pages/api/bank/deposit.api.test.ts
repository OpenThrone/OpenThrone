import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

// Bypass apiGuard (delegates to the handler with query/body context) and the
// idempotency middleware so the route logic itself is under test.
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: () => (h: any) => (req: any, res: any) =>
    h(req, res, { query: req.query ?? {}, body: req.body ?? {} }),
}));
const enforceIdempotency = vi.fn(async () => true);
mock.module('@/middleware/idempotency', () => ({ enforceIdempotency }));

const route = require('../../../../pages/api/bank/deposit').default;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const makeReq = (body: unknown, session?: object) => ({
  method: 'POST',
  headers: {},
  session,
  body,
});

beforeEach(() => {
  resetMockPrisma();
  enforceIdempotency.mockClear();
  enforceIdempotency.mockResolvedValue(true);
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(
    async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
      callback(mockPrisma),
  );
  mockPrisma.users = {
    findUnique: vi.fn(async () => ({ id: 1, gold: 1000n, gold_in_bank: 500n })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  } as any;
  mockPrisma.bank_history = {
    findMany: vi.fn(async () => []),
    create: vi.fn(async () => ({})),
  } as any;
});

describe('POST /api/bank/deposit (parity)', () => {
  it('returns 200 with message and stringified user data on success', async () => {
    const res = makeRes();

    await route(makeReq({ amount: 100 }, { user: { id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Deposit successful',
      data: { gold: '1000n', gold_in_bank: '500n' },
    });
    expect(mockPrisma.bank_history.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gold_amount: 100n,
        from_user_account_type: 'HAND',
        to_user_account_type: 'BANK',
        history_type: 'PLAYER_TRANSFER',
      }),
    });
  });

  it('returns 400 with the domain error for insufficient gold', async () => {
    mockPrisma.users.findUnique = vi.fn(async () => ({
      id: 1,
      gold: 10n,
      gold_in_bank: 500n,
    }));
    const res = makeRes();

    await route(makeReq({ amount: 100 }, { user: { id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Not enough gold for deposit',
    });
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 with the domain error for an invalid amount', async () => {
    const res = makeRes();

    await route(makeReq({ amount: 'abc' }, { user: { id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid deposit amount: abc',
    });
  });

  it('returns 401 when the session is missing', async () => {
    const res = makeRes();

    await route(makeReq({ amount: 100 }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });

  it('scopes the idempotency key to the deposit amount and acting user', async () => {
    await route(makeReq({ amount: 100 }, { user: { id: 7 } }), makeRes());

    expect(enforceIdempotency).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { scope: 'bank-deposit:100', actorKey: '7' },
    );
  });

  it('stops before the service when the idempotency key is a replay', async () => {
    enforceIdempotency.mockResolvedValue(false);
    const res = makeRes();

    await route(makeReq({ amount: 100 }, { user: { id: 1 } }), res);

    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(200);
  });
});
