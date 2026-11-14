import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, resetMockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);

// Capture each route's guard registration so the auth/rate-limit wiring
// itself is pinned (authMode, rateLimitProfile), then emulate the guard:
// method gate + the route's own zod schema for the body.
const guardRegistrations: any[] = [];
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: (options: any) => {
    guardRegistrations.push(options);
    return (handler: any) => async (req: any, res: any) => {
      if (!options.methods.includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      try {
        const body = options.bodySchema
          ? options.bodySchema.parse(req.body)
          : req.body;
        return handler(req, res, { body, query: req.query ?? {} });
      } catch {
        return res.status(400).json({ error: 'Invalid request body' });
      }
    };
  },
}));

const authWraps: any[] = [];
mock.module('@/middleware/auth', () => ({
  withAuth: (h: any, options?: any) => {
    authWraps.push(options);
    return h;
  },
}));

const enforceIdempotency = vi.fn(async () => true);
mock.module('@/middleware/idempotency', () => ({ enforceIdempotency }));

// Route -> AllianceBankService contract only; treasury bookkeeping internals
// stay covered by the service tests.
const deposit = vi.fn();
const withdraw = vi.fn();
const transfer = vi.fn();
mock.module('@/services', () => ({
  AllianceBankService: { deposit, withdraw, transfer },
}));

const depositRoute =
  require('../../../../pages/api/alliances/bank/deposit').default;
const withdrawRoute =
  require('../../../../pages/api/alliances/bank/withdraw').default;
const transferRoute =
  require('../../../../pages/api/alliances/bank/transfer').default;

// Each route registers its guard exactly once at module load, in this order.
const [depositGuard, withdrawGuard, transferGuard] = guardRegistrations;
const [transferAuthWrap] = authWraps;

const REQUESTER_ID = 5;
const TARGET_ID = 6;
const ALLIANCE_ID = 3;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const makeReq = (
  method: string,
  extra: { body?: unknown; session?: object | null } = {},
) => ({
  method,
  headers: {},
  session:
    extra.session === undefined
      ? { user: { id: REQUESTER_ID } }
      : extra.session,
  body: extra.body ?? {},
  query: {},
});

beforeEach(() => {
  resetMockPrisma();
  enforceIdempotency.mockClear();
  enforceIdempotency.mockResolvedValue(true);
  deposit.mockReset();
  withdraw.mockReset();
  transfer.mockReset();
});

describe('guard wiring (auth + rate profiles)', () => {
  it('registers deposit and withdraw under the bank profile with auth required', () => {
    expect(depositGuard).toMatchObject({
      methods: ['POST'],
      authMode: 'required',
      rateLimitProfile: 'bank',
    });
    expect(withdrawGuard).toMatchObject({
      methods: ['POST'],
      authMode: 'required',
      rateLimitProfile: 'bank',
    });
  });

  it('registers transfer with auth required and the game_write budget', () => {
    expect(transferGuard).toMatchObject({
      methods: ['POST'],
      authMode: 'required',
    });
    expect(transferGuard.rateLimitProfile).toBeUndefined();
    expect(transferAuthWrap).toMatchObject({ rateLimitProfile: 'game_write' });
  });
});

describe('POST /api/alliances/bank/deposit', () => {
  it('deposits with a coerced BigInt amount and returns the result', async () => {
    deposit.mockResolvedValue({ allianceId: ALLIANCE_ID, treasury: '900n' });
    const res = makeRes();

    await depositRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, amount: 100 } }),
      res,
    );

    expect(deposit).toHaveBeenCalledWith({
      userId: REQUESTER_ID,
      allianceId: ALLIANCE_ID,
      amount: 100n,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      allianceId: ALLIANCE_ID,
      treasury: '900n',
    });
  });

  it('scopes idempotency to the alliance, amount and actor', async () => {
    await depositRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, amount: 100 } }),
      makeRes(),
    );

    expect(enforceIdempotency).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { scope: `alliance-bank-deposit:${ALLIANCE_ID}:100`, actorKey: '5' },
    );
  });

  it('stops before the service when the idempotency key is a replay', async () => {
    enforceIdempotency.mockResolvedValue(false);
    const res = makeRes();

    await depositRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, amount: 100 } }),
      res,
    );

    expect(deposit).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(200);
  });

  it('rejects a non-positive amount before the service', async () => {
    const res = makeRes();

    await depositRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, amount: 0 } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(deposit).not.toHaveBeenCalled();
  });

  it('maps a membership refusal to a sanitized 400', async () => {
    deposit.mockRejectedValue(
      new Error('You are not a member of this alliance'),
    );
    const res = makeRes();

    await depositRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, amount: 100 } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'You are not a member of this alliance',
    });
  });

  it('passes the Alliance Hall limit code through with the message', async () => {
    const { AllianceLimitError, ALLIANCE_LIMIT_CODES } =
      await import('@/constants/allianceLevels');
    deposit.mockRejectedValue(
      new AllianceLimitError(
        ALLIANCE_LIMIT_CODES.depositSlots,
        'Deposit limit reached: Camp allows 2 deposits per member every 24 hours.',
      ),
    );
    const res = makeRes();

    await depositRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, amount: 100 } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error:
        'Deposit limit reached: Camp allows 2 deposits per member every 24 hours.',
      code: 'ALLIANCE_DEPOSIT_LIMIT',
    });
  });

  it('returns 405 for non-POST methods', async () => {
    const res = makeRes();

    await depositRoute(makeReq('GET'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(deposit).not.toHaveBeenCalled();
  });
});

