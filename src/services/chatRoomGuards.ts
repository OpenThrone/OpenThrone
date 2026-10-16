import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';

/**
 * Serialize room authorization and its effects with participant/permission
 * changes. Alliance removals lock the same rooms in ascending order.
 */
export async function withLockedChatRoom<T>(
  roomId: number,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ChatRoom" WHERE id = ${roomId} FOR UPDATE`;
    return operation(tx);
  });
}

export async function lockAllianceChatRooms(
  tx: Prisma.TransactionClient,
  allianceId: number,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "ChatRoom" WHERE "allianceId" = ${allianceId} ORDER BY id FOR UPDATE`;
}

/** Alliance room participants must still belong to the alliance. */
export async function assertAllianceChatMembership(
  tx: Prisma.TransactionClient,
  userId: number,
  roomId: number,
): Promise<void> {
  const room = await tx.chatRoom.findUnique({
    where: { id: roomId },
    select: { allianceId: true },
  });
  if (room?.allianceId) {
    const membership = await tx.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: { alliance_id: room.allianceId, user_id: userId },
      },
      select: { id: true },
    });
    if (!membership) throw new Error('Not an alliance member.');
  }
}
