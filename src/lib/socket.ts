import cookie from 'cookie';
import type { Server as HttpServer } from 'http';
import { getToken } from 'next-auth/jwt';
import type { Socket } from 'socket.io';
import { Server } from 'socket.io';

import { Prisma } from '@/lib/prisma-exports';
import {
  isSessionAccountCurrent,
  isSessionAccountStatusAllowed,
} from '@/lib/sessionAccount';
import {
  assertAllianceChatMembership,
  withLockedChatRoom,
} from '@/services/chatRoomGuards';
import {
  MessagingService,
  serializeChatMessage,
} from '@/services/Messaging.service';
import type { ChatSendAcknowledgement, ChatSendPayload } from '@/types/chat';
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
// Typing is deliberately transient and rate-limited per socket/room.
const typingEventAt = new Map<string, number>();
const typingRoomRevision = new WeakMap<Socket, Map<number, number>>();

type GlobalSocketState = typeof globalThis & { __OT_SOCKET_IO__?: Server };

// --- Event Handlers ---
/** Recheck the session identity/status on every packet, including existing sockets. */
export function installSocketAccountGuard(socket: Socket): void {
  socket.use(async (_packet, next) => {
    try {
      const account = (socket.request as { sessionAccount?: unknown })
        .sessionAccount;
      if (
        !(await isSessionAccountCurrent(account)) ||
        !(await isSessionAccountStatusAllowed(
          Number((socket.request as { userId?: number }).userId),
        ))
      ) {
        next(new Error('Invalid session account'));
        socket.disconnect(true);
        return;
      }
      next();
    } catch {
      next(new Error('Authentication error'));
      socket.disconnect(true);
    }
  });
}

