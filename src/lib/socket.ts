import { getUpdatedStatus } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import prisma from './prisma';
import { getToken } from 'next-auth/jwt';
import cookie from 'cookie';
import md5 from 'md5';
import { logError, logInfo } from '@/utils/logger';
import { ChatMessage, Prisma } from '@prisma/client'; // Added for types

let io: Server | null = null;
// Store mapping of userId to a Set of socketIds
const userSockets = new Map<number, Set<string>>();

// Helper to serialize potentially complex message objects including BigInts
const serializeData = (data: any): any => {
  return JSON.parse(JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
};

// Define the payload type for messages including relations
type MessageWithRelationsPayload = Prisma.ChatMessageGetPayload<{
  include: {
    sender: { select: { id: true, display_name: true, avatar: true, last_active: true } },
    replyToMessage: { select: { id: true, content: true, sender: { select: { id: true, display_name: true } } } },
    sharedAttackLog: { select: { id: true, attacker_id: true, defender_id: true, winner: true, timestamp: true } },
    reactions: { select: { userId: true, reaction: true, user: { select: { id: true, display_name: true } } } },
    readBy: { select: { userId: true, readAt: true, user: { select: { id: true, display_name: true } } } }
    // Add other shared log includes here if needed
  }
}>;


export const initializeSocket = (httpServer: HttpServer) => {
  if (io) {
    logInfo('Socket.IO already initialized');
    return io;
  }

  logInfo('Initializing Socket.IO...');
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_SOCKET_IO_ORIGIN || '*', // More permissive for dev if needed
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: '/socket.io',
    allowRequest: async (req, callback) => {
      try {
        const cookies = cookie.parse(req.headers.cookie || '');
        const sessionTokenCookie = cookies['next-auth.session-token'] || cookies['__Secure-next-auth.session-token'];

        if (!sessionTokenCookie) {
          return callback('No session token', false);
        }

        const minimalReq = {
          headers: req.headers,
          cookies: {
            'next-auth.session-token': sessionTokenCookie,
            '__Secure-next-auth.session-token': sessionTokenCookie
          }
        };

        const token = await getToken({ req: minimalReq as any, secret: process.env.JWT_SECRET });

        if (!token || !token.user?.id) {
          logInfo('Socket Auth: Invalid or missing token/user ID');
          return callback('Invalid token', false);
        }

        (req as any).userId = Number(token.user.id);
        logInfo(`Socket Auth: User ${token.user.id} authorized.`);
        callback(null, true);
      } catch (err: any) {
        logInfo('Socket Auth Error:', err.message);
        return callback('Authentication error', false);
      }
    }
  });


  io.on('connection', (socket: Socket) => {
    const userId: number | undefined = (socket.request as any).userId;

    if (userId === undefined) {
      logError('Socket connected without userId. Disconnecting.');
      socket.disconnect(true);
      return;
    }

    logInfo(`Socket ${socket.id} connected for user ${userId}`);

    // Join user-specific room
    socket.join(`user-${userId}`);
    logInfo(`Socket ${socket.id} joined room user-${userId}`);

    // Track user sockets
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)?.add(socket.id);
    logInfo(`User ${userId} has sockets: ${Array.from(userSockets.get(userId) || [])}`);


    // --- User Data Request ---
    socket.on('requestUserData', async () => {
      logInfo(`Fetching data for user: ${userId}`);
      if (isNaN(userId)) {
        logError('Invalid userId:', userId);
        return;
      }
      try {
        const user = await prisma.users.findUnique({
          where: { id: userId },
          include: {
            permissions: true,
            user_units: true,
            user_items: true,
            user_battle_upgrades: true,
            user_structure_upgrades: true,
           },
        });

        if (!user) {
          socket.emit('userDataError', { error: 'User not found' });
          return;
        }

        // Update last active if needed
        const now = new Date();
        const timeSinceLastActive = user.last_active ? now.getTime() - new Date(user.last_active).getTime() : Infinity;
        if (timeSinceLastActive > 10 * 60 * 1000) {
          logInfo('Updating last active for user:', userId);
          await prisma.users.update({
            where: { id: userId },
            data: { last_active: now },
          });
          user.last_active = now; // Update in-memory object too
        }

        const currentStatus = await getUpdatedStatus(user.id);

        if (["BANNED", "SUSPENDED", "CLOSED", "TIMEOUT"].includes(currentStatus)) {
          socket.emit('userDataError', { error: `Account is in ${currentStatus.toLowerCase()} status` });
          return;
        }
        if (currentStatus === "VACATION") {
          socket.emit('userVacation', serializeData({ ...user, currentStatus }));
          return;
        }

        // Check recent attacks since last active
        const lastActiveTimestamp = user.last_active || new Date(0); // Use epoch if never active
        const attacks = await prisma.attack_log.findMany({
          where: {
            defender_id: user.id,
            timestamp: { gte: lastActiveTimestamp },
          },
        });

        // Get attack/defense stats
        const [wonAttacks, wonDefends, totalAttacks, totalDefends] = await Promise.all([
          prisma.attack_log.count({ where: { attacker_id: user.id, winner: user.id } }),
          prisma.attack_log.count({ where: { defender_id: user.id, winner: user.id } }),
          prisma.attack_log.count({ where: { attacker_id: user.id } }),
          prisma.attack_log.count({ where: { defender_id: user.id } }),
        ]);

        const userData: any = {
          ...user,
          beenAttacked: attacks.some((attack) => attack.type === 'attack'),
          detectedSpy: attacks.some((attack) => attack.type !== 'attack' && attack.winner === user.id),
          won_attacks: wonAttacks,
          won_defends: wonDefends,
          totalAttacks: totalAttacks,
          totalDefends: totalDefends,
          currentStatus: currentStatus,
        };

        socket.emit('userData', serializeData(userData)); // Use serializeData
      } catch (error) {
        logError('Error fetching user data:', error);
        socket.emit('userDataError', { error: 'Internal server error while fetching user data.' });
      }
    });

    // --- Send Message Handling (Rewritten for Clarity and ACL Fix) ---
    socket.on('sendMessage', async (data: {
      roomId: number;
      content: string;
      tempId?: number;
      replyToMessageId?: number;
      messageType?: string;
      sharedAttackLogId?: number;
    }) => {
      const { roomId, content, replyToMessageId, messageType = 'TEXT', sharedAttackLogId } = data;
      logInfo(`sendMessage event received for room ${roomId} from user ${userId}`, data);

      if (!roomId || !content || userId === undefined) {
        logInfo('sendMessage failed: Missing required data or userId');
        socket.emit('messageError', { tempId: data.tempId, error: 'Invalid message data' });
        return;
      }

      try {
        // 1. Verify participant and permissions
        const participant = await prisma.chatRoomParticipant.findUnique({
          where: { roomId_userId: { roomId: Number(roomId), userId: userId } },
          include: { room: { select: { allianceId: true } } }
        });

        if (!participant || !participant.canWrite) {
          logInfo(`sendMessage failed: User ${userId} cannot write or not in room ${roomId}`);
          socket.emit('messageError', { tempId: data.tempId, error: 'Cannot send message in this room.' });
          return;
        }

        // 1b. Alliance room check
        if (participant.room.allianceId) {
          const membership = await prisma.alliance_memberships.findUnique({
            where: { unique_alliance_user: { alliance_id: participant.room.allianceId, user_id: userId } }
          });
          if (!membership) {
            logInfo(`sendMessage failed: User ${userId} not member of alliance ${participant.room.allianceId}`);
            socket.emit('messageError', { tempId: data.tempId, error: 'Not an alliance member.' });
            return;
          }
        }

        // 2. Validate ReplyToMessageId
        let validReplyToId: number | null = null;
        if (replyToMessageId) {
          const repliedTo = await prisma.chatMessage.findUnique({ where: { id: replyToMessageId, roomId: Number(roomId) } });
          if (!repliedTo) {
            logInfo(`sendMessage failed: replyToMessageId ${replyToMessageId} invalid`);
            socket.emit('messageError', { tempId: data.tempId, error: 'Cannot reply to this message.' });
            return;
          }
          validReplyToId = repliedTo.id;
        }

        // 3. Validate Shared Log ID and Permissions
        let validSharedAttackLogId: number | null = null;
        if (messageType === 'ATTACK_LOG_SHARE' && sharedAttackLogId) {
          const log = await prisma.attack_log.findUnique({
            where: { id: sharedAttackLogId },
            select: { id: true, attacker_id: true, defender_id: true, acl: { select: { shared_with_user_id: true, shared_with_alliance_id: true } } }
          });
          if (!log) {
            socket.emit('messageError', { tempId: data.tempId, error: 'Attack log not found.' }); return;
          }
          // Check Permissions
          const canShare = await checkLogSharePermission(userId, log);
          if (!canShare) {
            socket.emit('messageError', { tempId: data.tempId, error: 'No permission to share this log.' }); return;
          }
          validSharedAttackLogId = log.id;
          logInfo(`User ${userId} has permission to share attack log ${sharedAttackLogId}`);
        } else if (messageType !== 'TEXT') {
          socket.emit('messageError', { tempId: data.tempId, error: 'Unsupported message type.' }); return;
        }

        // 4. Create the message in the database
        const newMessage = await prisma.chatMessage.create({
          data: {
            roomId: Number(roomId),
            senderId: userId,
            content: content,
            messageType: messageType,
            replyToMessageId: validReplyToId,
            sharedAttackLogId: validSharedAttackLogId,
          },
          include: { // Include all necessary relations for broadcast payload
            sender: { select: { id: true, display_name: true, avatar: true, last_active: true } },
            replyToMessage: { select: { id: true, content: true, sender: { select: { id: true, display_name: true } } } },
            sharedAttackLog: { select: { id: true, attacker_id: true, defender_id: true, winner: true, timestamp: true } },
            reactions: { select: { userId: true, reaction: true, user: { select: { id: true, display_name: true } } } },
            readBy: { select: { userId: true, readAt: true, user: { select: { id: true, display_name: true } } } }
          },
        });

        // 5. Update room timestamp
        await prisma.chatRoom.update({
          where: { id: Number(roomId) },
          data: { updatedAt: new Date() },
        });

        // 6. Grant ACL access if sharing a log
        if (newMessage.messageType === 'ATTACK_LOG_SHARE' && newMessage.sharedAttackLogId) {
          await grantAclToParticipants(newMessage.sharedAttackLogId, Number(roomId), userId);
        }

        // 7. Prepare and Broadcast Payload
        const messagePayload = { ...serializeData(newMessage), tempId: data.tempId };
        const roomChannel = `room-${roomId}`;

        // Log sockets before emitting
        const socketsInRoom = await io.in(roomChannel).fetchSockets();
        logInfo(`<<< SERVER >>> Sockets currently in ${roomChannel} before emit:`, socketsInRoom.map(s => `${s.id} (User: ${findUserIdBySocketId(s.id)})`));

        io.to(roomChannel).emit('receiveMessage', messagePayload);
        logInfo(`<<< SERVER >>> Emitted 'receiveMessage' to ${roomChannel}`);

        // 8. Emit Notifications
        await sendNotifications(Number(roomId), userId, newMessage);

      } catch (error) {
        logError(`Error handling sendMessage for room ${roomId}:`, error);
        socket.emit('messageError', { tempId: data.tempId, error: 'Failed to send message.' });
      }
    });


    // --- Client joining a specific chat room ---
    socket.on('joinRoom', async (roomId) => {
      const numericRoomId = Number(roomId);
      if (isNaN(numericRoomId)) {
         logError(`<<< SERVER >>> Invalid roomId for joinRoom from Socket ${socket.id}: ${roomId}`);
         socket.emit('joinRoomError', { roomId: roomId, error: 'Invalid room ID format.' });
         return;
      }

      try {
        const room = await prisma.chatRoom.findUnique({
          where: { id: numericRoomId },
          select: { id: true, allianceId: true }
        });

        if (!room) {
          logError(`<<< SERVER >>> Room ${numericRoomId} not found for joinRoom User ${userId}`);
          socket.emit('joinRoomError', { roomId: numericRoomId, error: 'Room not found.' });
          return;
        }

        // Alliance room check
        if (room.allianceId) {
           const membership = await prisma.alliance_memberships.findUnique({
             where: { unique_alliance_user: { alliance_id: room.allianceId, user_id: userId } }
           });
           if (!membership) {
             logInfo(`<<< SERVER >>> User ${userId} denied joining alliance room ${numericRoomId}`);
             socket.emit('joinRoomError', { roomId: numericRoomId, error: 'You are not a member of the alliance for this chat.' });
             return;
           }
        }

        const roomChannel = `room-${numericRoomId}`;
        socket.join(roomChannel);
        // Confirm join and check adapter rooms
        const adapterRooms = io.sockets.adapter.rooms.get(roomChannel);
        logInfo(`<<< SERVER >>> Socket ${socket.id} (User ${userId}) attempted join on ${roomChannel}. Sockets in room now: ${adapterRooms ? Array.from(adapterRooms) : 'None'}`);
        socket.emit('joinedRoom', { roomId: numericRoomId });

      } catch (error) {
        logError(`<<< SERVER >>> Error during joinRoom User ${userId}, Room ${numericRoomId}:`, error);
        socket.emit('joinRoomError', { roomId: numericRoomId, error: 'Server error joining room.' });
      }
    });

    // --- Client leaving a specific chat room ---
    socket.on('leaveRoom', (roomId) => {
      if (typeof roomId === 'number' || (typeof roomId === 'string' && !isNaN(Number(roomId)))) {
        const roomChannel = `room-${Number(roomId)}`;
        socket.leave(roomChannel);
        logInfo(`<<< SERVER >>> Socket ${socket.id} (User ${userId}) left ${roomChannel}`);
      } else {
        logError(`<<< SERVER >>> Invalid roomId for leaveRoom from Socket ${socket.id}: ${roomId}`);
      }
    });

    // --- Reaction Handling ---
    socket.on('addReaction', async (data: { messageId: number; reaction: string; roomId: number }) => {
      const { messageId, reaction, roomId } = data;
      logInfo(`addReaction event: msg ${messageId}, reaction ${reaction}, room ${roomId}, user ${userId}`);

      if (!messageId || !reaction || !roomId || userId === undefined) {
        socket.emit('reactionError', { messageId, reaction, error: 'Invalid reaction data.' }); return;
      }

      try {
        // Verify user is in the room & message exists
        const message = await prisma.chatMessage.findFirst({
          where: { id: messageId, roomId: Number(roomId), room: { participants: { some: { userId: userId } } } },
          select: { id: true }
        });
        if (!message) {
          logInfo(`addReaction failed: Message ${messageId} not found in room ${roomId} or user ${userId} not participant.`);
          socket.emit('reactionError', { messageId, reaction, error: 'Message not found or you are not in this room.' }); return;
        }

        // Create reaction
        const newReaction = await prisma.chatMessageReaction.create({
          data: { messageId: messageId, userId: userId, reaction: reaction },
          select: { messageId: true, userId: true, reaction: true, user: { select: { id: true, display_name: true } } }
        });

        // Broadcast
        const reactionPayload = {
          messageId: newReaction.messageId,
          userId: newReaction.userId,
          reaction: newReaction.reaction,
          userDisplayName: newReaction.user.display_name,
        };
        io.to(`room-${roomId}`).emit('reactionAdded', reactionPayload);
        logInfo(`Emitted 'reactionAdded' to room-${roomId}`, reactionPayload);

      } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          logInfo(`addReaction failed: User ${userId} already reacted with ${reaction} on msg ${messageId}`);
          socket.emit('reactionError', { messageId, reaction, error: 'You already added this reaction.' });
        } else {
          logError(`Error handling addReaction for msg ${messageId}:`, error);
          socket.emit('reactionError', { messageId, reaction, error: 'Failed to add reaction.' });
        }
      }
    });

    socket.on('removeReaction', async (data: { messageId: number; reaction: string; roomId: number }) => {
      const { messageId, reaction, roomId } = data;
      logInfo(`removeReaction event: msg ${messageId}, reaction ${reaction}, room ${roomId}, user ${userId}`);

      if (!messageId || !reaction || !roomId || userId === undefined) {
        socket.emit('reactionError', { messageId, reaction, error: 'Invalid reaction data.' }); return;
      }

      try {
        // Verify user is in the room (implicit check via deleteMany condition)
        const deleteResult = await prisma.chatMessageReaction.deleteMany({
          where: { messageId: messageId, userId: userId, reaction: reaction, message: { roomId: Number(roomId) } },
        });

        if (deleteResult.count > 0) {
          const reactionPayload = { messageId: messageId, userId: userId, reaction: reaction };
          io.to(`room-${roomId}`).emit('reactionRemoved', reactionPayload);
          logInfo(`Emitted 'reactionRemoved' to room-${roomId}`, reactionPayload);
        } else {
           logInfo(`removeReaction: Reaction not found or not owned by user ${userId}`);
        }
      } catch (error) {
        logError(`Error handling removeReaction for msg ${messageId}:`, error);
        socket.emit('reactionError', { messageId, reaction, error: 'Failed to remove reaction.' });
      }
    });

    // --- Read Receipt Handling ---
    socket.on('markAsRead', async (data: { messageId: number; roomId: number } | { messageIds: number[]; roomId: number }) => {
      const { roomId } = data;
      const messageIds = 'messageId' in data ? [data.messageId] : data.messageIds;
      logInfo(`markAsRead event: msgs ${messageIds.join(', ')}, room ${roomId}, user ${userId}`);

      if (!roomId || !messageIds || messageIds.length === 0 || userId === undefined) { return; }

      try {
        // Verify user is in the room
        const participant = await prisma.chatRoomParticipant.findUnique({
          where: { roomId_userId: { roomId: Number(roomId), userId: userId } }, select: { userId: true }
        });
        if (!participant) { logInfo(`markAsRead ignored: User ${userId} not in room ${roomId}`); return; }

        // Upsert read status
        const upsertPromises = messageIds.map(msgId =>
          prisma.chatMessageReadStatus.upsert({
            where: { messageId_userId: { messageId: msgId, userId: userId } },
            update: { /* readAt updates automatically via @updatedAt */ },
            create: { messageId: msgId, userId: userId },
            select: { messageId: true, userId: true, readAt: true }
          })
        );
        const results = await Promise.all(upsertPromises);

        // Broadcast read status update
        const readPayloads = results.map(r => ({
          messageId: r.messageId,
          userId: r.userId,
          readAt: r.readAt.toISOString(),
        }));

        if (readPayloads.length > 0) {
          io.to(`room-${roomId}`).emit('messagesRead', { roomId: Number(roomId), updates: readPayloads });
          logInfo(`Emitted 'messagesRead' to room-${roomId}`, { count: readPayloads.length });
        }
      } catch (error) {
        logError(`Error handling markAsRead for room ${roomId}:`, error);
      }
    });

    // --- Other Event Handlers ---
    socket.on('notifyAttack', async ({ battleId, defenderId }) => {
      const message = `You were attacked in battle ${battleId}`;
      const hash = md5(message + battleId + defenderId);
      io.to(`user-${defenderId}`).emit('attackNotification', { message, hash });
    });

    socket.on('notifyFriendRequest', async ({ userId: targetUserId, message }) => {
      const hash = md5(message + targetUserId);
      io.to(`user-${targetUserId}`).emit('friendRequestNotification', { message, hash });
    });

    socket.on('notifyEnemyDeclaration', async ({ userId: targetUserId, message }) => {
      const hash = md5(message + targetUserId);
      io.to(`user-${targetUserId}`).emit('enemyDeclarationNotification', { message, hash });
    });

    socket.on('alertNotification', (alert) => {
      logInfo('Received alert notification:', alert);
      io.emit('alertNotification', alert); // Broadcast to all
    });

    socket.on('ping', ({ userId: targetUserId }) => {
      logInfo('Ping received for user:', targetUserId);
      io.to(`user-${targetUserId}`).emit('pong');
    });

    // --- Disconnection Handling ---
    socket.on('disconnect', (reason) => {
      logInfo(`Socket ${socket.id} disconnected for user ${userId}. Reason: ${reason}`);
      const userSocketSet = userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        logInfo(`Removed socket ${socket.id} from user ${userId}. Remaining: ${Array.from(userSocketSet)}`);
        if (userSocketSet.size === 0) {
          userSockets.delete(userId);
          logInfo(`User ${userId} has no active sockets. Removed from map.`);
        }
      }
    });

  }); // End of io.on('connection')

  logInfo('Socket.IO initialized successfully');
  return io;
}; // End of initializeSocket

