import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
// Dynamic imports deliberately install the Prisma test boundary before service evaluation.
const { SocialService } = await import('@/services/Social.service');
const { invalidateRuntimeConfigCache } =
  await import('@/services/RuntimeConfig.service');

const ME = 10;
const THEM = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

type Row = Record<string, unknown>;
const row = (id: number, playerId: number, fields: Row): Row => ({
  id,
  playerId,
  friendId: playerId === ME ? THEM : ME,
  relationshipType: 'FRIEND',
  acceptanceDate: null,
  endDate: null,
  ...fields,
});

const request = () =>
  SocialService.addRelationship(ME, {
    friendId: THEM,
    relationshipType: 'FRIEND',
  });

let history: Row[];
let sentToday: number;

beforeEach(() => {
  history = [];
  sentToday = 0;
  invalidateRuntimeConfigCache();
  mockPrisma.serverSetting.findMany = vi.fn(async () => []);
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(
    async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
      callback(mockPrisma),
  );
  mockPrisma.users.findUnique = vi.fn(async () => ({
    id: THEM,
    display_name: 'Synthetic',
  }));
  mockPrisma.social = {
    findMany: vi.fn(async () => history),
    count: vi.fn(async () => sentToday),
    create: vi.fn(async ({ data }: { data: Row }) => data),
    updateMany: vi.fn(async () => ({ count: 1 })),
  } as any;
});

describe('sending a request', () => {
  it('lets a pair try again once the cooldown has passed', async () => {
    history = [row(1, ME, { status: 'declined', endDate: daysAgo(8) })];
    await request();
    expect(mockPrisma.social.create).toHaveBeenCalled();
  });

  it('refuses inside the cooldown', async () => {
    history = [row(1, ME, { status: 'declined', endDate: daysAgo(2) })];
    await expect(request()).rejects.toThrow('request again after');
    expect(mockPrisma.social.create).not.toHaveBeenCalled();
  });

  it('refuses after the decline limit', async () => {
    history = [3, 2, 1].map((id) =>
      row(id, ME, { status: 'declined', endDate: daysAgo(30 * id) }),
    );
    await expect(request()).rejects.toThrow('Only they can reach out');
  });

  it('still refuses while an older row sits behind a pending one', async () => {
    history = [
      row(2, THEM, { status: 'requested' }),
      row(1, ME, { status: 'declined', endDate: daysAgo(30) }),
    ];
    await expect(request()).rejects.toThrow('already pending');
  });

  it('refuses a duplicate of an accepted friendship', async () => {
    history = [row(1, ME, { status: 'accepted', acceptanceDate: daysAgo(1) })];
    await expect(request()).rejects.toThrow('already have an active');
  });

  it('refuses past the daily cap, counting the sender only', async () => {
    sentToday = 20;
    await expect(request()).rejects.toThrow('too many requests');
    const { where } = mockPrisma.social.count.mock.calls[0][0];
    expect(where.playerId).toBe(ME);
    expect(where.status).toBeUndefined();
  });

  it('reads the limits from runtime settings', async () => {
    mockPrisma.serverSetting.findMany = vi.fn(async () => [
      { key: 'friend.requestCooldownDays', value: 0 },
    ]);
    invalidateRuntimeConfigCache();
    history = [row(1, ME, { status: 'declined', endDate: daysAgo(1) })];
    await request();
    expect(mockPrisma.social.create).toHaveBeenCalled();
  });
});

describe('cancelling a request', () => {
  it('keeps a record instead of deleting it', async () => {
    await SocialService.removeRelationship(ME, {
      friendId: THEM,
      relationshipType: 'FRIEND',
    });
    const { where, data } = mockPrisma.social.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ playerId: ME, status: 'requested' });
    expect(data.status).toBe('cancelled');
    expect(data.endDate).toBeInstanceOf(Date);
  });
});

describe('getRelationship', () => {
  const read = () =>
    SocialService.getRelationship(ME, { userId: ME, targetUserId: THEM });

  it('offers add when nothing stands in the way', async () => {
    expect(await read()).toMatchObject({
      relationship: null,
      availableActions: ['add'],
      requestBlock: null,
    });
  });

  it('reports an active friendship over older ended rows', async () => {
    const friends = row(2, ME, {
      status: 'accepted',
      acceptanceDate: daysAgo(1),
    });
    history = [friends, row(1, ME, { status: 'ended', endDate: daysAgo(30) })];
    const result = await read();
    expect(result.relationship).toEqual(friends);
    expect(result.availableActions).toEqual(['remove']);
  });

  it('offers no action while the sender is held back', async () => {
    history = [row(1, ME, { status: 'declined', endDate: daysAgo(2) })];
    const result = await read();
    expect(result.availableActions).toEqual([]);
    expect(result.canInteract).toBe(false);
    expect(result.requestBlock?.reason).toBe('cooldown');
  });

  it('offers add again once the cooldown has passed', async () => {
    history = [row(1, ME, { status: 'declined', endDate: daysAgo(8) })];
    expect((await read()).availableActions).toEqual(['add']);
  });

  it('shows pending requests from each side', async () => {
    history = [row(1, ME, { status: 'requested' })];
    expect((await read()).availableActions).toEqual(['cancel']);
    history = [row(1, THEM, { status: 'requested' })];
    expect((await read()).availableActions).toEqual(['accept', 'decline']);
  });
});
