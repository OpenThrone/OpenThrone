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

const route = require('../../../../pages/api/alliances/[id]').default;

beforeEach(() => {
  resetMockPrisma();
  mockPrisma.alliances = {
    findUnique: vi.fn(async () => ({
      id: ALLIANCE_ID,
      name: 'Synthetic Pact',
      leader_id: LEADER_ID,
      roster_visibility: 'MEMBERS_ONLY',
      gold_in_bank: 900n,
      _count: { members: 2 },
      alliance_roles: [],
      members: [
        { id: 1, user_id: LEADER_ID, role: { id: 1, name: 'Member' } },
        { id: 2, user_id: MEMBER_ID, role: { id: 1, name: 'Member' } },
      ],
    })),
  };
});

const req = (userId: number) => ({
  method: 'GET',
  query: { id: String(ALLIANCE_ID) },
  session: { user: { id: userId } },
});

describe('GET /api/alliances/[id] (ALL-08)', () => {
  it('omits treasury and the hidden roster for a non-member', async () => {
    const res = makeRes();

    await route(req(OUTSIDER_ID), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.gold_in_bank).toBeUndefined();
    expect(body.members).toBeUndefined();
    expect(body._count.members).toBe(2);
  });

  it('returns treasury and roster to a member', async () => {
    const res = makeRes();

    await route(req(MEMBER_ID), res);

    const body = res.json.mock.calls[0][0];
    expect(body.gold_in_bank).toBe('900n');
    expect(body.members).toHaveLength(2);
  });
});
