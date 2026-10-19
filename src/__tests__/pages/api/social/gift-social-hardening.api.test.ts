import { afterAll, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

import * as guard from '@/middleware/apiGuard';
import * as auth from '@/middleware/auth';
import * as idempotency from '@/middleware/idempotency';
import * as rateLimit from '@/middleware/rateLimit';
import * as runtimeConfig from '@/services/RuntimeConfig.service';
import { SocialService } from '@/services/Social.service';

installMockPrisma(vi);
silenceLogger();

// Synthetic player IDs.
const SENDER_ID = 7;
const FRIEND_ID = 9;

// Capture route wiring while the routes load, then pass straight through.
const guardSpy = vi
  .spyOn(guard, 'withApiGuard')
  .mockImplementation(
    (options: any) => (handler: any) => async (req: any, res: any) =>
      handler(req, res, { query: { friendId: Number(req.query.friendId) } }),
  );
const authSpy = vi
  .spyOn(auth, 'withAuth')
  .mockImplementation((handler: any) => handler);
const limiterSpy = vi
  .spyOn(rateLimit, 'highRiskLimiter')
  .mockResolvedValue(true);
const idempotencySpy = vi
  .spyOn(idempotency, 'enforceIdempotency')
  .mockResolvedValue(true);

const transferRoute =
  require('@/pages/api/social/friends/[friendId]/transfer').default;
const goldRequestRoute = require('@/pages/api/social/gold-requests').default;

const loadSocialWrite = (load: () => unknown) => {
  const before = authSpy.mock.calls.length;
  load();
  return authSpy.mock.calls.slice(before).at(-1)?.[1];
};
const socialWriteOptions = {
  add: loadSocialWrite(() => require('@/pages/api/social/add')),
  respond: loadSocialWrite(() => require('@/pages/api/social/respond')),
  remove: loadSocialWrite(() => require('@/pages/api/social/remove')),
  end: loadSocialWrite(() => require('@/pages/api/social/end')),
};
guardSpy.mockRestore();
authSpy.mockRestore();

afterAll(() => {
  limiterSpy.mockRestore();
  idempotencySpy.mockRestore();
});

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

const session = { user: { id: SENDER_ID } };

describe('friend gift route input (GIFT-01, GIFT-04)', () => {
  let transferSpy: any;

  beforeEach(() => {
    transferSpy?.mockRestore();
    transferSpy = vi
      .spyOn(SocialService, 'transferGoldToFriend')
      .mockResolvedValue({ success: true, transferId: 1, amount: '10' });
  });

  afterAll(() => transferSpy?.mockRestore());

  const send = async (body: unknown) => {
    const res = makeRes();
    await transferRoute(
      {
        method: 'POST',
        query: { friendId: String(FRIEND_ID) },
        body,
        session,
        headers: {},
      },
      res,
    );
    return res;
  };

  it.each([
    ['letters', 'abc'],
    ['a fraction', '1.5'],
    ['an exponent', '1e6'],
    ['a negative number', '-5'],
    ['zero', '0'],
    ['an unsafe integer', '9007199254740993'],
    ['an object', { n: 1 }],
    ['nothing', undefined],
  ])('answers 400 for %s instead of throwing', async (_label, amount) => {
    const res = await send({ amount });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(transferSpy).not.toHaveBeenCalled();
  });

  it('answers 400 for a note over 200 characters', async () => {
    const res = await send({ amount: '10', notes: 'x'.repeat(201) });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(transferSpy).not.toHaveBeenCalled();
  });

  it('passes a valid amount and note through as bigint', async () => {
    const res = await send({ amount: '10', notes: 'x'.repeat(200) });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(transferSpy).toHaveBeenCalledWith(
      SENDER_ID,
      FRIEND_ID,
      10n,
      'x'.repeat(200),
    );
  });
});

describe('gold request route input (GIFT-01, GIFT-04)', () => {
  let createSpy: any;

  beforeEach(() => {
    createSpy?.mockRestore();
    createSpy = vi
      .spyOn(SocialService, 'createGoldRequest')
      .mockResolvedValue({ message: 'ok', requestId: 1, amount: '10' });
  });

  afterAll(() => createSpy?.mockRestore());

  const send = async (body: unknown) => {
    const res = makeRes();
    await goldRequestRoute({ method: 'POST', body, session, headers: {} }, res);
    return res;
  };

  it('answers 400 for a non-numeric amount', async () => {
    const res = await send({ friendId: FRIEND_ID, amount: 'lots' });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('answers 400 for a note over 200 characters', async () => {
    const res = await send({
      friendId: FRIEND_ID,
      amount: '10',
      notes: 'x'.repeat(201),
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('answers 400 for a non-integer friend id', async () => {
    const res = await send({ friendId: '9', amount: '10' });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('friend and enemy requests (SOC-03)', () => {
  it('rate-limits every social relationship write with game_write', () => {
    expect(socialWriteOptions).toEqual({
      add: { rateLimitProfile: 'game_write' },
      respond: { rateLimitProfile: 'game_write' },
      remove: { rateLimitProfile: 'game_write' },
      end: { rateLimitProfile: 'game_write' },
    });
  });

  describe('SocialService.addRelationship', () => {
    let runtimeSpy: any;

    beforeEach(() => {
      runtimeSpy?.mockRestore();
      mockPrisma.$transaction = vi.fn(async (cb: any) => cb(mockPrisma));
      mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
      mockPrisma.social.findFirst = vi.fn().mockResolvedValue(null);
      mockPrisma.social.create = vi.fn(async ({ data }: any) => ({
        id: 1,
        ...data,
      }));
      mockPrisma.users.findUnique = vi
        .fn()
        .mockResolvedValue({ id: FRIEND_ID, display_name: 'Synthetic' });
    });

    afterAll(() => runtimeSpy?.mockRestore());

    const setEnemies = (enableEnemies: boolean) => {
      runtimeSpy = vi
        .spyOn(runtimeConfig, 'getRuntimeConfig')
        .mockResolvedValue({ enableEnemies } as any);
    };

    it('rejects an enemy request while enemies are disabled', async () => {
      setEnemies(false);

      await expect(
        SocialService.addRelationship(SENDER_ID, {
          friendId: FRIEND_ID,
          relationshipType: 'ENEMY',
        }),
      ).rejects.toThrow('Enemy relationships are currently disabled.');
      expect(mockPrisma.social.create).not.toHaveBeenCalled();
    });

    it('still allows friend requests while enemies are disabled', async () => {
      setEnemies(false);

      const result = await SocialService.addRelationship(SENDER_ID, {
        friendId: FRIEND_ID,
        relationshipType: 'FRIEND',
      });

      expect(result.relationshipType).toBe('FRIEND');
      expect(mockPrisma.social.create).toHaveBeenCalled();
    });

    it('allows enemy requests while enemies are enabled', async () => {
      setEnemies(true);

      const result = await SocialService.addRelationship(SENDER_ID, {
        friendId: FRIEND_ID,
        relationshipType: 'ENEMY',
      });

      expect(result.relationshipType).toBe('ENEMY');
    });
  });
});
