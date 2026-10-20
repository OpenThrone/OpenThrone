import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
const { MessagingService } = await import('@/services/Messaging.service');
const { lockAllianceChatRooms } = await import('@/services/chatRoomGuards');
const { invalidateRuntimeConfigCache } =
  await import('@/services/RuntimeConfig.service');

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('room authorization concurrency', () => {
  beforeEach(() => {
    // Player messaging is switched on, so the send reaches the room checks.
    mockPrisma.serverSetting.findMany = vi
      .fn()
      .mockResolvedValue([{ key: 'ENABLE_MESSAGING', value: true }]);
    invalidateRuntimeConfigCache();
    mockPrisma.chatRoom = {
      findUnique: vi.fn().mockResolvedValue({ allianceId: null }),
      update: vi.fn().mockResolvedValue({}),
    };
    mockPrisma.chatMessage = {
      create: vi.fn().mockResolvedValue({
        id: 1,
        roomId: 42,
        senderId: 7,
        content: 'hello',
        messageType: 'TEXT',
        sender: { id: 7, display_name: 'Synthetic', avatar: null },
      }),
    };
  });

  for (const realtime of [false, true]) {
    it(`rechecks ${realtime ? 'realtime' : 'HTTP'} send after a concurrent removal commits`, async () => {
      let removed = false;
      let tail = Promise.resolve();
      const deletionStarted = deferred();
      const finishDeletion = deferred();
      const senderWaiting = deferred();
      let transactions = 0;
      mockPrisma.$transaction.mockImplementation(
        async (operation: (tx: unknown) => Promise<unknown>) => {
          const predecessor = tail;
          const release = deferred();
          tail = release.promise;
          transactions += 1;
          const order = transactions;
          const tx = {
            ...mockPrisma,
            $queryRaw: vi.fn(async () => {
              if (order === 2) senderWaiting.resolve();
              await predecessor;
              return [{ id: 42 }];
            }),
          };
          try {
            return await operation(tx);
          } finally {
            release.resolve();
          }
        },
      );
      mockPrisma.chatRoomParticipant = {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: { roomId_userId: { userId: number } };
          }) =>
            where.roomId_userId.userId === 5
              ? { role: 'ADMIN' }
              : removed
                ? null
                : {
                    role: 'MEMBER',
                    canWrite: true,
                    room: { allianceId: null },
                  },
        ),
        delete: vi.fn(async () => {
          deletionStarted.resolve();
          await finishDeletion.promise;
          removed = true;
          return {};
        }),
      };
      const removal = MessagingService.removeParticipant(5, 42, 7);
      await deletionStarted.promise;
      const send = realtime
        ? MessagingService.sendMessageRealtime(7, {
            roomId: 42,
            content: 'hello',
          })
        : MessagingService.sendMessage(7, 42, { content: 'hello' });
      const outcome = send.then(
        () => null,
        (error: Error) => error,
      );
      await senderWaiting.promise;
      expect(mockPrisma.chatMessage.create).not.toHaveBeenCalled();
      finishDeletion.resolve();
      await removal;
      const error = await outcome;
      expect(error?.message).toContain(realtime ? 'Cannot send' : 'Forbidden');
      expect(mockPrisma.chatMessage.create).not.toHaveBeenCalled();
    });
  }

  it('locks alliance rooms in deterministic order using the transaction client', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await lockAllianceChatRooms({ $queryRaw: query } as any, 12);
    const [sql, allianceId] = query.mock.calls[0];
    expect(sql.join('?')).toContain('ORDER BY id FOR UPDATE');
    expect(allianceId).toBe(12);
  });

  it('rejects stale alliance participants on the HTTP send path', async () => {
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrisma),
    );
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
    mockPrisma.chatRoom.findUnique.mockResolvedValue({ allianceId: 12 });
    mockPrisma.alliance_memberships = {
      findUnique: vi.fn().mockResolvedValue(null),
    };
    await expect(
      MessagingService.sendMessage(7, 42, { content: 'hello' }),
    ).rejects.toThrow('Not an alliance member');
    expect(mockPrisma.chatMessage.create).not.toHaveBeenCalled();
  });
});
