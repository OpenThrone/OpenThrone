import type { Server as HttpServer } from 'http';
import { Prisma } from '@prisma/client';
import cookie from 'cookie';
import { getToken } from 'next-auth/jwt';
import type { Socket } from 'socket.io';
import { Server } from 'socket.io';

import { MessagingService } from '@/services/Messaging.service';
import {
  DEFAULT_DASHBOARD_TEST_ORIGIN,
  isOriginAllowed,
  parseOriginList,
} from '@/utils/cors';
import { safeToISOString } from '@/utils/dateHelpers';
import { logError, logInfo } from '@/utils/logger';

import prisma from './prisma';
import { rateLimiter } from './rate-limiter';

let io: Server | null = null;
// Store mapping of userId to a Set of socketIds
const userSockets = new Map<number, Set<string>>();

type GlobalSocketState = typeof globalThis & { __OT_SOCKET_IO__?: Server };

// --- Event Handlers ---
const handleConnection = (socket: Socket) => {
  const { userId } = socket.request as { userId?: number };

  if (userId === undefined) {
    logError('Socket connected without userId. Disconnecting.');
    socket.disconnect(true);
    return;
  }

  socket.join(`user-${userId}`);

  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)?.add(socket.id);

  socket.on('registerUser', (data: { userId: number }) => {
    const requestedUserId = Number(data?.userId);
    if (!requestedUserId) return;

    if (requestedUserId !== userId) {
      logError(
        `Socket ${socket.id} attempted to register mismatched userId ${requestedUserId} (expected ${userId})`,
      );
      return;
    }

    const targetRoom = `user-${requestedUserId}`;
    socket.join(targetRoom);

    if (!userSockets.has(requestedUserId)) {
      userSockets.set(requestedUserId, new Set());
    }
    userSockets.get(requestedUserId)?.add(socket.id);
  });

  // Register chat-only event handlers
  socket.on('sendMessage', (data) => handleSendMessage(socket, userId, data));
  socket.on('joinRoom', (roomId) => handleJoinRoom(socket, userId, roomId));
  socket.on('leaveRoom', (roomId) => handleLeaveRoom(socket, userId, roomId));
  socket.on('addReaction', (data) => handleAddReaction(socket, userId, data));
  socket.on('removeReaction', (data) =>
    handleRemoveReaction(socket, userId, data),
  );
  socket.on('markAsRead', (data) => handleMarkAsRead(socket, userId, data));
  socket.on('getChatRooms', () => handleGetChatRooms(socket, userId));
  socket.on('createChatRoom', (data) =>
    handleCreateChatRoom(socket, userId, data),
  );
  socket.on('getRoomMessages', (data) =>
    handleGetRoomMessages(socket, userId, data),
  );
  socket.on('addParticipants', (data) =>
    handleAddParticipants(socket, userId, data),
  );
  socket.on('manageParticipant', (data) =>
    handleManageParticipant(socket, userId, data),
  );
  socket.on('removeParticipant', (data) =>
    handleRemoveParticipant(socket, userId, data),
  );
  socket.on('searchMessages', (data) =>
    handleSearchMessages(socket, userId, data),
  );
  socket.on('disconnect', (reason) => handleDisconnect(socket, userId, reason));
};

const serializeData = (data: unknown): unknown => {
  return JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (value instanceof Date) {
        return safeToISOString(value);
      }
      return value;
    }),
  );
};

