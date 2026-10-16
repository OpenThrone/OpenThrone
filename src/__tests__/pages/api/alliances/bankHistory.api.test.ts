import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

// Synthetic accounts and alliance.
const LEADER_ID = 5;
const MEMBER_ID = 6;
const OUTSIDER_ID = 7;
const ALLIANCE_ID = 3;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const route = require('../../../../pages/api/alliances/bank/history').default;

beforeEach(() => {
  resetMockPrisma();
  mockPrisma.alliance_memberships = {
    count: vi.fn(async ({ where }: any) =>
      where.user_id === MEMBER_ID ? 1 : 0,
    ),
  };
  mockPrisma.alliances = {
    findUnique: vi.fn(async () => ({ leader_id: LEADER_ID })),
  };
  mockPrisma.alliance_bank_history = {
    findMany: vi.fn(async () => []),
  };
});

const req = (userId: number) => ({
  method: 'GET',
  query: { allianceId: String(ALLIANCE_ID) },
  session: { user: { id: userId } },
});

describe('alliance bank history (ALL-03)', () => {
  it('returns 403 to a non-member and reads no history', async () => {
    const res = makeRes();

    await route(req(OUTSIDER_ID), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.alliance_bank_history.findMany).not.toHaveBeenCalled();
  });

  it('lets a member read the history', async () => {
    const res = makeRes();

    await route(req(MEMBER_ID), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.alliance_bank_history.findMany).toHaveBeenCalled();
  });

  it('lets the leader read the history even without a membership row', async () => {
    const res = makeRes();

    await route(req(LEADER_ID), res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
