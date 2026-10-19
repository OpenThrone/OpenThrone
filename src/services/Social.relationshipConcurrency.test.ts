import { expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
const { SocialService } = await import('@/services/Social.service');

it('serializes opposite-direction relationship requests before checking duplicates', async () => {
  let relationship: unknown = null;
  let releaseFirst!: () => void;
  let firstCreated!: () => void;
  const firstCreatedPromise = new Promise<void>((resolve) => {
    firstCreated = resolve;
  });
  const releasePromise = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let tail = Promise.resolve();
  const locks: number[][] = [];
  mockPrisma.$transaction.mockImplementation(
    async (operation: (tx: unknown) => Promise<unknown>) => {
      const previous = tail;
      let unlock!: () => void;
      tail = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const tx = {
        ...mockPrisma,
        $queryRaw: async (_sql: unknown, ...ids: number[]) => {
          locks.push(ids);
          await previous;
          return [];
        },
      };
      try {
        return await operation(tx);
      } finally {
        unlock();
      }
    },
  );
  mockPrisma.social = {
    findFirst: vi.fn(async () => relationship),
    create: vi.fn(async ({ data }: { data: unknown }) => {
      relationship = data;
      firstCreated();
      await releasePromise;
      return data;
    }),
  };
  mockPrisma.users.findUnique.mockResolvedValue({
    id: 12,
    display_name: 'Synthetic',
  });
  const first = SocialService.addRelationship(7, {
    friendId: 12,
    relationshipType: 'FRIEND',
  });
  await firstCreatedPromise;
  const opposite = SocialService.addRelationship(12, {
    friendId: 7,
    relationshipType: 'FRIEND',
  });
  const outcome = opposite.then(
    () => null,
    (error: Error) => error,
  );
  releaseFirst();
  await first;
  expect((await outcome)?.message).toContain('already pending');
  expect(mockPrisma.social.create).toHaveBeenCalledTimes(1);
  expect(locks).toEqual([
    [7, 12],
    [7, 12],
  ]);
});

it('does not accept a queued enemy request after the enemy feature is disabled', async () => {
  const { resetRuntimeConfigCache } =
    await import('@/services/RuntimeConfig.service');
  resetRuntimeConfigCache();
  mockPrisma.serverSetting.findMany.mockResolvedValue([
    { key: 'ENABLE_ENEMIES', value: false },
  ]);
  const request = {
    id: 9,
    friendId: 12,
    status: 'requested',
    relationshipType: 'ENEMY',
  };
  mockPrisma.social.updateMany = vi.fn(async ({ where, data }) => {
    if (
      where.relationshipType &&
      where.relationshipType !== request.relationshipType
    )
      return { count: 0 };
    Object.assign(request, data);
    return { count: 1 };
  });
  await expect(
    SocialService.respondToRequest(12, { requestId: 9, action: 'accept' }),
  ).rejects.toThrow('Relationship request not found or already processed');
  expect(request.status).toBe('requested');
  await SocialService.respondToRequest(12, { requestId: 9, action: 'decline' });
  expect(request.status).toBe('declined');
});
