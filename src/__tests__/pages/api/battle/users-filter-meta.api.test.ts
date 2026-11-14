import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
silenceLogger();

const handler =
  require('../../../../pages/api/battle/users-filter-meta').default;

// Synthetic identity; not a real account.
const VIEWER = 41;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('GET /api/battle/users-filter-meta', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.attack_log.findMany = vi.fn(async () => []);
  });

  it('never counts a spy mission that got through against its target', async () => {
    const res = makeRes();
    await handler(
      { method: 'GET', query: {}, session: { user: { id: VIEWER } } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const { where } = mockPrisma.attack_log.findMany.mock.calls[0][0];
    // The viewer's own missions and attacks count in full; as a target they
    // see battles and the missions their sentries stopped, nothing else.
    expect(where.OR).toEqual([
      { attacker_id: VIEWER },
      {
        defender_id: VIEWER,
        OR: [{ type: 'attack' }, { winner: VIEWER }],
      },
    ]);
  });
});
