import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { MessagingService } = await import('@/services/Messaging.service');

beforeEach(() => {
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(async (operation: unknown) =>
    typeof operation === 'function'
      ? operation(mockPrisma)
      : Promise.all(operation as Promise<unknown>[]),
  );
  mockPrisma.chatRoom = {
    findUnique: vi.fn().mockResolvedValue({ allianceId: null }),
  };
});

describe('message unread receipts', () => {
  beforeEach(() => {
    mockPrisma.chatRoomParticipant = {
      findUnique: vi.fn().mockResolvedValue({ userId: 7 }),
    };
    mockPrisma.chatMessage = { count: vi.fn().mockResolvedValue(1) };
  });
  it('counts messages lacking this user receipt, independently of room timestamps', async () => {
    expect(await MessagingService.getUnreadMessageCount(7, 42)).toEqual({
      unreadCount: 1,
    });
    expect(mockPrisma.chatMessage.count).toHaveBeenCalledWith({
      where: {
        roomId: 42,
        senderId: { not: 7 },
        readBy: { none: { userId: 7 } },
      },
    });
  });
  it('never counts a room for a nonparticipant', async () => {
    mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue(null);
    await expect(MessagingService.getUnreadMessageCount(7, 42)).rejects.toThrow(
      'Forbidden',
    );
    expect(mockPrisma.chatMessage.count).not.toHaveBeenCalled();
  });
});

