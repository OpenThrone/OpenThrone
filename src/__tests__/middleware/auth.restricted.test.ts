import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { installRateLimitStore } from 'test/utils/rateLimitStore';
import {
  installSessionSpy,
  sessionRequestFields,
} from 'test/utils/sessionCookie';

installMockPrisma(vi);
installSessionSpy(vi);
const { withAuth } = require('../../middleware/auth');
const { authOptions } = require('../../pages/api/auth/[...nextauth]');

const makeRes = () => {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    getHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

beforeEach(() => {
  resetMockPrisma();
  process.env.NEXTAUTH_URL = 'http://localhost:3000';
  delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
  mockPrisma.users.findUnique = vi.fn(async () => ({
    email: 'guard@example.com',
  }));
  mockPrisma.accountStatusHistory = { findFirst: vi.fn(async () => null) };
  installRateLimitStore(mockPrisma, vi);
});

async function request(status: string, options: unknown = false) {
  mockPrisma.accountStatusHistory.findFirst.mockResolvedValue({
    status,
    end_date: null,
  });
  const inner = vi.fn();
  const res = makeRes();
  const fields = await sessionRequestFields(authOptions, {
    id: 7,
    email: 'guard@example.com',
  });
  await withAuth(inner, options)(
    { method: 'POST', headers: {}, ...fields },
    res,
  );
  return { inner, res };
}

describe('legacy auth account restrictions', () => {
  it.each(['BANNED', 'SUSPENDED', 'VACATION', 'CLOSED'])(
    'blocks %s sessions on ordinary routes',
    async (status) => {
      const { inner, res } = await request(status);
      expect(inner).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    },
  );
  it('does not let the anonymous override bypass a signed-in ban', async () => {
    const { inner } = await request('BANNED', true);
    expect(inner).not.toHaveBeenCalled();
  });
  it('allows the explicit vacation endpoint to receive vacation sessions', async () => {
    const { inner } = await request('VACATION', { allowVacation: true });
    expect(inner).toHaveBeenCalledTimes(1);
  });
  it.each(['BANNED', 'SUSPENDED', 'CLOSED'])(
    'never permits %s through the vacation exception',
    async (status) => {
      const { inner } = await request(status, { allowVacation: true });
      expect(inner).not.toHaveBeenCalled();
    },
  );
  it('shares the game-write budget across paths, query strings and networks', async () => {
    const inner = vi.fn();
    const guarded = withAuth(inner, { rateLimitProfile: 'game_write' });
    const fields = await sessionRequestFields(authOptions, {
      id: 7,
      email: 'guard@example.com',
    });
    for (let i = 0; i < 31; i += 1) {
      const res = makeRes();
      await guarded(
        {
          method: 'POST',
          url: `/api/armory/${i}?bypass=${i}`,
          headers: {},
          socket: { remoteAddress: `192.0.2.${i + 1}` },
          ...fields,
        },
        res,
      );
      if (i === 30) expect(res.status).toHaveBeenCalledWith(429);
    }
    expect(inner).toHaveBeenCalledTimes(30);
  });
});
