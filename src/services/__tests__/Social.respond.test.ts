import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
// Dynamic imports deliberately install the Prisma test boundary before service loading.
const { NO_ACTIVE_RELATIONSHIP_ERROR, SocialService } =
  await import('@/services/Social.service');
const { invalidateRuntimeConfigCache } =
  await import('@/services/RuntimeConfig.service');

const RECIPIENT = 20;
const REQUESTER = 10;

describe('friend request responses', () => {
  let updateMany: ReturnType<typeof vi.fn>;
  let matches: number;

  const setEnemies = (enabled: boolean) => {
    mockPrisma.serverSetting.findMany = vi.fn(async () => [
      { key: 'ENABLE_ENEMIES', value: enabled },
    ]);
    invalidateRuntimeConfigCache();
  };

  beforeEach(() => {
    matches = 1;
    updateMany = vi.fn(async () => ({ count: matches }));
    mockPrisma.social = { updateMany };
    setEnemies(true);
  });

  it('accepting marks only a pending request addressed to the responder', async () => {
    const result = await SocialService.respondToRequest(RECIPIENT, {
      requestId: 5,
      action: 'accept',
    });
    expect(result).toMatchObject({ action: 'accept', requestId: 5 });
    const args = updateMany.mock.calls[0][0];
    expect(args.where).toEqual({
      id: 5,
      friendId: RECIPIENT,
      status: 'requested',
    });
    expect(args.data.status).toBe('accepted');
    expect(args.data.acceptanceDate).toBeInstanceOf(Date);
    expect(args.data.endDate).toBeNull();
  });

  it('declining records the end date instead of an acceptance date', async () => {
    const result = await SocialService.respondToRequest(RECIPIENT, {
      requestId: 5,
      action: 'decline',
    });
    expect(result.action).toBe('decline');
    const args = updateMany.mock.calls[0][0];
    expect(args.where.status).toBe('requested');
    expect(args.data.status).toBe('declined');
    expect(args.data.acceptanceDate).toBeNull();
    expect(args.data.endDate).toBeInstanceOf(Date);
  });

  it("refuses a request that is missing, already handled or not the responder's", async () => {
    matches = 0;
    await expect(
      SocialService.respondToRequest(RECIPIENT, {
        requestId: 5,
        action: 'accept',
      }),
    ).rejects.toThrow('not found or already processed');
    await expect(
      SocialService.respondToRequest(RECIPIENT, {
        requestId: 5,
        action: 'decline',
      }),
    ).rejects.toThrow('not found or already processed');
  });

  it('only accepts friend requests, not enemy ones, while enemies are disabled', async () => {
    setEnemies(false);
    await SocialService.respondToRequest(RECIPIENT, {
      requestId: 5,
      action: 'accept',
    });
    expect(updateMany.mock.calls[0][0].where.relationshipType).toBe('FRIEND');
  });

  it('can still decline an enemy request while enemies are disabled', async () => {
    setEnemies(false);
    await SocialService.respondToRequest(RECIPIENT, {
      requestId: 5,
      action: 'decline',
    });
    expect(updateMany.mock.calls[0][0].where).not.toHaveProperty(
      'relationshipType',
    );
  });

  it('rejects an unknown action before touching the database', async () => {
    await expect(
      SocialService.respondToRequest(RECIPIENT, {
        requestId: 5,
        action: 'ignore' as 'accept',
      }),
    ).rejects.toThrow();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('ending a friendship', () => {
  it('ends accepted friendships in either direction and nothing else', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    mockPrisma.social = { updateMany };
    const result = await SocialService.endRelationship(RECIPIENT, {
      friendId: REQUESTER,
    });
    expect(result).toEqual({ message: 'Friendship ended successfully' });
    const args = updateMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { playerId: RECIPIENT, friendId: REQUESTER, status: 'accepted' },
      { playerId: REQUESTER, friendId: RECIPIENT, status: 'accepted' },
    ]);
    expect(args.data.status).toBe('ended');
    expect(args.data.endDate).toBeInstanceOf(Date);
  });

  it('refuses when there is no accepted friendship to end', async () => {
    mockPrisma.social = { updateMany: vi.fn(async () => ({ count: 0 })) };
    await expect(
      SocialService.endRelationship(RECIPIENT, { friendId: REQUESTER }),
    ).rejects.toThrow(NO_ACTIVE_RELATIONSHIP_ERROR);
  });
});