describe('adding participants to a room (MSG-01)', () => {
  const ROOM_ID = 42;
  const CALLER_ID = 7;
  const roomWithCaller = (role: 'ADMIN' | 'MEMBER' | null) => ({
    id: ROOM_ID,
    isPrivate: false,
    participants: role ? [{ role }] : [],
  });

  beforeEach(() => {
    mockPrisma.chatRoom = {
      findUnique: vi.fn().mockResolvedValue(roomWithCaller('ADMIN')),
      update: vi.fn().mockResolvedValue({}),
    };
    mockPrisma.chatRoomParticipant = {
      ...mockPrisma.chatRoomParticipant,
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue(null);
  });

  it('rejects a non-member adding themselves to a public room', async () => {
    mockPrisma.chatRoom.findUnique.mockResolvedValue(roomWithCaller(null));

    await expect(
      MessagingService.addParticipants(CALLER_ID, ROOM_ID, {
        userIds: [CALLER_ID],
      }),
    ).rejects.toThrow('Forbidden');
    expect(mockPrisma.chatRoomParticipant.createMany).not.toHaveBeenCalled();
  });

  it('rejects an ordinary member adding anyone', async () => {
    mockPrisma.chatRoom.findUnique.mockResolvedValue(roomWithCaller('MEMBER'));

    await expect(
      MessagingService.addParticipants(CALLER_ID, ROOM_ID, { userIds: [9] }),
    ).rejects.toThrow('Forbidden');
    expect(mockPrisma.chatRoomParticipant.createMany).not.toHaveBeenCalled();
  });

  it('lets a room admin add participants', async () => {
    const result = await MessagingService.addParticipants(CALLER_ID, ROOM_ID, {
      userIds: [9],
    });

    expect(result.count).toBe(1);
    expect(mockPrisma.chatRoomParticipant.createMany).toHaveBeenCalledTimes(1);
  });

  it('lets a site admin add participants without a room role', async () => {
    mockPrisma.chatRoom.findUnique.mockResolvedValue(roomWithCaller(null));
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue({ id: 1 });

    await MessagingService.addParticipants(CALLER_ID, ROOM_ID, {
      userIds: [9],
    });
    expect(mockPrisma.chatRoomParticipant.createMany).toHaveBeenCalledTimes(1);
  });

  it('caps the number of users in one request', async () => {
    const userIds = Array.from({ length: 51 }, (_, i) => i + 100);

    await expect(
      MessagingService.addParticipants(CALLER_ID, ROOM_ID, { userIds }),
    ).rejects.toThrow();
    expect(mockPrisma.chatRoomParticipant.createMany).not.toHaveBeenCalled();
  });
});

describe('sharing an attack log in chat (ATTACK_LOG_SHARE)', () => {
  // Synthetic IDs only.
  const ROOM_ID = 42;
  const LOG_ID = 100;
  const ATTACKER_ID = 1;
  const DEFENDER_ID = 2;
  const RECIPIENT_ID = 3;
  const OTHER_MEMBER_ID = 4;
  const OUTSIDER_ID = 7;

  const setLogAcl = (acl: any[]) => {
    mockPrisma.attack_log = {
      ...mockPrisma.attack_log,
      findUnique: vi.fn().mockResolvedValue({
        id: LOG_ID,
        attacker_id: ATTACKER_ID,
        defender_id: DEFENDER_ID,
        acl,
      }),
    };
  };

  const share = (userId: number) =>
    MessagingService.sendMessageRealtime(userId, {
      roomId: ROOM_ID,
      content: 'see this',
      messageType: 'ATTACK_LOG_SHARE',
      sharedAttackLogId: LOG_ID,
    });

  beforeEach(() => {
    mockPrisma.chatRoomParticipant = {
      findUnique: vi.fn().mockResolvedValue({
        canWrite: true,
        room: { allianceId: null },
      }),
    };
    mockPrisma.chatRoom = {
      findUnique: vi.fn().mockResolvedValue({
        allianceId: null,
        participants: [
          { userId: RECIPIENT_ID },
          { userId: OTHER_MEMBER_ID },
          { userId: OUTSIDER_ID },
        ],
      }),
      update: vi.fn().mockResolvedValue({}),
    };
    mockPrisma.chatMessage = {
      create: vi.fn(async ({ data }: any) => ({ id: 1, ...data })),
    };
    mockPrisma.attack_log_acl = {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
    };
    mockPrisma.alliance_memberships = {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    };
  });

  it('lets a share recipient re-share and grants the other room members', async () => {
    setLogAcl([
      { shared_with_user_id: RECIPIENT_ID, shared_with_alliance_id: null },
    ]);

    await share(RECIPIENT_ID);

    expect(mockPrisma.chatMessage.create).toHaveBeenCalled();
    expect(mockPrisma.attack_log_acl.createMany).toHaveBeenCalledWith({
      data: [
        { attack_log_id: LOG_ID, shared_with_user_id: OTHER_MEMBER_ID },
        { attack_log_id: LOG_ID, shared_with_user_id: OUTSIDER_ID },
      ],
    });
  });

  it('rejects a sender who cannot read the log', async () => {
    setLogAcl([]);

    await expect(share(OUTSIDER_ID)).rejects.toThrow('No permission');
    expect(mockPrisma.chatMessage.create).not.toHaveBeenCalled();
    expect(mockPrisma.attack_log_acl.createMany).not.toHaveBeenCalled();
  });
});

describe('message receipt and reply scope', () => {
  beforeEach(() => {
    mockPrisma.chatMessage = {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    };
    mockPrisma.chatMessageReadStatus = {
      upsert: vi.fn().mockResolvedValue({}),
    };
    mockPrisma.chatRoomParticipant = {
      findUnique: vi.fn().mockResolvedValue({ canWrite: true }),
    };
  });

  it('rejects receipts for inaccessible messages before writing', async () => {
    await expect(
      MessagingService.markMessagesAsRead(7, { messageIds: [99] }),
    ).rejects.toThrow('Forbidden');
    expect(mockPrisma.chatMessageReadStatus.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [99] },
        room: { participants: { some: { userId: 7 } } },
      },
      select: { id: true },
    });
  });

  it('binds socket receipts to the authorized room and deduplicates IDs', async () => {
    mockPrisma.chatMessage.findMany.mockResolvedValue([{ id: 99 }]);
    await MessagingService.markMessagesAsRead(7, { messageIds: [99, 99] }, 42);
    expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [99] },
        roomId: 42,
        room: { participants: { some: { userId: 7 } } },
      },
      select: { id: true },
    });
    expect(mockPrisma.chatMessageReadStatus.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects an HTTP reply pointing outside the destination room', async () => {
    await expect(
      MessagingService.sendMessage(7, 42, {
        content: 'reply',
        replyToMessageId: 99,
      }),
    ).rejects.toThrow('Cannot reply');
    expect(mockPrisma.chatMessage.findFirst).toHaveBeenCalledWith({
      where: { id: 99, roomId: 42 },
      select: { id: true },
    });
    expect(mockPrisma.chatMessage.create).not.toHaveBeenCalled();
  });
});
