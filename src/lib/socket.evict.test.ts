import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

const { evictUserFromAllianceChatRooms, evictUserFromChatRoom } =
  await import('@/lib/socket');

type GlobalWithIo = typeof globalThis & { __OT_SOCKET_IO__?: unknown };

// Synthetic ids; no real players or rooms.
const USER_ID = 7;
const ROOM_ID = 42;

const makeServer = () => {
  const socketsLeave = vi.fn();
  const server = { in: vi.fn(() => ({ socketsLeave })) };
  return { server, socketsLeave };
};

describe('chat room eviction (MSG-03)', () => {
  let socketsLeave: ReturnType<typeof vi.fn>;
  let server: { in: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    ({ server, socketsLeave } = makeServer());
    (globalThis as GlobalWithIo).__OT_SOCKET_IO__ = server;
  });

  afterEach(() => {
    delete (globalThis as GlobalWithIo).__OT_SOCKET_IO__;
  });

  it("takes every socket of the removed user out of the room's channel", () => {
    evictUserFromChatRoom(USER_ID, ROOM_ID);

    expect(server.in).toHaveBeenCalledWith(`user-${USER_ID}`);
    expect(socketsLeave).toHaveBeenCalledWith(`room-${ROOM_ID}`);
  });

  it('is a no-op without a socket server', () => {
    delete (globalThis as GlobalWithIo).__OT_SOCKET_IO__;

    expect(() => evictUserFromChatRoom(USER_ID, ROOM_ID)).not.toThrow();
  });

  it("removes a former member from every one of the alliance's rooms", async () => {
    mockPrisma.chatRoom = {
      findMany: vi.fn(async () => [{ id: 3 }, { id: 4 }]),
    };

    await evictUserFromAllianceChatRooms(USER_ID, 99);

    expect(mockPrisma.chatRoom.findMany).toHaveBeenCalledWith({
      where: { allianceId: 99 },
      select: { id: true },
    });
    expect(socketsLeave).toHaveBeenCalledWith('room-3');
    expect(socketsLeave).toHaveBeenCalledWith('room-4');
  });
});