const handleConnection = (socket: Socket) => {
  const { userId } = socket.request as { userId?: number };

  if (userId === undefined) {
    logError('Socket connected without userId. Disconnecting.');
    socket.disconnect(true);
    return;
  }

  installSocketAccountGuard(socket);
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
  socket.on('sendMessage', (data, acknowledge) =>
    handleSendMessage(
      socket,
      userId,
      data,
      typeof acknowledge === 'function' ? acknowledge : undefined,
    ),
  );
  socket.on('joinRoom', (roomId) => handleJoinRoom(socket, userId, roomId));
  socket.on('leaveRoom', (roomId) => handleLeaveRoom(socket, userId, roomId));
  socket.on('chatTyping', (data) => handleChatTyping(socket, userId, data));
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type SocketAuthToken = {
  user?: {
    id?: string | number;
  };
};

const hasTokenUserId = (token: unknown): token is SocketAuthToken => {
  if (!isRecord(token) || !isRecord(token.user)) {
    return false;
  }

  return typeof token.user.id === 'string' || typeof token.user.id === 'number';
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

/** Initialize socket. */
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
    destroyUpgrade: false,
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

        const token = await getToken({
          req: minimalReq as unknown as Parameters<typeof getToken>[0]['req'],
          secret: process.env.JWT_SECRET,
        });

        if (!hasTokenUserId(token)) {
          logInfo('Socket Auth: Invalid or missing token/user ID');
          return callback('Invalid token', false);
        }

        if (
          !(await isSessionAccountCurrent(token.user)) ||
          !(await isSessionAccountStatusAllowed(Number(token.user.id)))
        ) {
          return callback('Invalid session account', false);
        }

        (req as { userId?: number }).userId = Number(token.user.id);
        (req as { sessionAccount?: unknown }).sessionAccount = token.user;
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

export const handleSendMessage = async (
  socket: Socket,
  userId: number,
  data: Partial<ChatSendPayload> & { tempId?: number },
  acknowledge?: (result: ChatSendAcknowledgement) => void,
) => {
  let saved: Awaited<ReturnType<typeof MessagingService.sendMessageRealtime>>;
  try {
    if (
      !(await rateLimiter(`sendMessage-${userId}`, {
        windowMs: 10000,
        max: 10,
      }))
    ) {
      acknowledge?.({ ok: false, error: 'RATE_LIMITED' });
      socket.emit('messageError', {
        tempId: data?.tempId,
        clientMessageId: data?.clientMessageId,
        error: 'You are sending messages too quickly.',
      });
      return;
    }
    saved = await MessagingService.sendMessageRealtime(userId, {
      roomId: data?.roomId,
      content: data?.content,
      richContent: data?.richContent,
      clientMessageId: data?.clientMessageId,
      replyToMessageId: data?.replyToMessageId,
      messageType: data?.messageType,
      sharedAttackLogId: data?.sharedAttackLogId,
    });
  } catch (error) {
    logError('Failed to save chat message', {
      userId,
      roomId: data?.roomId,
      error,
    });
    acknowledge?.({ ok: false, error: 'REJECTED' });
    socket.emit('messageError', {
      tempId: data?.tempId,
      clientMessageId: data?.clientMessageId,
      error: 'Could not send message.',
    });
    return;
  }

  // Confirm durable storage before presence lookups or notification fan-out.
  const message = serializeChatMessage(saved);
  acknowledge?.({ ok: true, message });
  const payload = { ...message, tempId: data?.tempId };
  socket.emit('receiveMessage', payload);
  if (saved.deduplicated) return;
  try {
    socket.to(`room-${saved.roomId}`).emit('receiveMessage', payload);
    await sendNotifications(saved.roomId, userId, saved);
  } catch (error) {
    // A notification failure must never turn a committed message into a failed send.
    logError('Chat message saved but notification delivery failed', {
      messageId: saved.id,
      error,
    });
  }
};

export const handleJoinRoom = async (
  socket: Socket,
  userId: number,
  roomId: unknown,
) => {
  const numericRoomId = Number(roomId);
  if (!Number.isSafeInteger(numericRoomId) || numericRoomId <= 0) {
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
    await withLockedChatRoom(numericRoomId, async (tx) => {
      const room = await tx.chatRoom.findUnique({
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

      // Every room, not only alliance rooms, requires a participant row before join.
      const participant = await tx.chatRoomParticipant.findUnique({
        where: { roomId_userId: { roomId: numericRoomId, userId } },
        select: { id: true },
      });
      if (!participant) {
        logInfo(
          `<<< SERVER >>> User ${userId} denied joining room ${numericRoomId}: not a participant`,
        );
        socket.emit('joinRoomError', {
          roomId: numericRoomId,
          error: 'You are not a participant in this chat room.',
        });
        return;
      }

      // Alliance room check
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
      await socket.join(roomChannel);
      // Confirm join and check adapter rooms
      const adapterRooms = io?.sockets.adapter.rooms.get(roomChannel);
      logInfo(
        `<<< SERVER >>> Socket ${socket.id} (User ${userId}) attempted join on ${roomChannel}. Sockets in room now: ${adapterRooms ? Array.from(adapterRooms) : 'None'}`,
      );
      socket.emit('joinedRoom', { roomId: numericRoomId });
    });
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
    const revisions =
      typingRoomRevision.get(socket) ?? new Map<number, number>();
    revisions.set(Number(roomId), (revisions.get(Number(roomId)) ?? 0) + 1);
    typingRoomRevision.set(socket, revisions);
    const roomChannel = `room-${Number(roomId)}`;
    if (socket.rooms.has(roomChannel)) {
      socket.to(roomChannel).emit('chatTypingUpdate', {
        roomId: Number(roomId),
        userId,
        displayName: '',
        isTyping: false,
      });
    }
    typingEventAt.delete(`${socket.id}:${Number(roomId)}:start`);
    typingEventAt.delete(`${socket.id}:${Number(roomId)}:stop`);
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

export const handleChatTyping = async (
  socket: Socket,
  userId: number,
  data: unknown,
) => {
  if (!isRecord(data)) return;
  const roomId = Number(data.roomId);
  if (
    !Number.isSafeInteger(roomId) ||
    roomId <= 0 ||
    typeof data.isTyping !== 'boolean'
  )
    return;
  const roomChannel = `room-${roomId}`;
  // A socket must have completed the authorized join handshake for this room.
  if (!socket.rooms.has(roomChannel)) return;

  const revision = typingRoomRevision.get(socket)?.get(roomId) ?? 0;
  const key = `${socket.id}:${roomId}:${data.isTyping ? 'start' : 'stop'}`;
  const now = Date.now();
  const previous = typingEventAt.get(key) ?? 0;
  if (now - previous < (data.isTyping ? 1200 : 250)) return;
  typingEventAt.set(key, now);

  try {
    const displayName = await withLockedChatRoom(roomId, async (tx) => {
      const participant = await tx.chatRoomParticipant.findUnique({
        where: { roomId_userId: { roomId, userId } },
        select: { canWrite: true, user: { select: { display_name: true } } },
      });
      if (!participant?.canWrite) return null;
      await assertAllianceChatMembership(tx, userId, roomId);
      return participant.user.display_name;
    });
    if (
      displayName === null ||
      !socket.connected ||
      !socket.rooms.has(roomChannel) ||
      (typingRoomRevision.get(socket)?.get(roomId) ?? 0) !== revision
    )
      return;
    socket.to(roomChannel).emit('chatTypingUpdate', {
      roomId,
      userId,
      displayName,
      isTyping: data.isTyping,
    });
  } catch (error) {
    logError('Failed to authorize chat typing event', {
      userId,
      roomId,
      error,
    });
  }
};

const handleAddReaction = async (
  socket: Socket,
  userId: number,
  data: { messageId: number; reaction: string; roomId: number },
) => {
  if (
    !(await rateLimiter(`addReaction-${userId}`, { windowMs: 10000, max: 20 }))
  ) {
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
    await withLockedChatRoom(Number(roomId), async (tx) => {
      await assertAllianceChatMembership(tx, userId, Number(roomId));
      // Verify user is in the room & message exists
      const message = await tx.chatMessage.findFirst({
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
      const newReaction = await tx.chatMessageReaction.create({
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
    });
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
    await withLockedChatRoom(Number(roomId), async (tx) => {
      await assertAllianceChatMembership(tx, userId, Number(roomId));
      // Verify user is in the room (implicit check via deleteMany condition)
      const deleteResult = await tx.chatMessageReaction.deleteMany({
        where: {
          messageId,
          userId,
          reaction,
          message: {
            roomId: Number(roomId),
            room: { participants: { some: { userId } } },
          },
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
    });
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
  logInfo(`markAsRead event: room ${roomId}, user ${userId}`);

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

    const { receipts: results } = await MessagingService.markMessagesAsRead(
      userId,
      { messageIds },
      Number(roomId),
    );

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
    evictUserFromChatRoom(Number(data.targetUserId), Number(data.roomId));
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
  for (const key of typingEventAt.keys()) {
    if (key.startsWith(`${socket.id}:`)) typingEventAt.delete(key);
  }
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

/** Server instance without logging when it is absent (tests, scripts). */
const resolveSocketServer = (): Server | null =>
  io ?? (globalThis as GlobalSocketState).__OT_SOCKET_IO__ ?? null;

/**
 * Removes every socket of a user from a chat room channel. Joining checks
 * membership, so after a removal or leave the user's open sockets must be
 * taken out of the channel explicitly or they keep receiving live messages.
 * Every socket of a user is in `user-<id>`, which also covers other nodes when
 * an adapter is configured.
 */
export const evictUserFromChatRoom = (userId: number, roomId: number): void => {
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(roomId)) return;
  const server = resolveSocketServer();
  if (!server) return;
  try {
    server.in(`user-${userId}`).socketsLeave(`room-${roomId}`);
  } catch (error: unknown) {
    logError('Failed to remove user sockets from chat room', {
      userId,
      roomId,
      error,
    });
  }
};

/** Removes a former alliance member's sockets from that alliance's chat rooms. */
export const evictUserFromAllianceChatRooms = async (
  userId: number,
  allianceId: number,
): Promise<void> => {
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: { allianceId },
      select: { id: true },
    });
    rooms.forEach((room) => evictUserFromChatRoom(userId, room.id));
  } catch (error: unknown) {
    logError('Failed to remove user sockets from alliance chat rooms', {
      userId,
      allianceId,
      error,
    });
  }
};

/** Returns socket io for callers that need normalized game data. */
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
