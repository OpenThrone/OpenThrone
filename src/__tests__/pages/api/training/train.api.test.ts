import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
  vi,
} from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Bypass withAuth (the handler itself enforces the session) while capturing
// the options the route registers.
const authOptions: any[] = [];
mock.module('@/middleware/auth', () => ({
  withAuth: (handler: any, options?: any) => {
    authOptions.push(options);
    return handler;
  },
}));

// Route -> Training service contract; prisma only sees the gameplay-activity
// stamp the route writes after a successful training. The spy targets the
// source module so the barrel re-export in the route stays live and no
// '@/services' module mock leaks into other test files.
const trainingService = require('@/services/Training.service');

const route = require('../../../../pages/api/training/train').default;

// Synthetic player; not a real account.
const USER_ID = 1;

const TRAIN_BODY = {
  userId: USER_ID,
  units: [{ type: 'OFFENSE', level: 1, quantity: 5 }],
};

const makeRes = () => {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const makeReq = (
  extra: { method?: string; body?: unknown; session?: object | null } = {},
) => ({
  method: extra.method ?? 'POST',
  headers: {},
  url: '/api/training/train',
  session:
    extra.session === undefined ? { user: { id: USER_ID } } : extra.session,
  body: extra.body ?? {},
});

let trainUnits: ReturnType<typeof spyOn>;

beforeEach(() => {
  resetMockPrisma();
  trainUnits = spyOn(trainingService, 'trainUnits');
  trainUnits.mockResolvedValue({
    message: 'Units trained successfully!',
    units: [{ type: 'OFFENSE', level: 1, quantity: 5 }],
  });
  mockPrisma.users.update = vi.fn(async () => ({}));
});

afterEach(() => {
  trainUnits.mockRestore();
});

describe('POST /api/training/train middleware registration', () => {
  it('uses the shared game_write rate-limit profile', () => {
    expect(authOptions).toHaveLength(1);
    expect(authOptions[0]).toMatchObject({ rateLimitProfile: 'game_write' });
  });

  it('rejects non-POST methods with 405 and an Allow header', async () => {
    const res = makeRes();

    await route(makeReq({ method: 'GET' }), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Method GET Not Allowed',
    });
    expect(res.setHeader).toHaveBeenCalledWith('Allow', ['POST']);
    expect(trainUnits).not.toHaveBeenCalled();
  });
});

describe('POST /api/training/train auth', () => {
  it('requires a session', async () => {
    const res = makeRes();

    await route(makeReq({ session: null }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication required.',
    });
    expect(trainUnits).not.toHaveBeenCalled();
  });

  it('refuses to train for a different user id', async () => {
    const res = makeRes();

    await route(makeReq({ body: { ...TRAIN_BODY, userId: 5 } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden: User ID mismatch',
    });
    expect(trainUnits).not.toHaveBeenCalled();
  });
});

describe('POST /api/training/train body validation', () => {
  it('rejects an unknown unit type with field errors', async () => {
    const res = makeRes();

    await route(
      makeReq({
        body: {
          userId: USER_ID,
          units: [{ type: 'MAGE', level: 1, quantity: 1 }],
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('Invalid request body.');
    expect(body.details).toBeDefined();
    expect(trainUnits).not.toHaveBeenCalled();
  });

  it('rejects a non-positive quantity', async () => {
    const res = makeRes();

    await route(
      makeReq({
        body: {
          userId: USER_ID,
          units: [{ type: 'OFFENSE', level: 1, quantity: 0 }],
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(body(res).error).toBe('Invalid request body.');
    expect(trainUnits).not.toHaveBeenCalled();
  });

  it('rejects an empty units list', async () => {
    const res = makeRes();

    await route(makeReq({ body: { userId: USER_ID, units: [] } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(body(res).error).toBe('Invalid request body.');
    expect(trainUnits).not.toHaveBeenCalled();
  });
});

describe('POST /api/training/train delegation', () => {
  it('delegates with parsed numeric user id and quantities and stamps activity', async () => {
    const res = makeRes();

    await route(
      makeReq({
        body: {
          userId: '1',
          units: [{ type: 'OFFENSE', level: 1, quantity: '5' }],
        },
      }),
      res,
    );

    expect(trainUnits).toHaveBeenCalledTimes(1);
    expect(trainUnits).toHaveBeenCalledWith({
      userId: USER_ID,
      units: [{ type: 'OFFENSE', level: 1, quantity: 5 }],
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Units trained successfully!',
      data: [{ type: 'OFFENSE', level: 1, quantity: 5 }],
    });
    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { last_gameplay_at: expect.any(Date) },
    });
  });
});

describe('POST /api/training/train service errors', () => {
  it('surfaces the gold refusal as a 400 domain error', async () => {
    trainUnits.mockRejectedValue(
      new Error('Not enough gold. You need 8,000 but have 500.'),
    );
    const res = makeRes();

    await route(makeReq({ body: TRAIN_BODY }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Not enough gold. You need 8,000 but have 500.',
    });
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('surfaces the citizens refusal as a 400 domain error', async () => {
    trainUnits.mockRejectedValue(
      new Error('Not enough citizens. Required: 50, Available: 10'),
    );
    const res = makeRes();

    await route(makeReq({ body: TRAIN_BODY }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Not enough citizens. Required: 50, Available: 10',
    });
  });

  it('sanitizes database internals behind the generic message', async () => {
    const prismaError: any = new Error(
      'Not enough gold for prisma.users.update invocation',
    );
    prismaError.name = 'PrismaClientKnownRequestError';
    trainUnits.mockRejectedValue(prismaError);
    const res = makeRes();

    await route(makeReq({ body: TRAIN_BODY }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Something went wrong. Please try again.',
    });
  });

  it('hides unexpected service failures behind the generic 500 message', async () => {
    trainUnits.mockRejectedValue(new Error('boom'));
    const res = makeRes();

    await route(makeReq({ body: TRAIN_BODY }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'An unexpected error occurred while training units.',
    });
  });
});

// Small helper so the body assertions stay readable above.
function body(res: any) {
  return res.json.mock.calls[0][0];
}
