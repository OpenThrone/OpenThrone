import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

// Bypass authentication by mocking the withAuth middleware to return the handler directly
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

const route = require('../../../../pages/api/bank/history').default;

const ERA_START = new Date('2026-01-01T00:00:00Z'); // installMockPrisma era

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

// The failure test replaces era.findFirst; restore it so random order holds.
const defaultEraFindFirst = mockPrisma.era.findFirst;

beforeEach(() => {
  resetMockPrisma();
  mockPrisma.era.findFirst = defaultEraFindFirst;
  mockPrisma.bank_history = {
    findMany: vi.fn(async () => []),
    create: vi.fn(async () => ({})),
    count: vi.fn(async () => 0),
  } as any;
});

describe('GET /api/bank/history (parity)', () => {
  it('returns the paginated envelope with stringified rows', async () => {
    mockPrisma.bank_history.count = vi.fn(async () => 25);
    mockPrisma.bank_history.findMany = vi.fn(async () => [
      {
        id: 1,
        gold_amount: 100n,
        date_time: new Date('2026-10-01T12:00:00Z'),
        history_type: 'PLAYER_TRANSFER',
      },
    ]);
    const res = makeRes();

    await route(
      { method: 'GET', query: {}, session: { user: { id: 1 } } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      rows: [
        {
          id: 1,
          gold_amount: '100n',
          date_time: '2026-10-01T12:00:00.000Z',
          history_type: 'PLAYER_TRANSFER',
        },
      ],
      total: 25,
      totalPages: 3,
      currentPage: 0,
      limit: 10,
    });
  });

  it('scopes the query to the session users rows within the era', async () => {
    await route(
      { method: 'GET', query: {}, session: { user: { id: 1 } } } as any,
      makeRes(),
    );

    expect(mockPrisma.bank_history.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { OR: [{ from_user_id: 1 }, { to_user_id: 1 }] },
          { date_time: { gte: ERA_START } },
        ],
      },
      take: 10,
      skip: 0,
      orderBy: { date_time: 'desc' },
    });
  });

  it('applies the deposits filter alongside the own-rows condition', async () => {
    await route(
      {
        method: 'GET',
        query: { deposits: 'true' },
        session: { user: { id: 1 } },
      } as any,
      makeRes(),
    );

    expect(mockPrisma.bank_history.count).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              {
                from_user_account_type: 'HAND',
                to_user_id: 1,
                to_user_account_type: 'BANK',
                from_user_id: 1,
                history_type: 'PLAYER_TRANSFER',
              },
            ],
          },
          { OR: [{ from_user_id: 1 }, { to_user_id: 1 }] },
          { date_time: { gte: ERA_START } },
        ],
      },
    });
  });

  it('honours page and limit query parameters', async () => {
    mockPrisma.bank_history.count = vi.fn(async () => 25);
    const res = makeRes();

    await route(
      {
        method: 'GET',
        query: { page: '2', limit: '20' },
        session: { user: { id: 1 } },
      } as any,
      res,
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 25,
        totalPages: 2,
        currentPage: 2,
        limit: 20,
      }),
    );
    expect(mockPrisma.bank_history.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20, skip: 40 }),
    );
  });

  it('ends the response with 405 and no body for non-GET methods', async () => {
    const res = makeRes();

    await route(
      { method: 'POST', query: {}, session: { user: { id: 1 } } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(mockPrisma.bank_history.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 with field errors for invalid query parameters', async () => {
    const res = makeRes();

    await route(
      {
        method: 'GET',
        query: { page: 'abc' },
        session: { user: { id: 1 } },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('Invalid query parameters');
    expect(Array.isArray(body.details.page)).toBe(true);
  });

  it('returns 401 when the session is missing', async () => {
    const res = makeRes();

    await route({ method: 'GET', query: {}, session: null } as any, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(mockPrisma.bank_history.findMany).not.toHaveBeenCalled();
  });

  it('maps service failures to 400 with the error message', async () => {
    mockPrisma.era.findFirst = vi.fn(async () => {
      throw new Error('era unavailable');
    });
    const res = makeRes();

    await route(
      { method: 'GET', query: {}, session: { user: { id: 1 } } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'era unavailable' });
  });
});
