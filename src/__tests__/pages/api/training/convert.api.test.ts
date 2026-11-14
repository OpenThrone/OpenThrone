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
import { installMockPrisma, resetMockPrisma } from 'test/utils/mockPrisma';
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

// Route -> Training service contract. The convert-limit rules (fort-level
// unlock, sufficient source units) are enforced by the service; the route
// tests pin that its rejections reach the client cleanly. The spy targets
// the source module so the barrel re-export in the route stays live and no
// '@/services' module mock leaks into other test files.
const trainingService = require('@/services/Training.service');

const route = require('../../../../pages/api/training/convert').default;

// Synthetic player; not a real account.
const USER_ID = 1;

const CONVERT_BODY = {
  userId: USER_ID,
  fromUnit: 'OFFENSE_1',
  toUnit: 'OFFENSE_2',
  conversionAmount: 1000,
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
  url: '/api/training/convert',
  session:
    extra.session === undefined ? { user: { id: USER_ID } } : extra.session,
  body: extra.body ?? {},
});

let convertUnits: ReturnType<typeof spyOn>;

beforeEach(() => {
  resetMockPrisma();
  convertUnits = spyOn(trainingService, 'convertUnits');
  convertUnits.mockResolvedValue({
    message: 'Units converted successfully!',
    units: [{ type: 'OFFENSE', level: 2, quantity: 1000 }],
  });
});

afterEach(() => {
  convertUnits.mockRestore();
});

describe('POST /api/training/convert middleware registration', () => {
  it('uses the shared game_write rate-limit profile', () => {
    expect(authOptions).toHaveLength(1);
    expect(authOptions[0]).toMatchObject({ rateLimitProfile: 'game_write' });
  });

  it('rejects non-POST methods with 405', async () => {
    const res = makeRes();

    await route(makeReq({ method: 'GET' }), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Method GET Not Allowed',
    });
    expect(convertUnits).not.toHaveBeenCalled();
  });
});

describe('POST /api/training/convert auth', () => {
  it('requires a session', async () => {
    const res = makeRes();

    await route(makeReq({ session: null }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication required.',
    });
    expect(convertUnits).not.toHaveBeenCalled();
  });

  it('refuses to convert for a different user id', async () => {
    const res = makeRes();

    await route(makeReq({ body: { ...CONVERT_BODY, userId: 5 } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden: User ID mismatch',
    });
    expect(convertUnits).not.toHaveBeenCalled();
  });
});

describe('POST /api/training/convert body validation', () => {
  it('rejects a malformed unit identifier', async () => {
    const res = makeRes();

    await route(
      makeReq({ body: { ...CONVERT_BODY, fromUnit: 'offense_1' } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('Invalid request body.');
    expect(body.details).toBeDefined();
    expect(convertUnits).not.toHaveBeenCalled();
  });

  it('rejects a non-positive conversion amount', async () => {
    const res = makeRes();

    await route(
      makeReq({ body: { ...CONVERT_BODY, conversionAmount: 0 } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('Invalid request body.');
    expect(convertUnits).not.toHaveBeenCalled();
  });
});

describe('POST /api/training/convert route-level conversion rules', () => {
  it('rejects converting across unit types before the service', async () => {
    const res = makeRes();

    await route(
      makeReq({ body: { ...CONVERT_BODY, toUnit: 'DEFENSE_1' } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error:
        'Conversion must be within the same unit type (e.g., ATTACK to ATTACK).',
    });
    expect(convertUnits).not.toHaveBeenCalled();
  });

  it('rejects converting to the same level before the service', async () => {
    const res = makeRes();

    await route(
      makeReq({ body: { ...CONVERT_BODY, toUnit: 'OFFENSE_1' } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Cannot convert units to the same level.',
    });
    expect(convertUnits).not.toHaveBeenCalled();
  });
});

describe('POST /api/training/convert delegation', () => {
  it('delegates with parsed identifiers and amounts', async () => {
    const res = makeRes();

    await route(
      makeReq({
        body: {
          userId: '1',
          fromUnit: 'OFFENSE_1',
          toUnit: 'OFFENSE_2',
          conversionAmount: '1,000',
        },
      }),
      res,
    );

    expect(convertUnits).toHaveBeenCalledTimes(1);
    expect(convertUnits).toHaveBeenCalledWith({
      userId: USER_ID,
      fromUnit: { type: 'OFFENSE', level: 1 },
      toUnit: { type: 'OFFENSE', level: 2 },
      conversionAmount: 1000,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Units converted successfully!',
      data: [{ type: 'OFFENSE', level: 2, quantity: 1000 }],
    });
  });
});

describe('POST /api/training/convert service rejections pass through', () => {
  it('surfaces the fort-level unlock limit as a 400 domain error', async () => {
    convertUnits.mockRejectedValue(
      new Error(
        'Cannot convert to Knight (level 2) yet. Requires fort level 4.',
      ),
    );
    const res = makeRes();

    await route(makeReq({ body: CONVERT_BODY }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Cannot convert to Knight (level 2) yet. Requires fort level 4.',
    });
  });

  it('surfaces the insufficient-units refusal as a 400 domain error', async () => {
    convertUnits.mockRejectedValue(
      new Error(
        'Not enough Soldier (Level 1) to convert. Required: 10, Available: 5',
      ),
    );
    const res = makeRes();

    await route(makeReq({ body: CONVERT_BODY }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error:
        'Not enough Soldier (Level 1) to convert. Required: 10, Available: 5',
    });
  });

  it('sanitizes database internals behind the generic message', async () => {
    const prismaError: any = new Error(
      'Not enough gold for upgrade ... prisma invocation of prisma.users.update',
    );
    prismaError.name = 'PrismaClientKnownRequestError';
    convertUnits.mockRejectedValue(prismaError);
    const res = makeRes();

    await route(makeReq({ body: CONVERT_BODY }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Something went wrong. Please try again.',
    });
  });

  it('hides unexpected service failures behind the generic 500 message', async () => {
    convertUnits.mockRejectedValue(new Error('boom'));
    const res = makeRes();

    await route(makeReq({ body: CONVERT_BODY }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'An unexpected error occurred while converting units.',
    });
  });
});
