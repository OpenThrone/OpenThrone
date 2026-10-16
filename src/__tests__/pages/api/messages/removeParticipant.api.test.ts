import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
silenceLogger();

const route =
  require('../../../../pages/api/messages/[chatRoomId]/participants/[participantId]').default;

type GlobalWithIo = typeof globalThis & { __OT_SOCKET_IO__?: unknown };

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
  const socketsLeave = vi.fn();
  const server = { in: vi.fn(() => ({ socketsLeave })) };

  beforeEach(() => {
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrisma),
    );
    mockPrisma.chatRoom = {
      findUnique: vi.fn().mockResolvedValue({ allianceId: null }),
    };
    socketsLeave.mockClear();
    server.in.mockClear();
    (globalThis as GlobalWithIo).__OT_SOCKET_IO__ = server;
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

  afterEach(() => {
    delete (globalThis as GlobalWithIo).__OT_SOCKET_IO__;
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
    expect(server.in).toHaveBeenCalledWith(`user-${MEMBER_ID}`);
    expect(socketsLeave).toHaveBeenCalledWith(`room-${ROOM_ID}`);
  });

  it('evicts nobody when the removal is refused', async () => {
    const res = await remove(MEMBER_ID);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(socketsLeave).not.toHaveBeenCalled();
  });
});
