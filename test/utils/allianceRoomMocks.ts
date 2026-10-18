/**
 * In-memory chat room tables for services that post into an alliance's
 * conversation (AllianceRoom.service). Returns the arrays it writes to.
 */
export function installAllianceRoomMocks(mockPrisma: any, vi: any) {
  const rooms: Array<{ id: number; allianceId: number; name: string }> = [];
  const participants: Array<{ roomId: number; userId: number }> = [];
  const chatMessages: Array<{ roomId: number; senderId: number; content: string }> =
    [];
  mockPrisma.chatRoom = {
    ...(mockPrisma.chatRoom ?? {}),
    findFirst: vi.fn(async ({ where }: any) =>
      rooms.find((r) => r.allianceId === where?.allianceId) ?? null,
    ),
    findMany: vi.fn(async ({ where }: any = {}) =>
      rooms.filter((r) => where?.allianceId === undefined || r.allianceId === where.allianceId),
    ),
    create: vi.fn(async ({ data }: any) => {
      const room = { id: rooms.length + 1, allianceId: data.allianceId, name: data.name };
      rooms.push(room);
      return { id: room.id };
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.chatRoomParticipant = {
    ...(mockPrisma.chatRoomParticipant ?? {}),
    deleteMany: vi.fn(async ({ where }: any) => {
      const keep = participants.filter(
        (p) =>
          !(
            p.roomId === where?.roomId &&
            Array.isArray(where?.userId?.notIn) &&
            !where.userId.notIn.includes(p.userId)
          ),
      );
      const count = participants.length - keep.length;
      participants.splice(0, participants.length, ...keep);
      return { count };
    }),
    createMany: vi.fn(async ({ data }: any) => {
      let count = 0;
      for (const row of data) {
        if (!participants.some((p) => p.roomId === row.roomId && p.userId === row.userId)) {
          participants.push(row);
          count++;
        }
      }
      return { count };
    }),
  };
  mockPrisma.chatMessage = {
    ...(mockPrisma.chatMessage ?? {}),
    create: vi.fn(async ({ data }: any) => {
      chatMessages.push(data);
      return { id: chatMessages.length, ...data };
    }),
  };
  return { rooms, participants, chatMessages };
}
