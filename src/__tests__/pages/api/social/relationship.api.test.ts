import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));
silenceLogger();

// Synthetic player IDs.
const CALLER_ID = 7;
const OTHER_A = 9;
const OTHER_B = 11;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const route = require('../../../../pages/api/social/relationship').default;

const call = async (query: Record<string, string>, withSession = true) => {
  const res = makeRes();
  await route(
    {
      method: 'GET',
      query,
      session: withSession ? { user: { id: CALLER_ID } } : undefined,
    },
    res,
  );
  return res;
};

beforeEach(() => {
  resetMockPrisma();
  mockPrisma.social.findFirst = vi.fn(async () => null);
});

describe('social relationship (SOC-02)', () => {
  it('requires a session', async () => {
    const res = await call({ targetUserId: String(OTHER_A) }, false);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.social.findFirst).not.toHaveBeenCalled();
  });

  it('refuses to read a relationship between two other players', async () => {
    const res = await call({
      userId: String(OTHER_A),
      targetUserId: String(OTHER_B),
    });

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.social.findFirst).not.toHaveBeenCalled();
  });

  it('uses the session user as the subject', async () => {
    const res = await call({ targetUserId: String(OTHER_A) });

    expect(res.status).toHaveBeenCalledWith(200);
    const { where } = mockPrisma.social.findFirst.mock.calls[0][0];
    expect(where.OR).toEqual([
      { playerId: CALLER_ID, friendId: OTHER_A },
      { playerId: OTHER_A, friendId: CALLER_ID },
    ]);
  });

  it('still accepts a userId that matches the session', async () => {
    const res = await call({
      userId: String(CALLER_ID),
      targetUserId: String(OTHER_A),
    });

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects unknown query fields', async () => {
    const res = await call({
      targetUserId: String(OTHER_A),
      playerId: String(OTHER_B),
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.social.findFirst).not.toHaveBeenCalled();
  });
});
