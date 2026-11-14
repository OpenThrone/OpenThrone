import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
vi.mock('@/lib/realtime', () => ({
  emitToAll: vi.fn(),
  emitToRoom: vi.fn(),
  emitToUser: vi.fn(),
  emitToUsers: vi.fn(),
  evictUserFromChatRoom: vi.fn(async () => {}),
  evictUserFromAllianceChatRooms: vi.fn(async () => {}),
  isRealtimeEnabled: () => true,
}));
silenceLogger();

const route =
  require('../../../../pages/api/messages/[chatRoomId]/participants/[participantId]').default;
const { evictUserFromChatRoom } = require('@/lib/realtime');

// Synthetic ids; no real players or rooms.
const ADMIN_ID = 5;
const MEMBER_ID = 6;
const ROOM_ID = 42;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

describe('DELETE chat participant (MSG-03)', () => {
  beforeEach(() => {
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrisma),
    );
    mockPrisma.chatRoom = {
      findUnique: vi.fn().mockResolvedValue({ allianceId: null }),
    };
    evictUserFromChatRoom.mockClear();
    mockPrisma.chatRoomParticipant = {
      findUnique: vi.fn(async ({ where }: any) =>
        where.roomId_userId.userId === ADMIN_ID
          ? { role: 'ADMIN' }
          : { role: 'MEMBER' },
      ),
      count: vi.fn(async () => 1),
      delete: vi.fn(async () => ({})),
    };
  });

  const remove = async (callerId: number) => {
    const res = makeRes();
    await route(
      {
        method: 'DELETE',
        query: {
          chatRoomId: String(ROOM_ID),
          participantId: String(MEMBER_ID),
        },
        session: { user: { id: callerId } },
      },
      res,
    );
    return res;
  };

  it("removes the member's live sockets from the room channel", async () => {
    const res = await remove(ADMIN_ID);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(evictUserFromChatRoom).toHaveBeenCalledWith(MEMBER_ID, ROOM_ID);
  });

  it('evicts nobody when the removal is refused', async () => {
    const res = await remove(MEMBER_ID);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(evictUserFromChatRoom).not.toHaveBeenCalled();
  });
});
