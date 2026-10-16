import { z } from 'zod';

import prisma from '@/lib/prisma';
import { ChatRole, Prisma } from '@/lib/prisma-exports';
import {
  ATTACK_LOG_ACL_SELECT,
  canReadAttackLog,
  grantAttackLogAccessToRoom,
} from '@/services/AttackLogAccess.service';
import {
  assertAllianceChatMembership,
  withLockedChatRoom,
} from '@/services/chatRoomGuards';
import { isAdmin } from '@/utils/authorization';
import { logError, logInfo } from '@/utils/logger';

// Type definitions for messaging operations
/** Describes the create room data contract. */
export interface CreateRoomData {
  name?: string;
  recipients: number[];
  message?: string;
  isPrivate?: boolean;
}

/** Describes the message data contract. */
export interface MessageData {
  content: string;
  messageType?: string;
  replyToMessageId?: number;
  sharedAttackLogId?: number;
}

/** Describes the participant data contract. */
export interface ParticipantData {
  userIds: number[];
}

/** Describes the participant update data contract. */
export interface ParticipantUpdateData {
  action: 'promote' | 'demote' | 'updatePermissions';
  canWrite?: boolean;
}

/** Describes the message search query data contract. */
export interface MessageSearchQuery {
  roomId: number;
  searchTerm?: string;
  limit?: number;
  offset?: number;
  senderId?: number;
  messageType?: string;
  startDate?: Date;
  endDate?: Date;
}

/** Describes the reaction data contract. */
export interface ReactionData {
  messageId: number;
  reaction: string;
}

/** Describes the read status data contract. */
export interface ReadStatusData {
  messageIds: number[];
}

// Zod schemas for validation
const CreateRoomSchema = z.object({
  name: z.string().optional(),
  recipients: z.array(z.number().int().positive()).min(1),
  message: z.string().optional(),
  isPrivate: z.boolean().default(true),
});

const MessageSchema = z.object({
  content: z.string().min(1),
  messageType: z.string().default('TEXT'),
  replyToMessageId: z.number().int().positive().optional(),
  sharedAttackLogId: z.number().int().positive().optional(),
});

const SendMessageSchema = MessageSchema.extend({
  roomId: z.number().int().positive(),
});

/** Largest number of users one add request may include. */
export const MAX_ADD_PARTICIPANTS = 50;

const ParticipantSchema = z.object({
  userIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(MAX_ADD_PARTICIPANTS),
});

const ParticipantUpdateSchema = z.object({
  action: z.enum(['promote', 'demote', 'updatePermissions']),
  canWrite: z.boolean().optional(),
});

