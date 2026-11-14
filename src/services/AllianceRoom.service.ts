import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';

type Tx = Prisma.TransactionClient;

/**
 * The alliance's shared conversation in /messaging. Announcements and intel
 * calls are posted here so members actually receive them (they used to be
 * written to the legacy `messages` table, which no page reads).
 *
 * The room is created on first use and its participants follow the roster:
 * every post re-syncs it (leaving or being kicked already evicts players
 * through evictUserFromAllianceChatRooms).
 */
export async function getOrCreateAllianceRoom(
  tx: Tx,
  alliance: { id: number; name: string; leader_id: number | null },
  fallbackCreatorId: number,
) {
  const existing = await tx.chatRoom.findFirst({
    where: { allianceId: alliance.id },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (existing) return existing.id;
  const room = await tx.chatRoom.create({
    data: {
      name: alliance.name,
      isPrivate: true,
      allianceId: alliance.id,
      createdById: alliance.leader_id ?? fallbackCreatorId,
    },
    select: { id: true },
  });
  return room.id;
}

/** Makes the room's participants match the current roster. */
export async function syncAllianceRoomParticipants(
  tx: Tx,
  allianceId: number,
  roomId: number,
) {
  const members = await tx.alliance_memberships.findMany({
    where: { alliance_id: allianceId },
    select: { user_id: true },
  });
  const memberIds = [...new Set(members.map((m) => m.user_id))];
  await tx.chatRoomParticipant.deleteMany({
    where: { roomId, userId: { notIn: memberIds } },
  });
  if (memberIds.length) {
    await tx.chatRoomParticipant.createMany({
      data: memberIds.map((userId) => ({ roomId, userId })),
      skipDuplicates: true,
    });
  }
  return memberIds;
}

/** Posts a message from `senderId` into the alliance's room. */
export async function postToAllianceRoom(
  tx: Tx,
  alliance: { id: number; name: string; leader_id: number | null },
  senderId: number,
  content: string,
) {
  const roomId = await getOrCreateAllianceRoom(tx, alliance, senderId);
  const memberIds = await syncAllianceRoomParticipants(tx, alliance.id, roomId);
  await tx.chatMessage.create({
    data: { roomId, senderId, content: content.slice(0, 4000) },
  });
  return { roomId, recipients: memberIds.filter((id) => id !== senderId) };
}

/**
 * Opens the alliance conversation for a member, creating the room and syncing
 * its participants first (the room otherwise exists only after the first
 * announcement or call). Returns the room id for /messaging?roomId=.
 */
export async function openAllianceChatRoom(userId: number, allianceId: number) {
  return prisma.$transaction(async (tx) => {
    const alliance = await tx.alliances.findUnique({
      where: { id: allianceId },
      select: { id: true, name: true, leader_id: true, status: true },
    });
    if (!alliance) throw new Error('Alliance not found');
    if (alliance.status === 'RESERVED') {
      throw new Error('This alliance is reserved and has no chat');
    }
    const membership = await tx.alliance_memberships.findFirst({
      where: { alliance_id: allianceId, user_id: userId },
      select: { id: true },
    });
    if (!membership && alliance.leader_id !== userId) {
      throw new Error('You are not a member of this alliance');
    }
    const roomId = await getOrCreateAllianceRoom(tx, alliance, userId);
    await syncAllianceRoomParticipants(tx, allianceId, roomId);
    return { roomId };
  });
}
