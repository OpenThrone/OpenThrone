import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

// Mutable flag so the route can be loaded with auto-recruit on.
const autoRecruitState = { enabled: true };
vi.mock('@/constants/AutoRecruit', () => ({
  get AUTO_RECRUIT_ENABLED() {
    return autoRecruitState.enabled;
  },
}));
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));

const loadRoute = () => {
  delete require.cache[
    require.resolve('../../../../pages/api/recruit/auto-recruit')
  ];
  delete require.cache[require.resolve('@/constants/AutoRecruit')];
  return require('../../../../pages/api/recruit/auto-recruit').default;
};

const { getValidUsersForRecruitment } =
  await import('@/services/Recruitment.service');

// Synthetic accounts; none correspond to real players.
const RECRUITER_ID = 42;
const OPEN_TARGET = 7;
const CAPPED_TARGET = 8;
const PAIR_DONE_TARGET = 9;

const activeUser = (id: number) => ({
  id,
  recruit_link: `link-${id}`,
  display_name: `Player ${id}`,
  race: 'ELF',
  class: 'FIGHTER',
  experience: 0,
  statusHistories: [{ status: 'ACTIVE' }],
});

const setup = ({ recruiterTotal = 0 }: { recruiterTotal?: number } = {}) => {
  mockPrisma.users.findMany = vi.fn(async () => [
    activeUser(OPEN_TARGET),
    activeUser(CAPPED_TARGET),
    activeUser(PAIR_DONE_TARGET),
  ]);
  mockPrisma.recruit_history = {
    count: vi.fn(async () => recruiterTotal),
    groupBy: vi.fn(async ({ where }: any) =>
      where.to_user === RECRUITER_ID
        ? // Recruits this recruiter took from each target.
          [
            { from_user: OPEN_TARGET, _count: { _all: 1 } },
            { from_user: PAIR_DONE_TARGET, _count: { _all: 5 } },
          ]
        : // Each target's total across all recruiters.
          [
            { from_user: OPEN_TARGET, _count: { _all: 3 } },
            { from_user: CAPPED_TARGET, _count: { _all: 25 } },
            { from_user: PAIR_DONE_TARGET, _count: { _all: 5 } },
          ],
    ),
  };
};

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

beforeEach(() => {
  resetMockPrisma();
  autoRecruitState.enabled = true;
});

describe('recruitment target selection', () => {
  it('excludes only targets at the pair limit, regardless of other visitors', async () => {
    setup();
    const result = await getValidUsersForRecruitment(RECRUITER_ID);

    expect(result.recruiterCapReached).toBe(false);
    expect(result.usersLeft.map((entry) => entry.user.id)).toEqual([
      OPEN_TARGET,
      CAPPED_TARGET,
    ]);
    expect(result.usersLeft[0].remainingRecruits).toBe(4);
  });

  it('bounds remaining recruits by what the recruiter has left today', async () => {
    setup({ recruiterTotal: 248 });
    const result = await getValidUsersForRecruitment(RECRUITER_ID);

    expect(result.recruiterRemaining).toBe(2);
    expect(result.usersLeft[0].remainingRecruits).toBe(2);
  });

  it('offers no targets once the recruiter is capped', async () => {
    setup({ recruiterTotal: 250 });
    const result = await getValidUsersForRecruitment(RECRUITER_ID);

    expect(result.recruiterCapReached).toBe(true);
    expect(result.usersLeft).toEqual([]);
    expect(mockPrisma.recruit_history.groupBy).not.toHaveBeenCalled();
  });
});

describe('auto-recruit next-link route', () => {
  it('returns a link the recruiter can still use', async () => {
    setup();
    const res = makeRes();
    await loadRoute()(
      { method: 'GET', session: { user: { id: RECRUITER_ID } } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect([`link-${OPEN_TARGET}`, `link-${CAPPED_TARGET}`]).toContain(
      res.json.mock.calls[0][0].recruit_link,
    );
  });

  it('returns a cap-reached refusal instead of another link', async () => {
    setup({ recruiterTotal: 250 });
    const res = makeRes();
    await loadRoute()(
      { method: 'GET', session: { user: { id: RECRUITER_ID } } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RECRUITER_DAILY_CAP_REACHED' }),
    );
  });

  it('requires a signed-in recruiter', async () => {
    setup();
    const res = makeRes();
    await loadRoute()({ method: 'GET' }, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
