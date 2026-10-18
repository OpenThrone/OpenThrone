import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

import * as guard from '@/middleware/apiGuard';
import * as cors from '@/middleware/cors';

installMockPrisma(vi);
silenceLogger();

const guardSpy = vi
  .spyOn(guard, 'withApiGuard')
  .mockImplementation(
    () => (handler: any) => async (req: any, res: any) => handler(req, res, {}),
  );
const corsSpy = vi
  .spyOn(cors, 'withCors')
  .mockImplementation((handler: any) => handler);

const checkDisplayName =
  require('@/pages/api/general/checkDisplayName').default;
const recruitLookup =
  require('@/pages/api/general/getUserInfoByRecruitLink').default;

const guardOptions = guardSpy.mock.calls.map((call) => call[0]);
guardSpy.mockRestore();
corsSpy.mockRestore();

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

beforeEach(() => {
  mockPrisma.users.count = vi.fn().mockResolvedValue(0);
  mockPrisma.users.findMany = vi
    .fn()
    .mockResolvedValue([{ display_name: 'SyntheticKnight' }]);
  mockPrisma.users.findFirst = vi.fn().mockResolvedValue(null);
});

describe('checkDisplayName enumeration hardening', () => {
  const call = async (body: unknown, signedIn = false) => {
    const res = makeRes();
    await checkDisplayName(
      {
        method: 'POST',
        body,
        session: signedIn ? { user: { id: 7 } } : undefined,
      },
      res,
    );
    return res;
  };

  it('stays rate-limited and allows optional auth', () => {
    expect(guardOptions[0]).toMatchObject({
      authMode: 'optional',
      rateLimitProfile: 'auth',
    });
  });

  it('gives anonymous callers only an exact-match boolean', async () => {
    mockPrisma.users.count.mockResolvedValue(1);

    const res = await call({ displayName: 'Knight' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ exists: true, available: false });
    expect(mockPrisma.users.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.users.count).toHaveBeenCalledWith({
      where: { display_name: { equals: 'Knight', mode: 'insensitive' } },
    });
  });

  it('reports an unused name as available', async () => {
    const res = await call({ displayName: 'k' });

    expect(res.json).toHaveBeenCalledWith({ exists: false, available: true });
  });

  it('refuses substring search without a session', async () => {
    const res = await call({ displayName: 'Knight', search: true });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.users.findMany).not.toHaveBeenCalled();
  });

  it('enforces a minimum length for signed-in substring search', async () => {
    const res = await call({ displayName: 'ab', search: true }, true);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.users.findMany).not.toHaveBeenCalled();
  });

  it('returns substring matches to signed-in callers', async () => {
    const res = await call({ displayName: 'Knight', search: true }, true);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      exists: false,
      possibleMatches: ['SyntheticKnight'],
    });
  });
});

describe('getUserInfoByRecruitLink minimal response', () => {
  const call = async (recruit_link: string) => {
    const res = makeRes();
    await recruitLookup({ method: 'GET', query: { recruit_link } }, res);
    return res;
  };

  it('stays rate-limited', () => {
    expect(guardOptions[1]).toMatchObject({
      authMode: 'none',
      rateLimitProfile: 'public_read',
    });
  });

  it('returns only the fields the recruit page renders', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 42,
      display_name: 'SyntheticKnight',
      race: 'ELF',
      class: 'FIGHTER',
      experience: 0,
    });

    const res = await call('0123456789abcdef0123456789abcdef');

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(Object.keys(body).sort()).toEqual([
      'class',
      'display_name',
      'level',
      'race',
    ]);
    expect(body.display_name).toBe('SyntheticKnight');
    const { select } = mockPrisma.users.findFirst.mock.calls[0][0];
    expect(select.avatar).toBeUndefined();
  });

  it('keeps existing md5 links working by matching recruit_link directly', async () => {
    await call('0123456789abcdef0123456789abcdef');

    expect(mockPrisma.users.findFirst.mock.calls[0][0].where).toEqual({
      recruit_link: '0123456789abcdef0123456789abcdef',
    });
  });
});
