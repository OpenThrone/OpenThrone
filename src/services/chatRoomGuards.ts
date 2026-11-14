import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { assertAllianceIdActive } from '@/services/allianceStatus';

/**
 * Serialize room authorization and its effects with participant/permission
 * changes. Alliance removals lock the same rooms in ascending order.
 *
 * `timeoutMs` extends the interactive-transaction timeout for callers whose
 * locked section may queue behind other senders on a slow database path —
 * validation must stay OUTSIDE the lock so the queue only contains the
 * write set itself (see Messaging.service sendMessage[Realtime]).
 */
export async function withLockedChatRoom<T>(
  roomId: number,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ChatRoom" WHERE id = ${roomId} FOR UPDATE`;
      return operation(tx);
    },
    options?.timeoutMs ? { timeout: options.timeoutMs } : undefined,
  );
}

export async function lockAllianceChatRooms(
  tx: Prisma.TransactionClient,
  allianceId: number,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "ChatRoom" WHERE "allianceId" = ${allianceId} ORDER BY id FOR UPDATE`;
}

/** Join-time authorization failure carrying the user-facing message. */
export class ChatRoomJoinError extends Error {}

/**
 * Join-time authorization for the realtime pilot: room must exist, caller
 * must have a ChatRoomParticipant row (every room, not only alliance rooms),
 * and alliance rooms additionally require a current alliance membership.
 *
 * Mirrors the Socket.IO `handleJoinRoom` sequence (`src/lib/socket.ts:399-491`;
 * invariants 1–2 in docs/realtime-pilot.md §6). The DO pilot runs it at
 * ticket-issuance time — the short-lived signed ticket is the connect-time
 * proof that this check just passed.
 */
export async function assertCanJoinChatRoom(
  tx: Prisma.TransactionClient,
  userId: number,
  roomId: number,
): Promise<void> {
  const room = await tx.chatRoom.findUnique({
    where: { id: roomId },
    select: { id: true, allianceId: true },
  });
  if (!room) {
    throw new ChatRoomJoinError('Room not found.');
  }

  const participant = await tx.chatRoomParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { id: true },
  });
  if (!participant) {
    throw new ChatRoomJoinError('You are not a participant in this chat room.');
  }

  if (room.allianceId) {
    const membership = await tx.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: {
          alliance_id: room.allianceId,
          user_id: userId,
        },
      },
    });
    if (!membership) {
      throw new ChatRoomJoinError(
        'You are not a member of the alliance for this chat.',
      );
    }
  }
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

/**
 * Posting in an alliance room is an alliance feature: closed while the
 * alliance is RESERVED (#13). Members keep read access and can still leave.
 */
export async function assertAllianceChatOpen(
  tx: Prisma.TransactionClient,
  roomId: number,
): Promise<void> {
  const room = await tx.chatRoom.findUnique({
    where: { id: roomId },
    select: { allianceId: true },
  });
  if (room?.allianceId) await assertAllianceIdActive(tx, room.allianceId);
}
