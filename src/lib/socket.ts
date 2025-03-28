import { getUpdatedStatus } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io'; // Import Socket type
import prisma from './prisma';
import { getToken } from 'next-auth/jwt';
import cookie from 'cookie';
import md5 from 'md5';
import { logError, logInfo } from '@/utils/logger';

let io: Server | null = null;
// Store mapping of userId to a Set of socketIds
const userSockets = new Map<number, Set<string>>();

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
        // Ensure consistent cookie name (check your [...nextauth].ts)
        const sessionTokenCookie = cookies['next-auth.session-token'] || cookies['__Secure-next-auth.session-token'];

        if (!sessionTokenCookie) {
          logInfo('Socket Auth: No session token cookie found');
          return callback('No session token', false);
        }

        // Reconstruct a minimal request object for getToken
        const minimalReq = {
          headers: req.headers, // Pass headers for potential processing within getToken
          cookies: { // Pass parsed cookies
            'next-auth.session-token': sessionTokenCookie,
            // Include secure cookie name if applicable
            '__Secure-next-auth.session-token': sessionTokenCookie
          }
        };

        const token = await getToken({ req: minimalReq as any, secret: process.env.JWT_SECRET });

        if (!token || !token.user?.id) {
          logInfo('Socket Auth: Invalid or missing token/user ID');
          return callback('Invalid token', false);
        }

        // Attach userId to the underlying socket object for later retrieval
        (req as any).userId = Number(token.user.id);
        logInfo(`Socket Auth: User ${token.user.id} authorized.`);
        callback(null, true);
      } catch (err: any) {
        logInfo('Socket Auth Error:', err.message);
        return callback('Authentication error', false);
      }
    }
  });


  io.on('connection', (socket: Socket) => { // Type the socket parameter
    const userId: number | undefined = (socket.request as any).userId; // Retrieve userId attached in allowRequest

    if (userId === undefined) {
      logError('Socket connected without userId. Disconnecting.');
      socket.disconnect(true);
      return;
    }

    logInfo(`Socket ${socket.id} connected for user ${userId}`);

    // Join a room specific to the user for direct notifications
    socket.join(`user-${userId}`);
    logInfo(`Socket ${socket.id} joined room user-${userId}`);

    // Add socket ID to the user's set
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
          include: { permissions: true },
        });

        if (!user) {
          // Emit error specifically to the requesting socket
          socket.emit('userDataError', { error: 'User not found' });
          return;
        }

        // ... (rest of the user data fetching logic remains the same) ...
        const now = new Date();
        const timeSinceLastActive = now.getTime() - new Date(user.last_active).getTime();
        if (timeSinceLastActive > 10 * 60 * 1000) {
          logInfo('Updating last active for user:', userId);
          await prisma.users.update({
            where: { id: userId },
            data: { last_active: now },
          });
        }

        const currentStatus = await getUpdatedStatus(user.id);

        if (['BANNED', 'SUSPENDED', 'CLOSED', 'TIMEOUT', 'VACATION'].includes(currentStatus)) {
          socket.emit('userDataError', { error: `Account is ${currentStatus.toLowerCase()}` });
          return;
        }

        const lastActiveTimestamp = new Date(user.last_active);
        const attacks = await prisma.attack_log.findMany({
          where: {
            defender_id: user.id,
            timestamp: { gte: lastActiveTimestamp },
          },
        });

        const userData: any = {
          ...user,
          beenAttacked: attacks.some((attack) => attack.type === 'attack'),
          detectedSpy: attacks.some((attack) => attack.type !== 'attack' && attack.winner === user.id),
          won_attacks: 0,
          won_defends: 0,
          totalAttacks: 0,
          totalDefends: 0,
          currentStatus: '',
        };

        const [wonAttacks, wonDefends, totalAttacks, totalDefends] = await Promise.all([
          prisma.attack_log.count({ where: { attacker_id: user.id, winner: user.id } }),
          prisma.attack_log.count({ where: { defender_id: user.id, winner: user.id } }),
          prisma.attack_log.count({ where: { attacker_id: user.id } }),
          prisma.attack_log.count({ where: { defender_id: user.id } }),
        ]);

        userData.won_attacks = wonAttacks;
        userData.won_defends = wonDefends;
        userData.totalAttacks = totalAttacks;
        userData.totalDefends = totalDefends;
        userData.currentStatus = currentStatus;
        // Emit data specifically back to the requesting socket
        socket.emit('userData', stringifyObj(userData as any));
      } catch (error) {
        logError('Error fetching user data:', error);
        socket.emit('userDataError', { error: 'Internal server error while fetching user data.' });
      }
    });

    // --- Send Message Handling ---
    socket.on('sendMessage', async (data: { roomId: number; content: string; tempId?: number }) => {
      const { roomId, content } = data;
      logInfo(`sendMessage event received for room ${roomId} from user ${userId}`);

      if (!roomId || !content || userId === undefined) {
        logInfo('sendMessage failed: Missing data or userId');
        socket.emit('messageError', { error: 'Invalid message data' });
        return;
      }

      try {
        // 1. Verify user is part of the room
        const participant = await prisma.chatRoomParticipant.findUnique({
          where: { roomId_userId: { roomId: Number(roomId), userId: userId } },
          select: { canWrite: true },
        });

        if (!participant) {
          logInfo(`sendMessage failed: User ${userId} not in room ${roomId}`);
          socket.emit('messageError', { error: 'You are not a participant of this room.' });
          return;
        }

        if (!participant.canWrite) {
          logInfo(`sendMessage failed: User ${userId} cannot write in room ${roomId}`);
          socket.emit('messageError', { error: 'You do not have permission to write in this room.' });
          return;
        }


        // 2. Save the message to the database
        const newMessage = await prisma.chatMessage.create({
          data: {
            roomId: Number(roomId),
            senderId: userId,
            content: content,
          },
          include: {
            sender: {
              select: { id: true, display_name: true, avatar: true, last_active: true },
            },
          },
        });

        // Update room's updatedAt timestamp
        await prisma.chatRoom.update({
          where: { id: Number(roomId) },
          data: { updatedAt: new Date() },
        });




        // 3. Fetch all participants of the room (excluding the sender)
        const participants = await prisma.chatRoomParticipant.findMany({
          where: {
            roomId: Number(roomId),
            userId: { not: userId }, // Exclude the sender
          },
          select: { userId: true },
        });

        // 4. Emit 'receiveMessage' to the room (handled by clients in the room)
        // We can emit to the room, and the client can decide if it's the active room
        const messagePayload = {
          ...newMessage,
          sentAt: newMessage.sentAt.toISOString(), // Ensure date is serialized
          sender: {
            ...newMessage.sender,
            last_active: newMessage.sender.last_active?.toISOString(), // Serialize date
            // Add is_online calculation here if needed, or let client do it
            is_online: newMessage.sender.last_active ? (new Date().getTime() - new Date(newMessage.sender.last_active).getTime()) < 5 * 60 * 1000 : false
          },
        };

        io.to(`room-${roomId}`).emit('receiveMessage', messagePayload); // Use a room-specific event channel
        logInfo(`Emitted 'receiveMessage' to room-${roomId}`);

        // 5. Emit 'newMessageNotification' to each recipient's user-specific room
        const notificationPayload = {
          id: newMessage.id,
          senderId: userId,
          senderName: newMessage.sender.display_name,
          content: content.substring(0, 50) + (content.length > 50 ? '...' : ''), // Snippet
          timestamp: newMessage.sentAt.toISOString(),
          isRead: false,
          chatRoomId: Number(roomId),
        };

        participants.forEach((p) => {
          const recipientUserId = p.userId;
          logInfo(`Emitting 'newMessageNotification' to user-${recipientUserId}`);
          io.to(`user-${recipientUserId}`).emit('newMessageNotification', notificationPayload);
        });

        const roomChannel = `room-${roomId}`;
        logInfo(`<<< SERVER >>> Attempting to emit 'receiveMessage' to ${roomChannel}`, messagePayload);
        const socketsInRoom = await io.in(roomChannel).fetchSockets();
        logInfo(`<<< SERVER >>> Sockets currently in ${roomChannel}:`, socketsInRoom.map(s => `${s.id} (User: ${(s.data as any).userId})`));

      } catch (error) {
        logError(`Error handling sendMessage for room ${roomId}:`, error);
        socket.emit('messageError', { error: 'Failed to send message.' });
      }
    });

    // --- Client joining a specific chat room ---
    socket.on('joinRoom', (roomId) => {
      if (typeof roomId === 'number' || (typeof roomId === 'string' && !isNaN(Number(roomId)))) {
        const roomChannel = `room-${Number(roomId)}`;
        socket.join(roomChannel);
        logInfo(`<<< SERVER >>> Socket ${socket.id} (User ${userId}) successfully joined ${roomChannel}`); // Added user ID
      } else {
        logError(`<<< SERVER >>> Invalid roomId received for joinRoom from Socket ${socket.id}: ${roomId}`);
      }
    });

    // --- Client leaving a specific chat room ---
    socket.on('leaveRoom', (roomId) => {
      if (typeof roomId === 'number' || (typeof roomId === 'string' && !isNaN(Number(roomId)))) {
        const roomChannel = `room-${Number(roomId)}`;
        socket.leave(roomChannel);
        logInfo(`<<< SERVER >>> Socket ${socket.id} (User ${userId}) left ${roomChannel}`); // Added user ID
      } else {
        logError(`<<< SERVER >>> Invalid roomId received for leaveRoom from Socket ${socket.id}: ${roomId}`);
      }
    });

    // --- Other Event Handlers (Ping, Notifications, etc.) ---
    socket.on('notifyAttack', async ({ battleId, defenderId }) => {
      // ... validation logic ...
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

    // Alert notification
    socket.on('alertNotification', (alert) => {
      logInfo('Received alert notification:', alert);
      io.emit('alertNotification', alert); // Broadcast to all clients
    });

    // Ping-pong event
    socket.on('ping', ({ userId: targetUserId }) => {
      logInfo('Ping received for user:', targetUserId);
      // Respond directly to the sender or broadcast to the user's room
      io.to(`user-${targetUserId}`).emit('pong'); // Use user-specific room if needed
      // Or just socket.emit('pong'); to respond directly
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
  });

  logInfo('Socket.IO initialized successfully');
  return io;
};

export const getSocketIO = (): Server | null => {
  if (!io) {
    logError('Socket.IO has not been initialized!');
    return null;
  }
  // logInfo('Returning Socket.IO instance'); // Too noisy
  return io;
};