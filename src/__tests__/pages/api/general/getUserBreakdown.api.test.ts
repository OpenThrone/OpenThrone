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

const route =
  require('../../../../pages/api/general/getUserBreakdown/[id]').default;

beforeEach(() => {
  resetMockPrisma();
  mockPrisma.users = {
    ...mockPrisma.users,
    findUnique: vi.fn(async ({ where }: any) =>
      where.id === CALLER_ID
        ? {
            id: CALLER_ID,
            display_name: 'synthetic',
            experience: 1,
            fort_level: 1,
            UserUnit: [],
            UserItem: [],
            UserStructureUpgrade: [],
            UserBattleUpgrade: [],
            UserBonusPoints: [],
          }
        : null,
    ),
  };
});

describe('getUserBreakdown (GEN-01)', () => {
  it('returns 403 for another player and reads no loadout', async () => {
    const res = makeRes();

    await route(
      { query: { id: String(OTHER_ID) }, session: { user: { id: CALLER_ID } } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
  });

  it('returns the caller own loadout', async () => {
    const res = makeRes();

    await route(
      {
        query: { id: String(CALLER_ID) },
        session: { user: { id: CALLER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 404 when the caller own account is missing, not 500', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(null);
    const res = makeRes();

    await route(
      {
        query: { id: String(CALLER_ID) },
        session: { user: { id: CALLER_ID } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
