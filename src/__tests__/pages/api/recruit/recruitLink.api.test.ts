import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
vi.mock('@/services/RecruitmentCaptcha.service', () => ({
  verifyRecruitmentCaptcha: vi.fn(
    async (token: unknown) => token !== 'invalid',
  ),
  isRecruitmentCaptchaRequired: () => true,
}));
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));

const handler = require('../../../../pages/api/recruit/[id]').default;

// Synthetic accounts; none correspond to real players.
const RECRUITER_ID = 42;
const LINK_OWNER_ID = 7;
const LINK = 'synthetic-recruit-link';
const session = { user: { id: RECRUITER_ID } };

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

type Counts = { recruiter?: number; target?: number; pair?: number };

/** Answers recruit_history.count by the shape of the where clause. */
const setCounts = ({ recruiter = 0, target = 0, pair = 0 }: Counts) => {
  mockPrisma.recruit_history.count.mockImplementation(
    async ({ where }: any) => {
      if (where.from_user?.not === 0 && where.to_user === RECRUITER_ID) {
        return recruiter;
      }
      if (where.from_user === LINK_OWNER_ID && where.to_user === undefined) {
        return target;
      }
      if (where.from_user === LINK_OWNER_ID && where.to_user === RECRUITER_ID) {
        return pair;
      }
      return 0;
    },
  );
};

const get = async (reqSession?: unknown) => {
  const res = makeRes();
  await handler(
    { method: 'GET', query: { id: LINK }, session: reqSession },
    res,
  );
  return res;
};

beforeEach(() => {
  resetMockPrisma();
  mockPrisma.users.findUnique.mockReset();
  mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) =>
    where.recruit_link === LINK ? { id: LINK_OWNER_ID } : null,
  );
  mockPrisma.recruit_history = {
    count: vi.fn(async () => 0),
    create: vi.fn(),
  };
  mockPrisma.$transaction.mockReset();
});

describe('recruit link route', () => {
  it('has no POST: it cannot be used to claim gold', async () => {
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        query: { id: LINK },
        body: { self_recruit: true },
        session,
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(405);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.recruit_history.create).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('tells anonymous visitors to sign in instead of showing the captcha', async () => {
    const res = await get();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      eligible: false,
      showCaptcha: false,
      code: 'LOGIN_REQUIRED',
    });
  });

  it('rejects the owner of the link', async () => {
    const res = await get({ user: { id: LINK_OWNER_ID } });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SELF_RECRUIT_REJECTED' }),
    );
  });

  it('rejects an unknown link', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { id: 'nope' }, session }, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('shows the captcha below every limit', async () => {
    setCounts({ recruiter: 249, target: 24, pair: 4 });
    const res = await get(session);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      eligible: true,
      showCaptcha: true,
    });
  });

  it('counts the pair limit as link owner -> recruiter, like the reward path', async () => {
    setCounts({ pair: 5 });
    const res = await get(session);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PAIR_LIMIT_REACHED' }),
    );
  });

  it('refuses before the captcha when the recruiter is at the daily cap', async () => {
    setCounts({ recruiter: 250 });
    const res = await get(session);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'You have reached the daily recruitment limit.',
      code: 'RECRUITER_DAILY_CAP_REACHED',
    });
  });

  it('does not apply an external owner cap to internal recruits', async () => {
    setCounts({ target: 25 });
    const res = await get(session);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      eligible: true,
      showCaptcha: true,
    });
  });
});
