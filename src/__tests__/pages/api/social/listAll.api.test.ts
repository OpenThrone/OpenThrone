import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

// Synthetic player IDs.
const CALLER_ID = 7;
const OTHER_ID = 9;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const route = require('../../../../pages/api/social/listAll').default;

beforeEach(() => {
  resetMockPrisma();
  mockPrisma.social = {
    ...mockPrisma.social,
    findMany: vi.fn(async () => []),
  };
});

describe('social listAll (SOC-01)', () => {
  it('requires a session', async () => {
    const res = makeRes();

    await route({ method: 'GET', query: { type: 'FRIEND' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.social.findMany).not.toHaveBeenCalled();
  });

  it('rejects a playerId instead of listing the session user under it', async () => {
    const res = makeRes();

    await route(
      {
        method: 'GET',
        query: { type: 'FRIEND', playerId: String(OTHER_ID) },
        session: { user: { id: CALLER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.social.findMany).not.toHaveBeenCalled();
  });

  it('lists only the session user', async () => {
    const res = makeRes();

    await route(
      {
        method: 'GET',
        query: { type: 'FRIEND', limit: '5' },
        session: { user: { id: CALLER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const { where } = mockPrisma.social.findMany.mock.calls[0][0];
    expect(where.AND[0].OR).toEqual([
      { playerId: CALLER_ID },
      { friendId: CALLER_ID },
    ]);
    expect(JSON.stringify(where)).not.toContain(String(OTHER_ID));
  });
});