// Define the payload type for messages including relations
type MessageWithRelationsPayload = Prisma.ChatMessageGetPayload<{
  include: {
    sender: {
      select: { id: true; display_name: true; avatar: true; last_active: true };
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
    // Add other shared log includes here if needed
  };
}>;

export const initializeSocket = (httpServer: HttpServer) => {
  if (io) {
    logInfo('Socket.IO already initialized');
    return io;
  }

  const socketCorsAllowlist = (() => {
    const raw =
      process.env.OT_SOCKET_CORS_ORIGINS ??
      process.env.NEXT_PUBLIC_SOCKET_IO_ORIGIN ??
      '*';
    if (raw.trim() === '*') return ['*'];
    return Array.from(
      new Set([...parseOriginList(raw), DEFAULT_DASHBOARD_TEST_ORIGIN]),
    );
  })();

  logInfo('Initializing Socket.IO...');
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (socketCorsAllowlist.includes('*')) return callback(null, true);
        return callback(null, isOriginAllowed(origin, socketCorsAllowlist));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
    allowRequest: async (req, callback) => {
      try {
        // --- Token Sources ---
        // 1) Cookie-based next-auth session token (existing behavior)
        // 2) Authorization: Bearer <token>
        // 3) Querystring: ?token=<token> (works for socket.io polling transport)

        const parsedUrl = (() => {
          try {
            // req.url is typically like "/socket.io/?EIO=4&transport=polling&t=..."
            return new URL(req.url || '', 'http://localhost');
          } catch {
            return null;
          }
        })();

        const authHeader = String(req.headers.authorization || '');
        const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
          ? authHeader.slice('bearer '.length).trim()
          : '';

        const cookies = cookie.parse(req.headers.cookie || '');
        const sessionTokenCookie =
          cookies['next-auth.session-token'] ||
          cookies['__Secure-next-auth.session-token'];

        const queryToken = parsedUrl?.searchParams.get('token') || '';
        const tokenFromClient =
          bearerToken || queryToken || sessionTokenCookie || '';

        if (!tokenFromClient) {
          return callback('No session token', false);
        }

        const minimalReq = {
          headers: req.headers,
          cookies: {
            'next-auth.session-token': tokenFromClient,
            '__Secure-next-auth.session-token': tokenFromClient,
          },
        };

        // If the token is coming from Authorization/query, also set Authorization
        // so next-auth/jwt can pick it up via either mechanism.
        (minimalReq.headers as { authorization?: string }).authorization =
          `Bearer ${tokenFromClient}`;

        const token: { user?: { id?: string | number } } | null =
          await getToken({
            req: minimalReq as unknown as Parameters<typeof getToken>[0]['req'],
            secret: process.env.JWT_SECRET,
          });

        if (!token || !(token.user && token.user.id)) {
          logInfo('Socket Auth: Invalid or missing token/user ID');
          return callback('Invalid token', false);
        }

        (req as { userId?: number }).userId = Number(token.user.id);
        logInfo(`Socket Auth: User ${token.user.id} authorized.`);
        callback(null, true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logInfo('Socket Auth Error:', message);
        return callback('Authentication error', false);
      }
    },
  });

  io.on('connection', handleConnection);

  logInfo('Socket.IO initialized successfully');
  (globalThis as GlobalSocketState).__OT_SOCKET_IO__ = io;
  return io;
};