describe('POST /api/alliances/bank/withdraw', () => {
  it('withdraws to a target member with notes and a BigInt amount', async () => {
    withdraw.mockResolvedValue({ allianceId: ALLIANCE_ID, withdrawn: 100n });
    const res = makeRes();

    await withdrawRoute(
      makeReq('POST', {
        body: {
          allianceId: ALLIANCE_ID,
          targetUserId: TARGET_ID,
          amount: 100,
          notes: 'siege supplies',
        },
      }),
      res,
    );

    expect(withdraw).toHaveBeenCalledWith({
      requesterId: REQUESTER_ID,
      allianceId: ALLIANCE_ID,
      targetUserId: TARGET_ID,
      amount: 100n,
      notes: 'siege supplies',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      allianceId: ALLIANCE_ID,
      withdrawn: 100n,
    });
  });

  it('scopes idempotency to alliance, target and amount', async () => {
    await withdrawRoute(
      makeReq('POST', {
        body: { allianceId: ALLIANCE_ID, targetUserId: TARGET_ID, amount: 100 },
      }),
      makeRes(),
    );

    expect(enforceIdempotency).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        scope: `alliance-bank-withdraw:${ALLIANCE_ID}:${TARGET_ID}:100`,
        actorKey: '5',
      },
    );
  });

  it('stops before the service when the idempotency key is a replay', async () => {
    enforceIdempotency.mockResolvedValue(false);
    const res = makeRes();

    await withdrawRoute(
      makeReq('POST', {
        body: { allianceId: ALLIANCE_ID, targetUserId: TARGET_ID, amount: 100 },
      }),
      res,
    );

    expect(withdraw).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(200);
  });

  it('requires a target user id', async () => {
    const res = makeRes();

    await withdrawRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, amount: 100 } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('surfaces the treasury refusal as a sanitized 400', async () => {
    withdraw.mockRejectedValue(new Error('Not enough gold in treasury'));
    const res = makeRes();

    await withdrawRoute(
      makeReq('POST', {
        body: { allianceId: ALLIANCE_ID, targetUserId: TARGET_ID, amount: 100 },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Not enough gold in treasury',
    });
  });
});

describe('POST /api/alliances/bank/transfer', () => {
  it('transfers treasury gold and stringifies the BigInt result', async () => {
    transfer.mockResolvedValue({
      allianceId: ALLIANCE_ID,
      treasury: 800n,
      transferred: 100n,
    });
    const res = makeRes();

    await transferRoute(
      makeReq('POST', {
        body: {
          allianceId: ALLIANCE_ID,
          targetUserId: TARGET_ID,
          amount: 100,
          notes: '  war reparations  ',
        },
      }),
      res,
    );

    expect(transfer).toHaveBeenCalledWith({
      requesterId: REQUESTER_ID,
      allianceId: ALLIANCE_ID,
      targetUserId: TARGET_ID,
      amount: 100n,
      notes: 'war reparations',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      allianceId: ALLIANCE_ID,
      treasury: '800n',
      transferred: '100n',
    });
  });

  it('rejects an over-long notes field', async () => {
    const res = makeRes();

    await transferRoute(
      makeReq('POST', {
        body: {
          allianceId: ALLIANCE_ID,
          targetUserId: TARGET_ID,
          amount: 100,
          notes: 'x'.repeat(201),
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(transfer).not.toHaveBeenCalled();
  });

  it('surfaces the permission refusal for a member without bank rights', async () => {
    transfer.mockRejectedValue(new Error('No permission'));
    const res = makeRes();

    await transferRoute(
      makeReq('POST', {
        body: { allianceId: ALLIANCE_ID, targetUserId: TARGET_ID, amount: 100 },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No permission' });
  });

  it('returns 405 for non-POST methods', async () => {
    const res = makeRes();

    await transferRoute(makeReq('GET'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(transfer).not.toHaveBeenCalled();
  });
});