const MessageSearchSchema = z.object({
  roomId: z.number().int().positive(),
  searchTerm: z.string().optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
  senderId: z.number().int().positive().optional(),
  messageType: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

const ReactionSchema = z.object({
  messageId: z.number().int().positive(),
  reaction: z.string().min(1),
});

const ReadStatusSchema = z.object({
  messageIds: z.array(z.number().int().positive()).min(1).max(100),
});

/** Encapsulates messaging data access and domain operations. */
export class MessagingService {
  /** Anyone who can read a log may share it; see canReadAttackLog. */
  private static async checkLogSharePermission(
    userId: number,
    logId: number,
    client: Prisma.TransactionClient = prisma,
  ): Promise<boolean> {
    const log = await client.attack_log.findUnique({
      where: { id: logId },
      select: {
        id: true,
        attacker_id: true,
        defender_id: true,
        acl: { select: ATTACK_LOG_ACL_SELECT },
      },
    });
    return canReadAttackLog(userId, log, client);
  }

  /**
   * Grants the other current room members read access after a share message.
   * Failures are logged; the message itself has already been sent.
   */
  private static async grantAclToParticipants(
    logId: number,
    roomId: number,
    senderId: number,
    client: Prisma.TransactionClient = prisma,
  ) {
    try {
      const { newUserIds } = await grantAttackLogAccessToRoom(
        logId,
        senderId,
        roomId,
        client,
      );
      logInfo(
        `[ACL Grant] Granted ${newUserIds.length} new readers for shared log ${logId} in room ${roomId}`,
      );
    } catch (aclError) {
      logError(
        `[ACL Grant] FAILED to create ACL entries for shared log ${logId} in room ${roomId}:`,
        aclError,
      );
    }
  }

  /**
   * Gets all chat rooms for a user with unread counts
   */
  static async getUserChatRooms(userId: number) {
    try {
      const rooms = await prisma.chatRoom.findMany({
        where: {
          participants: { some: { userId } },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  display_name: true,
                  avatar: true,
                  last_active: true,
                },
              },
            },
          },
          messages: {
            take: 1,
            orderBy: { sentAt: 'desc' },
            include: {
              sender: { select: { id: true, display_name: true } },
            },
          },
          creator: {
            select: { id: true, display_name: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      // Format rooms with unread counts
      const formattedRooms = await Promise.all(
        rooms.map(async (room) => {
          const isDirect = room.participants.length === 2 && !room.name;
          let displayName = room.name;
          let otherParticipant = null;

          if (isDirect) {
            otherParticipant = room.participants.find(
              (p) => p.userId !== userId,
            )?.user;
            displayName = otherParticipant?.display_name || 'Unknown User';
          }

          // Calculate unread messages
          const unreadCount = await prisma.chatMessage.count({
            where: {
              roomId: room.id,
              senderId: { not: userId },
              readBy: { none: { userId } },
            },
          });

          // Check if user is an admin
          const userParticipant = room.participants.find(
            (p) => p.userId === userId,
          );
          const isAdmin =
            room.createdById === userId || userParticipant?.role === 'ADMIN';

          return {
            id: room.id,
            name: displayName,
            isPrivate: room.isPrivate,
            isDirect,
            createdById: room.createdById,
            createdAt: room.createdAt,
            updatedAt: room.updatedAt,
            lastMessage: room.messages[0]?.content || null,
            lastMessageTime: room.messages[0]?.sentAt || null,
            lastMessageSender: room.messages[0]?.sender.display_name || null,
            unreadCount,
            isAdmin,
            participants: room.participants.map((p) => ({
              id: p.user.id,
              role: p.role,
              canWrite: p.canWrite,
              display_name: p.user.display_name,
              avatar: p.user.avatar,
              is_online: p.user.last_active
                ? new Date().getTime() -
                    new Date(p.user.last_active).getTime() <
                  5 * 60 * 1000
                : false,
            })),
          };
        }),
      );

      return formattedRooms;
    } catch (error) {
      logError('Error getting user chat rooms', { userId, error });
      throw error;
    }
  }

  /**
   * Creates a new chat room or finds an existing one
   */
  static async createOrFindRoom(userId: number, data: CreateRoomData) {
    const validatedData = CreateRoomSchema.parse(data);
    const isDirect =
      validatedData.recipients.length === 1 && !validatedData.name;
    const uniqueRecipients = Array.from(
      new Set(validatedData.recipients.map((id) => Number(id))),
    );

    try {
      // For direct messages, check if a room already exists with this recipient
      if (isDirect) {
        const recipientId = Number(validatedData.recipients[0]);

        const existingRoom = await prisma.chatRoom.findFirst({
          where: {
            name: null, // Direct messages have no name
            participants: {
              every: {
                userId: {
                  in: [userId, recipientId],
                },
              },
            },
          },
          include: {
            participants: true,
            _count: {
              select: {
                participants: true,
              },
            },
          },
        });

        // If room exists with exactly 2 participants, add the new message to it
        if (existingRoom && existingRoom._count.participants === 2) {
          // Add new message to existing room
          if (validatedData.message && validatedData.message.trim()) {
            await prisma.chatMessage.create({
              data: {
                roomId: existingRoom.id,
                senderId: userId,
                content: validatedData.message,
              },
            });
          }

          return {
            id: existingRoom.id,
            isExisting: true,
            message: 'Message sent to existing conversation',
          };
        }
      } else {
        // For group chats, check if there's already a room with exactly these participants
        const allParticipantIds = Array.from(
          new Set([userId, ...uniqueRecipients]),
        );

        const existingRooms = await prisma.chatRoom.findMany({
          where: {
            participants: {
              every: {
                userId: {
                  in: allParticipantIds,
                },
              },
            },
            AND: {
              participants: {
                none: {
                  userId: {
                    notIn: allParticipantIds,
                  },
                },
              },
            },
            ...(validatedData.name ? { name: validatedData.name } : {}),
          },
          include: {
            participants: true,
            _count: {
              select: {
                participants: true,
              },
            },
          },
        });

        // If a matching room exists with the exact same participants, use it
        const exactMatch = existingRooms.find(
          (room) => room._count.participants === allParticipantIds.length,
        );

        if (exactMatch) {
          if (validatedData.message && validatedData.message.trim()) {
            await prisma.chatMessage.create({
              data: {
                roomId: exactMatch.id,
                senderId: userId,
                content: validatedData.message,
              },
            });
          }

          return {
            id: exactMatch.id,
            isExisting: true,
            message: 'Message sent to existing conversation',
          };
        }
      }

      // If we get here, we need to create a new room
      const newRoom = await prisma.chatRoom.create({
        data: {
          name: isDirect ? null : validatedData.name,
          isPrivate: validatedData.isPrivate,
          createdById: userId,
          participants: {
            create: [
              {
                userId,
                role: isDirect ? 'MEMBER' : 'ADMIN',
              },
              ...uniqueRecipients.map((recipientId: number) => ({
                userId: Number(recipientId),
                role: 'MEMBER' as const,
              })),
            ],
          },
          ...(validatedData.message && validatedData.message.trim()
            ? {
                messages: {
                  create: {
                    senderId: userId,
                    content: validatedData.message,
                  },
                },
              }
            : {}),
        },
        include: {
          participants: true,
          messages: true,
        },
      });

      return {
        id: newRoom.id,
        isExisting: false,
        message: 'New conversation created',
      };
    } catch (error) {
      logError('Error creating or finding chat room', {
        userId,
        data: validatedData,
        error,
      });

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        if (
          isDirect &&
          error.meta?.target === 'ChatRoomParticipant_roomId_userId_key'
        ) {
          const recipientId = Number(validatedData.recipients[0]);
          try {
            const existingRoom = await prisma.chatRoom.findFirst({
              where: {
                name: null,
                participants: {
                  every: { userId: { in: [userId, recipientId] } },
                },
              },
              include: { _count: { select: { participants: true } } },
            });

            if (existingRoom && existingRoom._count.participants === 2) {
              if (validatedData.message && validatedData.message.trim()) {
                await prisma.chatMessage.create({
                  data: {
                    roomId: existingRoom.id,
                    senderId: userId,
                    content: validatedData.message,
                  },
                });
              }
              return {
                id: existingRoom.id,
                isExisting: true,
                message: 'Message sent to existing conversation',
              };
            }
          } catch (recoverError) {
            logError('Error recovering from unique constraint', recoverError);
          }
        }
        throw new Error(
          'Conflict: Could not create conversation, possibly due to existing participants.',
        );
      }
      throw error;
    }
  }

  /**
   * Gets messages for a specific chat room
   */
  static async getRoomMessages(userId: number, roomId: number) {
    try {
      return await withLockedChatRoom(roomId, async (tx) => {
        await assertAllianceChatMembership(tx, userId, roomId);
        // Verify user is a participant in the room
        const roomParticipant = await tx.chatRoomParticipant.findUnique({
          where: { roomId_userId: { roomId, userId } },
          include: {
            room: {
              include: {
                participants: {
                  select: { userId: true },
                },
              },
            },
          },
        });

        if (!roomParticipant) {
          throw new Error('Forbidden: You are not a participant in this room.');
        }

        const messages = await tx.chatMessage.findMany({
          where: { roomId },
          orderBy: { sentAt: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                display_name: true,
                avatar: true,
                last_active: true,
              },
            },
            reactions: {
              select: {
                userId: true,
                reaction: true,
                user: { select: { id: true, display_name: true } },
              },
            },
            readBy: {
              select: {
                userId: true,
                readAt: true,
                user: { select: { id: true, display_name: true } },
              },
            },
            replyToMessage: {
              select: {
                id: true,
                content: true,
                sender: { select: { id: true, display_name: true } },
              },
            },
            sharedAttackLog: {
              select: {
                id: true,
                attacker_id: true,
                defender_id: true,
                winner: true,
                timestamp: true,
              },
            },
          },
        });

        const transformedMessages = messages.map((message) => {
          const isOnline = message.sender.last_active
            ? new Date().getTime() -
                new Date(message.sender.last_active).getTime() <
              5 * 60 * 1000
            : false;

          const reactions = message.reactions.map((r) => ({
            userId: r.userId,
            reaction: r.reaction,
            userDisplayName: r.user.display_name,
          }));

          const readBy = message.readBy.map((r) => ({
            userId: r.userId,
            readAt: r.readAt.toISOString(),
            userDisplayName: r.user.display_name,
          }));

          const replyToMessage = message.replyToMessage
            ? JSON.parse(
                JSON.stringify(message.replyToMessage, (key, value) =>
                  typeof value === 'bigint' ? value.toString() : value,
                ),
              )
            : null;

          const sharedAttackLog = message.sharedAttackLog
            ? {
                ...JSON.parse(
                  JSON.stringify(message.sharedAttackLog, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value,
                  ),
                ),
                timestamp: message.sharedAttackLog.timestamp?.toISOString(),
              }
            : null;

          return {
            id: message.id,
            roomId: message.roomId,
            senderId: message.senderId,
            content: message.content,
            messageType: message.messageType,
            sentAt: message.sentAt.toISOString(),
            sender: {
              id: message.sender.id,
              display_name: message.sender.display_name,
              avatar: message.sender.avatar,
              is_online: isOnline,
            },
            reactions,
            readBy,
            replyToMessage,
            sharedAttackLog,
          };
        });

        return transformedMessages;
      });
    } catch (error) {
      logError('Error getting room messages', { userId, roomId, error });
      throw error;
    }
  }

  /**
   * Adds participants to a chat room
   */
  static async addParticipants(
    userId: number,
    roomId: number,
    data: ParticipantData,
  ) {
    const validatedData = ParticipantSchema.parse(data);

    try {
      return await withLockedChatRoom(roomId, async (tx) => {
        const room = await tx.chatRoom.findUnique({
          where: { id: roomId },
          include: {
            participants: { where: { userId }, select: { role: true } },
          },
        });

        if (!room) {
          throw new Error('Chat room not found.');
        }

        // Every add needs a room admin, or a site admin. Membership alone is not enough.
        const currentUserIsRoomAdmin =
          room.participants[0]?.role === ChatRole.ADMIN;
        if (!currentUserIsRoomAdmin && !(await isAdmin(userId))) {
          throw new Error('Forbidden: Only room admins can add participants.');
        }

        const participantsToAdd = validatedData.userIds
          .map((id) => Number(id))
          .filter((id) => !isNaN(id) && id !== userId)
          .map((userId) => ({
            roomId,
            userId,
            role: ChatRole.MEMBER,
            canWrite: true,
          }));

        if (participantsToAdd.length === 0) {
          throw new Error('No valid users to add provided.');
        }

        const result = await tx.chatRoomParticipant.createMany({
          data: participantsToAdd,
          skipDuplicates: true,
        });

        // Update room's updatedAt timestamp
        await tx.chatRoom.update({
          where: { id: roomId },
          data: { updatedAt: new Date() },
        });

        return {
          message: `${result.count} user(s) added successfully.`,
          count: result.count,
        };
      });
    } catch (error) {
      logError('Error adding participants', {
        userId,
        roomId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Updates participant permissions or removes them
   */
  static async manageParticipant(
    userId: number,
    roomId: number,
    targetUserId: number,
    data: ParticipantUpdateData,
  ) {
    const validatedData = ParticipantUpdateSchema.parse(data);

    try {
      return await withLockedChatRoom(roomId, async (tx) => {
        await assertAllianceChatMembership(tx, userId, roomId);
        // Verify current user is an ADMIN in this room
        const currentUserParticipant = await tx.chatRoomParticipant.findUnique({
          where: { roomId_userId: { roomId, userId } },
          select: { role: true },
        });

        if (
          !currentUserParticipant ||
          currentUserParticipant.role !== ChatRole.ADMIN
        ) {
          throw new Error(
            'Forbidden: You do not have admin rights in this room.',
          );
        }

        // Verify target user is actually in the room
        const targetParticipant = await tx.chatRoomParticipant.findUnique({
          where: { roomId_userId: { roomId, userId: targetUserId } },
        });

        if (!targetParticipant) {
          throw new Error('Target user is not in this room.');
        }

        if (targetUserId === userId) {
          throw new Error('You cannot manage your own role or permissions.');
        }

        const updateData: any = {};

        switch (validatedData.action) {
          case 'promote':
            if (targetParticipant?.role === ChatRole.MEMBER) {
              updateData.role = ChatRole.ADMIN;
            } else {
              throw new Error('User is already an admin or action is invalid.');
            }
            break;
          case 'demote':
            if (targetParticipant?.role === ChatRole.ADMIN) {
              updateData.role = ChatRole.MEMBER;
            } else {
              throw new Error('User is already a member or action is invalid.');
            }
            break;
          case 'updatePermissions':
            if (typeof validatedData.canWrite !== 'boolean') {
              throw new Error('Invalid value for canWrite permission.');
            }
            updateData.canWrite = validatedData.canWrite;
            break;
          default:
            throw new Error('Invalid action specified.');
        }

        if (Object.keys(updateData).length > 0) {
          await tx.chatRoomParticipant.update({
            where: { roomId_userId: { roomId, userId: targetUserId } },
            data: updateData,
          });
          return {
            message: `Permissions updated successfully for user ${targetUserId}.`,
          };
        }
        throw new Error('No changes applied.');
      });
    } catch (error) {
      logError('Error managing participant', {
        userId,
        roomId,
        targetUserId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Removes a participant from a chat room
   */
  static async removeParticipant(
    userId: number,
    roomId: number,
    targetUserId: number,
  ) {
    try {
      return await withLockedChatRoom(roomId, async (tx) => {
        await assertAllianceChatMembership(tx, userId, roomId);
        // Verify current user is an ADMIN in this room
        const currentUserParticipant = await tx.chatRoomParticipant.findUnique({
          where: { roomId_userId: { roomId, userId } },
          select: { role: true },
        });

        if (
          !currentUserParticipant ||
          currentUserParticipant.role !== ChatRole.ADMIN
        ) {
          throw new Error(
            'Forbidden: You do not have admin rights in this room.',
          );
        }

        const targetParticipant = await tx.chatRoomParticipant.findUnique({
          where: { roomId_userId: { roomId, userId: targetUserId } },
        });

        if (!targetParticipant) {
          throw new Error('Target user is not in this room.');
        }

        // Prevent removing the last admin if they are the only admin left
        if (targetParticipant.role === ChatRole.ADMIN) {
          const adminCount = await tx.chatRoomParticipant.count({
            where: { roomId, role: ChatRole.ADMIN },
          });
          if (adminCount <= 1) {
            throw new Error('Cannot remove the last admin.');
          }
        }

        await tx.chatRoomParticipant.delete({
          where: { roomId_userId: { roomId, userId: targetUserId } },
        });

        return { message: `User ${targetUserId} removed from room.` };
      });
    } catch (error) {
      logError('Error removing participant', {
        userId,
        roomId,
        targetUserId,
        error,
      });
      throw error;
    }
  }

  /**
   * Sends a new message to a chat room
   */
  static async sendMessage(userId: number, roomId: number, data: MessageData) {
    const validatedData = MessageSchema.parse(data);

    try {
      return await withLockedChatRoom(roomId, async (tx) => {
        await assertAllianceChatMembership(tx, userId, roomId);
        // Verify user is a participant and has write permission
        const roomParticipant = await tx.chatRoomParticipant.findUnique({
          where: { roomId_userId: { roomId, userId } },
          select: { canWrite: true },
        });

        if (!roomParticipant) {
          throw new Error('Forbidden: You are not a participant in this room.');
        }

        if (!roomParticipant.canWrite) {
          throw new Error(
            'Forbidden: You do not have permission to send messages in this room.',
          );
        }

        if (validatedData.replyToMessageId) {
          const reply = await tx.chatMessage.findFirst({
            where: { id: validatedData.replyToMessageId, roomId },
            select: { id: true },
          });
          if (!reply) throw new Error('Cannot reply to this message.');
        }

        const { sharedAttackLogId } = validatedData;
        if (
          sharedAttackLogId &&
          !(await MessagingService.checkLogSharePermission(
            userId,
            sharedAttackLogId,
            tx,
          ))
        ) {
          throw new Error('Forbidden: No permission to share this log.');
        }

        const message = await tx.chatMessage.create({
          data: {
            roomId,
            senderId: userId,
            content: validatedData.content,
            messageType: validatedData.messageType,
            replyToMessageId: validatedData.replyToMessageId,
            sharedAttackLogId: validatedData.sharedAttackLogId,
          },
          include: {
            sender: {
              select: { id: true, display_name: true, avatar: true },
            },
          },
        });

        // Update room's updatedAt timestamp
        await tx.chatRoom.update({
          where: { id: roomId },
          data: { updatedAt: new Date() },
        });

        if (sharedAttackLogId) {
          await MessagingService.grantAclToParticipants(
            sharedAttackLogId,
            roomId,
            userId,
            tx,
          );
        }

        return {
          id: message.id,
          roomId: message.roomId,
          senderId: message.senderId,
          content: message.content,
          messageType: message.messageType,
          sentAt: message.sentAt,
          sender: {
            id: message.sender.id,
            display_name: message.sender.display_name,
            avatar: message.sender.avatar,
          },
        };
      });
    } catch (error) {
      logError('Error sending message', {
        userId,
        roomId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Sends a message with additional real-time validation and ACL handling.
   */
  static async sendMessageRealtime(
    userId: number,
    data: MessageData & { roomId: number },
  ): Promise<
    Prisma.ChatMessageGetPayload<{
      include: {
        sender: {
          select: {
            id: true;
            display_name: true;
            avatar: true;
            last_active: true;
          };
        };
        replyToMessage: {
          select: {
            id: true;
            content: true;
            sender: { select: { id: true; display_name: true } };
          };
        };
        sharedAttackLog: {
          select: {
            id: true;
            attacker_id: true;
            defender_id: true;
            winner: true;
            timestamp: true;
          };
        };
        reactions: {
          select: {
            userId: true;
            reaction: true;
            user: { select: { id: true; display_name: true } };
          };
        };
        readBy: {
          select: {
            userId: true;
            readAt: true;
            user: { select: { id: true; display_name: true } };
          };
        };
      };
    }>
  > {
    const validatedData = SendMessageSchema.parse(data);
    const {
      roomId,
      content,
      replyToMessageId,
      messageType = 'TEXT',
      sharedAttackLogId,
    } = validatedData;

    try {
      return await withLockedChatRoom(roomId, async (tx) => {
        await assertAllianceChatMembership(tx, userId, roomId);
        const participant = await tx.chatRoomParticipant.findUnique({
          where: { roomId_userId: { roomId, userId } },
          include: { room: { select: { allianceId: true } } },
        });

        if (!participant || !participant.canWrite) {
          throw new Error('Cannot send message in this room.');
        }

        if (participant.room.allianceId) {
          const membership = await tx.alliance_memberships.findUnique({
            where: {
              unique_alliance_user: {
                alliance_id: participant.room.allianceId,
                user_id: userId,
              },
            },
          });
          if (!membership) {
            throw new Error('Not an alliance member.');
          }
        }

        let validReplyToId: number | null = null;
        if (replyToMessageId) {
          const repliedTo = await tx.chatMessage.findUnique({
            where: { id: replyToMessageId, roomId },
          });
          if (!repliedTo) {
            throw new Error('Cannot reply to this message.');
          }
          validReplyToId = repliedTo.id;
        }

        let validSharedAttackLogId: number | null = null;
        if (messageType === 'ATTACK_LOG_SHARE' && sharedAttackLogId) {
          // Unknown and unreadable logs get the same answer.
          const canShare = await MessagingService.checkLogSharePermission(
            userId,
            sharedAttackLogId,
            tx,
          );
          if (!canShare) {
            throw new Error('No permission to share this log.');
          }
          validSharedAttackLogId = sharedAttackLogId;
        } else if (messageType !== 'TEXT') {
          throw new Error('Unsupported message type.');
        }

        const newMessage = await tx.chatMessage.create({
          data: {
            roomId,
            senderId: userId,
            content,
            messageType,
            replyToMessageId: validReplyToId,
            sharedAttackLogId: validSharedAttackLogId,
          },
          include: {
            sender: {
              select: {
                id: true,
                display_name: true,
                avatar: true,
                last_active: true,
              },
            },
            replyToMessage: {
              select: {
                id: true,
                content: true,
                sender: { select: { id: true, display_name: true } },
              },
            },
            sharedAttackLog: {
              select: {
                id: true,
                attacker_id: true,
                defender_id: true,
                winner: true,
                timestamp: true,
              },
            },
            reactions: {
              select: {
                userId: true,
                reaction: true,
                user: { select: { id: true, display_name: true } },
              },
            },
            readBy: {
              select: {
                userId: true,
                readAt: true,
                user: { select: { id: true, display_name: true } },
              },
            },
          },
        });

        await tx.chatRoom.update({
          where: { id: roomId },
          data: { updatedAt: new Date() },
        });

        if (
          newMessage.messageType === 'ATTACK_LOG_SHARE' &&
          newMessage.sharedAttackLogId
        ) {
          await MessagingService.grantAclToParticipants(
            newMessage.sharedAttackLogId,
            roomId,
            userId,
            tx,
          );
        }

        return newMessage;
      });
    } catch (error) {
      logError('Error sending realtime message', {
        userId,
        roomId,
        error,
      });
      throw error;
    }
  }

  /**
   * Searches messages in a chat room
   */
  static async searchMessages(userId: number, query: MessageSearchQuery) {
    const validatedQuery = MessageSearchSchema.parse(query);

    try {
      return await withLockedChatRoom(validatedQuery.roomId, async (tx) => {
        await assertAllianceChatMembership(tx, userId, validatedQuery.roomId);
        // Verify user is a participant in the room
        const roomParticipant = await tx.chatRoomParticipant.findUnique({
          where: {
            roomId_userId: { roomId: validatedQuery.roomId, userId },
          },
        });

        if (!roomParticipant) {
          throw new Error('Forbidden: You are not a participant in this room.');
        }

        const whereClause: any = {
          roomId: validatedQuery.roomId,
        };

        if (validatedQuery.searchTerm) {
          whereClause.content = {
            contains: validatedQuery.searchTerm,
            mode: 'insensitive',
          };
        }

        if (validatedQuery.senderId) {
          whereClause.senderId = validatedQuery.senderId;
        }

        if (validatedQuery.messageType) {
          whereClause.messageType = validatedQuery.messageType;
        }

        if (validatedQuery.startDate || validatedQuery.endDate) {
          whereClause.sentAt = {};
          if (validatedQuery.startDate) {
            whereClause.sentAt.gte = validatedQuery.startDate;
          }
          if (validatedQuery.endDate) {
            whereClause.sentAt.lte = validatedQuery.endDate;
          }
        }

        const messages = await tx.chatMessage.findMany({
          where: whereClause,
          orderBy: { sentAt: 'desc' },
          take: validatedQuery.limit,
          skip: validatedQuery.offset,
          include: {
            sender: {
              select: { id: true, display_name: true, avatar: true },
            },
            replyToMessage: {
              select: {
                id: true,
                content: true,
                sender: { select: { id: true, display_name: true } },
              },
            },
          },
        });

        return messages.map((message) => ({
          id: message.id,
          roomId: message.roomId,
          senderId: message.senderId,
          content: message.content,
          messageType: message.messageType,
          sentAt: message.sentAt.toISOString(),
          sender: {
            id: message.sender.id,
            display_name: message.sender.display_name,
            avatar: message.sender.avatar,
          },
          replyToMessage: message.replyToMessage
            ? {
                id: message.replyToMessage.id,
                content: message.replyToMessage.content,
                sender: message.replyToMessage.sender,
              }
            : null,
        }));
      });
    } catch (error) {
      logError('Error searching messages', {
        userId,
        query: validatedQuery,
        error,
      });
      throw error;
    }
  }

  /**
   * Adds or removes a reaction to a message
   */
  static async toggleReaction(userId: number, data: ReactionData) {
    const validatedData = ReactionSchema.parse(data);

    try {
      // Verify user is a participant in the room
      const message = await prisma.chatMessage.findUnique({
        where: { id: validatedData.messageId },
        include: { room: { include: { participants: { where: { userId } } } } },
      });

      if (!message || message.room.participants.length === 0) {
        throw new Error('Forbidden: You are not a participant in this room.');
      }

      // Try to remove existing reaction first
      const removed = await prisma.chatMessageReaction.deleteMany({
        where: {
          messageId: validatedData.messageId,
          userId,
          reaction: validatedData.reaction,
        },
      });

      // If reaction was not removed (didn't exist), add it
      if (removed.count === 0) {
        await prisma.chatMessageReaction.create({
          data: {
            messageId: validatedData.messageId,
            userId,
            reaction: validatedData.reaction,
          },
        });
        return { action: 'added', reaction: validatedData.reaction };
      }
      return { action: 'removed', reaction: validatedData.reaction };
    } catch (error) {
      logError('Error toggling reaction', {
        userId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Marks messages as read by a user
   */
  static async markMessagesAsRead(
    userId: number,
    data: ReadStatusData,
    roomId?: number,
  ) {
    const validatedData = ReadStatusSchema.parse(data);

    try {
      const messageIds = [...new Set(validatedData.messageIds)];
      const messages = await prisma.chatMessage.findMany({
        where: {
          id: { in: messageIds },
          ...(roomId !== undefined ? { roomId } : {}),
          room: { participants: { some: { userId } } },
        },
        select: { id: true },
      });
      if (messages.length !== messageIds.length) {
        throw new Error('Forbidden: Cannot mark these messages as read.');
      }
      const now = new Date();

      const receipts = await prisma.$transaction(
        messageIds.map((messageId) =>
          prisma.chatMessageReadStatus.upsert({
            where: {
              messageId_userId: {
                messageId,
                userId,
              },
            },
            update: {
              readAt: now,
            },
            create: {
              messageId,
              userId,
              readAt: now,
            },
          }),
        ),
      );

      return {
        message: `${messageIds.length} messages marked as read.`,
        receipts,
      };
    } catch (error) {
      logError('Error marking messages as read', {
        userId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets unread message count for a user in a specific room
   */
  static async getUnreadMessageCount(userId: number, roomId: number) {
    try {
      // Verify user is a participant in the room
      const roomParticipant = await prisma.chatRoomParticipant.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });

      if (!roomParticipant) {
        throw new Error('Forbidden: You are not a participant in this room.');
      }

      const unreadCount = await prisma.chatMessage.count({
        where: {
          roomId,
          senderId: { not: userId },
          readBy: { none: { userId } },
        },
      });

      return { unreadCount };
    } catch (error) {
      logError('Error getting unread message count', { userId, roomId, error });
      throw error;
    }
  }

  /**
   * Gets room participants with their information
   */
  static async getRoomParticipants(userId: number, roomId: number) {
    try {
      // Verify user is a participant in the room
      const roomParticipant = await prisma.chatRoomParticipant.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });

      if (!roomParticipant) {
        throw new Error('Forbidden: You are not a participant in this room.');
      }

      const participants = await prisma.chatRoomParticipant.findMany({
        where: { roomId },
        include: {
          user: {
            select: {
              id: true,
              display_name: true,
              avatar: true,
              last_active: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      });

      return participants.map((p) => ({
        id: p.user.id,
        userId: p.userId,
        role: p.role,
        canWrite: p.canWrite,
        joinedAt: p.joinedAt,
        display_name: p.user.display_name,
        avatar: p.user.avatar,
        is_online: p.user.last_active
          ? new Date().getTime() - new Date(p.user.last_active).getTime() <
            5 * 60 * 1000
          : false,
      }));
    } catch (error) {
      logError('Error getting room participants', { userId, roomId, error });
      throw error;
    }
  }
}