const handleSendMessage = async (
  socket: Socket,
  userId: number,
  data: {
    roomId: number;
    content: string;
    tempId?: number;
    replyToMessageId?: number;
    messageType?: string;
    sharedAttackLogId?: number;
  },
) => {
  if (!rateLimiter(`sendMessage-${userId}`, { windowMs: 10000, max: 10 })) {
    socket.emit('messageError', {
      tempId: data.tempId,
      error: 'You are sending messages too quickly.',
    });
    return;
  }
  const {
    roomId,
    content,
    replyToMessageId,
    messageType = 'TEXT',
    sharedAttackLogId,
  } = data;
  logInfo(
    `sendMessage event received for room ${roomId} from user ${userId}`,
    data,
  );

  if (!roomId || !content || userId === undefined) {
    logInfo('sendMessage failed: Missing required data or userId');
    socket.emit('messageError', {
      tempId: data.tempId,
      error: 'Invalid message data',
    });
    return;
  }

  try {
    const newMessage = await MessagingService.sendMessageRealtime(userId, {
      roomId: Number(roomId),
      content,
      replyToMessageId,
      messageType,
      sharedAttackLogId,
    });

    const messagePayload = {
      ...serializeData(newMessage),
      tempId: data.tempId,
    };
    const roomChannel = `room-${roomId}`;

    const socketsInRoom = await io?.in(roomChannel).fetchSockets();
    const senderInRoom = socketsInRoom?.some((s) => s.id === socket.id);
    logInfo(
      `<<< SERVER >>> Sockets currently in ${roomChannel} before emit:`,
      socketsInRoom?.map((s) => `${s.id} (User: ${findUserIdBySocketId(s.id)})`),
    );

    io?.to(roomChannel).emit('receiveMessage', messagePayload);
    if (!senderInRoom) {
      socket.emit('receiveMessage', messagePayload);
    }
    logInfo(`<<< SERVER >>> Emitted 'receiveMessage' to ${roomChannel}`);

    await sendNotifications(Number(roomId), userId, newMessage);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Error handling sendMessage for room ${roomId}:`, error);
    socket.emit('messageError', {
      tempId: data.tempId,
      error: message || 'Failed to send message.',
    });
  }
};

const handleJoinRoom = async (socket: Socket, userId: number, roomId: unknown) => {
  const numericRoomId = Number(roomId);
  if (isNaN(numericRoomId)) {
    logError(
      `<<< SERVER >>> Invalid roomId for joinRoom from Socket ${socket.id}: ${String(roomId)}`,
    );
    socket.emit('joinRoomError', {
      roomId,
      error: 'Invalid room ID format.',
    });
    return;
  }

  try {
    const room = await prisma.chatRoom.findUnique({
      where: { id: numericRoomId },
      select: { id: true, allianceId: true },
    });

    if (!room) {
      logError(
        `<<< SERVER >>> Room ${numericRoomId} not found for joinRoom User ${userId}`,
      );
      socket.emit('joinRoomError', {
        roomId: numericRoomId,
        error: 'Room not found.',
      });
      return;
    }

    // Alliance room check
    if (room.allianceId) {
      const membership = await prisma.alliance_memberships.findUnique({
        where: {
          unique_alliance_user: {
            alliance_id: room.allianceId,
            user_id: userId,
          },
        },
      });
      if (!membership) {
        logInfo(
          `<<< SERVER >>> User ${userId} denied joining alliance room ${numericRoomId}`,
        );
        socket.emit('joinRoomError', {
          roomId: numericRoomId,
          error: 'You are not a member of the alliance for this chat.',
        });
        return;
      }
    }

    const roomChannel = `room-${numericRoomId}`;
    socket.join(roomChannel);
    // Confirm join and check adapter rooms
    const adapterRooms = io?.sockets.adapter.rooms.get(roomChannel);
    logInfo(
      `<<< SERVER >>> Socket ${socket.id} (User ${userId}) attempted join on ${roomChannel}. Sockets in room now: ${adapterRooms ? Array.from(adapterRooms) : 'None'}`,
    );
    socket.emit('joinedRoom', { roomId: numericRoomId });
  } catch (error: unknown) {
    logError(
      `<<< SERVER >>> Error during joinRoom User ${userId}, Room ${numericRoomId}:`,
      error,
    );
    socket.emit('joinRoomError', {
      roomId: numericRoomId,
      error: 'Server error joining room.',
    });
  }
};

const handleLeaveRoom = (socket: Socket, userId: number, roomId: unknown) => {
  if (
    typeof roomId === 'number' ||
    (typeof roomId === 'string' && !isNaN(Number(roomId)))
  ) {
    const roomChannel = `room-${Number(roomId)}`;
    socket.leave(roomChannel);
    logInfo(
      `<<< SERVER >>> Socket ${socket.id} (User ${userId}) left ${roomChannel}`,
    );
  } else {
    logError(
      `<<< SERVER >>> Invalid roomId for leaveRoom from Socket ${socket.id}: ${String(roomId)}`,
    );
  }
};

const handleAddReaction = async (
  socket: Socket,
  userId: number,
  data: { messageId: number; reaction: string; roomId: number },
) => {
  if (!rateLimiter(`addReaction-${userId}`, { windowMs: 10000, max: 20 })) {
    socket.emit('reactionError', {
      messageId: data.messageId,
      error: 'You are reacting too quickly.',
    });
    return;
  }
  const { messageId, reaction, roomId } = data;
  logInfo(
    `addReaction event: msg ${messageId}, reaction ${reaction}, room ${roomId}, user ${userId}`,
  );

  if (!messageId || !reaction || !roomId || userId === undefined) {
    socket.emit('reactionError', {
      messageId,
      reaction,
      error: 'Invalid reaction data.',
    });
    return;
  }

  try {
    // Verify user is in the room & message exists
    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        roomId: Number(roomId),
        room: { participants: { some: { userId } } },
      },
      select: { id: true },
    });
    if (!message) {
      logInfo(
        `addReaction failed: Message ${messageId} not found in room ${roomId} or user ${userId} not participant.`,
      );
      socket.emit('reactionError', {
        messageId,
        reaction,
        error: 'Message not found or you are not in this room.',
      });
      return;
    }

    // Create reaction
    const newReaction = await prisma.chatMessageReaction.create({
      data: { messageId, userId, reaction },
      select: {
        messageId: true,
        userId: true,
        reaction: true,
        user: { select: { id: true, display_name: true } },
      },
    });

    // Broadcast
    const reactionPayload = {
      messageId: newReaction.messageId,
      userId: newReaction.userId,
      reaction: newReaction.reaction,
      userDisplayName: newReaction.user.display_name,
    };
    io?.to(`room-${roomId}`).emit('reactionAdded', reactionPayload);
    logInfo(`Emitted 'reactionAdded' to room-${roomId}`, reactionPayload);
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      logInfo(
        `addReaction failed: User ${userId} already reacted with ${reaction} on msg ${messageId}`,
      );
      socket.emit('reactionError', {
        messageId,
        reaction,
        error: 'You already added this reaction.',
      });
    } else {
      logError(`Error handling addReaction for msg ${messageId}:`, error);
      socket.emit('reactionError', {
        messageId,
        reaction,
        error: 'Failed to add reaction.',
      });
    }
  }
};

const handleRemoveReaction = async (
  socket: Socket,
  userId: number,
  data: { messageId: number; reaction: string; roomId: number },
) => {
  const { messageId, reaction, roomId } = data;
  logInfo(
    `removeReaction event: msg ${messageId}, reaction ${reaction}, room ${roomId}, user ${userId}`,
  );

  if (!messageId || !reaction || !roomId || userId === undefined) {
    socket.emit('reactionError', {
      messageId,
      reaction,
      error: 'Invalid reaction data.',
    });
    return;
  }

  try {
    // Verify user is in the room (implicit check via deleteMany condition)
    const deleteResult = await prisma.chatMessageReaction.deleteMany({
      where: {
        messageId,
        userId,
        reaction,
        message: { roomId: Number(roomId) },
      },
    });

    if (deleteResult.count > 0) {
      const reactionPayload = {
        messageId,
        userId,
        reaction,
      };
      io?.to(`room-${roomId}`).emit('reactionRemoved', reactionPayload);
      logInfo(`Emitted 'reactionRemoved' to room-${roomId}`, reactionPayload);
    } else {
      logInfo(
        `removeReaction: Reaction not found or not owned by user ${userId}`,
      );
    }
  } catch (error: unknown) {
    logError(`Error handling removeReaction for msg ${messageId}:`, error);
    socket.emit('reactionError', {
      messageId,
      reaction,
      error: 'Failed to remove reaction.',
    });
  }
};

const handleMarkAsRead = async (
  socket: Socket,
  userId: number,
  data:
    | { messageId: number; roomId: number }
    | { messageIds: number[]; roomId: number },
) => {
  const { roomId } = data;
  const messageIds = 'messageId' in data ? [data.messageId] : data.messageIds;
  logInfo(
    `markAsRead event: msgs ${messageIds.join(', ')}, room ${roomId}, user ${userId}`,
  );

  if (
    !roomId ||
    !messageIds ||
    messageIds.length === 0 ||
    userId === undefined
  ) {
    return;
  }

  try {
    // Verify user is in the room
    const participant = await prisma.chatRoomParticipant.findUnique({
      where: { roomId_userId: { roomId: Number(roomId), userId } },
      select: { userId: true },
    });
    if (!participant) {
      logInfo(`markAsRead ignored: User ${userId} not in room ${roomId}`);
      return;
    }

    // Upsert read status
    const upsertPromises = messageIds.map((msgId) =>
      prisma.chatMessageReadStatus.upsert({
        where: { messageId_userId: { messageId: msgId, userId } },
        update: {
          /* readAt updates automatically via @updatedAt */
        },
        create: { messageId: msgId, userId },
        select: { messageId: true, userId: true, readAt: true },
      }),
    );
    const results = await Promise.all(upsertPromises);

    // Broadcast read status update
    const readPayloads = results.map((r) => ({
      messageId: r.messageId,
      userId: r.userId,
      readAt: safeToISOString(r.readAt),
    }));

    if (readPayloads.length > 0) {
      io?.to(`room-${roomId}`).emit('messagesRead', {
        roomId: Number(roomId),
        updates: readPayloads,
      });
      logInfo(`Emitted 'messagesRead' to room-${roomId}`, {
        count: readPayloads.length,
      });
    }
  } catch (error: unknown) {
    logError(`Error handling markAsRead for room ${roomId}:`, error);
  }
};

const handleGetChatRooms = async (socket: Socket, userId: number) => {
  try {
    const rooms = await MessagingService.getUserChatRooms(userId);
    socket.emit('getChatRoomsSuccess', serializeData(rooms));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError('Error getting chat rooms:', error);
    socket.emit('getChatRoomsError', {
      error: message || 'Error getting chat rooms',
    });
  }
};

const handleCreateChatRoom = async (
  socket: Socket,
  userId: number,
  data: {
    name?: string;
    recipients: number[];
    message?: string;
    isPrivate?: boolean;
  },
) => {
  try {
    const result = await MessagingService.createOrFindRoom(userId, data);
    socket.emit('createChatRoomSuccess', serializeData(result));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError('Error creating chat room:', error);
    socket.emit('createChatRoomError', {
      error: message || 'Error creating chat room',
    });
  }
};

const handleGetRoomMessages = async (
  socket: Socket,
  userId: number,
  data: { roomId: number },
) => {
  try {
    const messages = await MessagingService.getRoomMessages(
      userId,
      data.roomId,
    );
    socket.emit('getRoomMessagesSuccess', serializeData(messages));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError('Error getting room messages:', error);
    socket.emit('getRoomMessagesError', {
      error: message || 'Error getting room messages',
    });
  }
};

const handleAddParticipants = async (
  socket: Socket,
  userId: number,
  data: { roomId: number; userIds: number[] },
) => {
  try {
    const result = await MessagingService.addParticipants(userId, data.roomId, {
      userIds: data.userIds,
    });
    socket.emit('addParticipantsSuccess', serializeData(result));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError('Error adding participants:', error);
    socket.emit('addParticipantsError', {
      error: message || 'Error adding participants',
    });
  }
};

const handleManageParticipant = async (
  socket: Socket,
  userId: number,
  data: {
    roomId: number;
    targetUserId: number;
    action: 'promote' | 'demote' | 'updatePermissions';
    canWrite?: boolean;
  },
) => {
  try {
    const result = await MessagingService.manageParticipant(
      userId,
      data.roomId,
      data.targetUserId,
      { action: data.action, canWrite: data.canWrite },
    );
    socket.emit('manageParticipantSuccess', serializeData(result));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError('Error managing participant:', error);
    socket.emit('manageParticipantError', {
      error: message || 'Error managing participant',
    });
  }
};

const handleRemoveParticipant = async (
  socket: Socket,
  userId: number,
  data: { roomId: number; targetUserId: number },
) => {
  try {
    const result = await MessagingService.removeParticipant(
      userId,
      data.roomId,
      data.targetUserId,
    );
    socket.emit('removeParticipantSuccess', serializeData(result));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError('Error removing participant:', error);
    socket.emit('removeParticipantError', {
      error: message || 'Error removing participant',
    });
  }
};

const handleSearchMessages = async (
  socket: Socket,
  userId: number,
  data: {
    roomId: number;
    searchTerm?: string;
    limit?: number;
    offset?: number;
    senderId?: number;
    messageType?: string;
    startDate?: Date;
    endDate?: Date;
  },
) => {
  try {
    const result = await MessagingService.searchMessages(userId, data);
    socket.emit('searchMessagesSuccess', serializeData(result));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError('Error searching messages:', error);
    socket.emit('searchMessagesError', {
      error: message || 'Error searching messages',
    });
  }
};

const handleDisconnect = (socket: Socket, userId: number, reason: string) => {
  logInfo(
    `Socket ${socket.id} disconnected for user ${userId}. Reason: ${reason}`,
  );
  const userSocketSet = userSockets.get(userId);
  if (userSocketSet) {
    userSocketSet.delete(socket.id);
    logInfo(
      `Removed socket ${socket.id} from user ${userId}. Remaining: ${Array.from(userSocketSet)}`,
    );
    if (userSocketSet.size === 0) {
      userSockets.delete(userId);
      logInfo(`User ${userId} has no active sockets. Removed from map.`);
    }
  }
};

async function sendNotifications(
  roomId: number,
  senderId: number,
  message: MessageWithRelationsPayload,
) {
  const participants = await prisma.chatRoomParticipant.findMany({
    where: { roomId, userId: { not: senderId } },
    select: { userId: true },
  });

  const notificationPayload = {
    id: message.id,
    senderId,
    senderName: message.sender.display_name,
    content:
      message.content.substring(0, 50) +
      (message.content.length > 50 ? '...' : ''),
    timestamp: safeToISOString(message.sentAt),
    isRead: false,
    chatRoomId: roomId,
  };

  participants.forEach((p) => {
    const recipientUserId = p.userId;
    logInfo(`Emitting 'newMessageNotification' to user-${recipientUserId}`);
    io?.to(`user-${recipientUserId}`).emit(
      'newMessageNotification',
      notificationPayload,
    );
  });
}

const findUserIdBySocketId = (socketId: string): number | string => {
  let foundUserId: number | string = 'Unknown';
  userSockets.forEach((socketIdSet, uid) => {
    if (socketIdSet.has(socketId)) {
      foundUserId = uid;
    }
  });
  return foundUserId;
};

export const getSocketIO = (): Server | null => {
  if (!io) {
    const globalSocket = (globalThis as GlobalSocketState).__OT_SOCKET_IO__;
    if (globalSocket) {
      io = globalSocket;
      return io;
    }
    logError('Socket.IO has not been initialized!');
    return null;
  }
  return io;
};