// --- Helper Functions ---

// Helper to check log sharing permission
async function checkLogSharePermission(userId: number, log: { id: number, attacker_id: number, defender_id: number, acl: { shared_with_user_id: number | null, shared_with_alliance_id: number | null }[] }): Promise<boolean> {
  if (log.attacker_id === userId || log.defender_id === userId) return true;
  if (log.acl.some(acl => acl.shared_with_user_id === userId)) return true;

  const userAllianceIds = (await prisma.alliance_memberships.findMany({
    where: { user_id: userId }, select: { alliance_id: true }
  })).map(m => m.alliance_id);
  if (log.acl.some(acl => acl.shared_with_alliance_id && userAllianceIds.includes(acl.shared_with_alliance_id))) return true;

  return false;
}

// Helper to grant ACL to participants
async function grantAclToParticipants(logId: number, roomId: number, senderId: number) {
  logInfo(`[ACL Grant] Attempting grant for log ${logId}, room ${roomId}, sender ${senderId}`);
  try {
    const recipientParticipants = await prisma.chatRoomParticipant.findMany({
      where: { roomId: roomId, userId: { not: senderId } },
      select: { userId: true }
    });
    logInfo(`[ACL Grant] Found recipients: ${JSON.stringify(recipientParticipants.map(p => p.userId))}`);

    if (recipientParticipants.length === 0) {
      logInfo(`[ACL Grant] No recipients found for room ${roomId} (excluding sender ${senderId}). Skipping ACL creation.`);
      return;
    }

    const aclDataToCreate = recipientParticipants.map(p => ({
      attack_log_id: logId,
      shared_with_user_id: p.userId
    }));
    logInfo(`[ACL Grant] Prepared ACL data: ${JSON.stringify(aclDataToCreate)}`);

    const createdAcls = await prisma.attack_log_acl.createMany({
      data: aclDataToCreate,
      skipDuplicates: true,
    });
    logInfo(`[ACL Grant] Successfully created ${createdAcls.count} ACL entries for shared log ${logId} in room ${roomId}`);

  } catch (aclError) {
    logError(`[ACL Grant] FAILED to create ACL entries for shared log ${logId} in room ${roomId}:`, aclError);
  }
}

// Helper to send notifications
async function sendNotifications(roomId: number, senderId: number, message: MessageWithRelationsPayload) {
   const participants = await prisma.chatRoomParticipant.findMany({
     where: { roomId: roomId, userId: { not: senderId } },
     select: { userId: true },
   });

   const notificationPayload = {
     id: message.id,
     senderId: senderId,
     senderName: message.sender.display_name,
     content: message.content.substring(0, 50) + (message.content.length > 50 ? '...' : ''),
     timestamp: message.sentAt.toISOString(),
     isRead: false,
     chatRoomId: roomId,
   };

   participants.forEach((p) => {
     const recipientUserId = p.userId;
     logInfo(`Emitting 'newMessageNotification' to user-${recipientUserId}`);
     io?.to(`user-${recipientUserId}`).emit('newMessageNotification', notificationPayload); // Use optional chaining for io
   });
}

// Helper function to find userId from socketId using the userSockets map
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
    logError('Socket.IO has not been initialized!');
    return null;
  }
  return io;
};