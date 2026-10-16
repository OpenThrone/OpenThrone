import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

const { handleJoinRoom } = await import('@/lib/socket');

// Synthetic ids; no real players or rooms.
const USER_ID = 7;
const ROOM_ID = 42;

const makeSocket = () => {
  const socket: any = {
    id: 'socket-test',
    join: vi.fn(),
    emit: vi.fn(),
  };
  return socket;
};

describe('socket joinRoom membership (MSG-02)', () => {
  let socket: any;

  beforeEach(() => {
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrisma),
    );
    socket = makeSocket();
    mockPrisma.chatRoom = {
      findUnique: vi.fn().mockResolvedValue({ id: ROOM_ID, allianceId: null }),
    };
    mockPrisma.chatRoomParticipant = {
      findUnique: vi.fn().mockResolvedValue(null),
    };
    mockPrisma.alliance_memberships = {
      findUnique: vi.fn().mockResolvedValue(null),
    };
  });

  it('rejects a non-participant joining a non-alliance room', async () => {
    await handleJoinRoom(socket, USER_ID, ROOM_ID);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('joinRoomError', {
      roomId: ROOM_ID,
      error: 'You are not a participant in this chat room.',
    });
    expect(mockPrisma.chatRoomParticipant.findUnique).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: ROOM_ID, userId: USER_ID } },
      select: { id: true },
    });
  });

  it('lets a participant join a non-alliance room', async () => {
    mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ id: 1 });

    await handleJoinRoom(socket, USER_ID, ROOM_ID);

    expect(socket.join).toHaveBeenCalledWith(`room-${ROOM_ID}`);
    expect(socket.emit).toHaveBeenCalledWith('joinedRoom', { roomId: ROOM_ID });
  });

  it('rejects a participant of an alliance room who is not an alliance member', async () => {
    mockPrisma.chatRoom.findUnique.mockResolvedValue({
      id: ROOM_ID,
      allianceId: 3,
    });
    mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ id: 1 });

    await handleJoinRoom(socket, USER_ID, ROOM_ID);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      'joinRoomError',
      expect.objectContaining({ roomId: ROOM_ID }),
    );
  });

  it('rejects a join to a room that does not exist, without a membership lookup', async () => {
    mockPrisma.chatRoom.findUnique.mockResolvedValue(null);

    await handleJoinRoom(socket, USER_ID, ROOM_ID);

    expect(socket.join).not.toHaveBeenCalled();
    expect(mockPrisma.chatRoomParticipant.findUnique).not.toHaveBeenCalled();
  });
});
