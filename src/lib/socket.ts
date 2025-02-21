import { getUpdatedStatus } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';
import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import prisma from './prisma';
import { getToken } from 'next-auth/jwt';
import cookie from 'cookie';
import md5 from 'md5';

let io: Server | null = null;

export const initializeSocket = (httpServer: HttpServer) => {
  if (io) {
    console.log('Socket.IO already initialized');
    return io;
  }

  console.log('Initializing Socket.IO...');
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_SOCKET_IO_ORIGIN,
      methods: ["GET", "POST"],
    },
    path: '/socket.io',
    allowRequest: async (req, callback) => {
      try {
        if (!req.headers.cookie) {
          return callback('No valid token found', false);
        }
        const cookies = cookie.parse(req.headers.cookie || '');
        const token = await getToken({ req: { cookies } as any, secret: process.env.JWT_SECRET });
        if (!token) {
          console.log('No valid token found');
          return callback('Invalid token', false);
        }

        // Token is already decrypted and verified.
        (req as any).decoded = token;
        (req as any).socket = { userId: token.user?.id || token.userId };
        callback(null, true);
      } catch (err: any) {
        console.log('Token error:', err.message);
        return callback('Invalid token', false);
      }
    }
  });


  const userSockets = {};

  io.on('connection', (socket) => {
    const userId = (socket as any).conn.request.socket.userId as number; // Extract user ID from decoded token
    console.log('User ID from token:', userId);

    socket.on('registerUser', ({ userId }) => {
      socket.join(`user-${userId}`);
      console.log(`Socket ${socket.id} joined room user-${userId}`);
      if (!userSockets[userId]) {
        userSockets[userId] = new Set();
      }
      userSockets[userId].add(socket.id);
      console.log(`User ${userId} registered with socket ${socket.id}`);
      console.log('Current userSockets:', [...userSockets[userId]]);
    });

    socket.on('requestUserData', async () => {
      console.log(`Fetching data for user: ${userId}`);
      if (isNaN(userId)) {
        console.error('Invalid userId:', userId);
        return;
      }
      try {
        const user = await prisma.users.findUnique({
          where: { id: userId },
          include: { permissions: true },
        });

        if (!user) {
          io.to(`user-${userId}`).emit('userDataError', { error: 'User not found' });
          return;
        }

        const now = new Date();
        const timeSinceLastActive = now.getTime() - new Date(user.last_active).getTime();
        if (timeSinceLastActive > 10 * 60 * 1000) {
          console.log('Updating last active for user:', userId);
          await prisma.users.update({
            where: { id: userId },
            data: { last_active: now },
          });
        }

        const currentStatus = await getUpdatedStatus(user.id);

        if (['BANNED', 'SUSPENDED', 'CLOSED', 'TIMEOUT', 'VACATION'].includes(currentStatus)) {
          io.to(`user-${userId}`).emit('userDataError', { error: `Account is ${currentStatus.toLowerCase()}` });
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

        io.to(`user-${userId}`).emit('userData', stringifyObj(userData as any));
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    });

    socket.on('triggerUserUpdate', () => {
      io.to(`user-${userId}`).emit('userUpdate', { message: `Update for user ${userId}` });
      const sockets = userSockets[userId];
      if (sockets) {
        sockets.forEach((socketId) => {
          io.to(socketId).emit('userUpdate', { message: `Update for user ${userId}` });
        });
      }
    });

    socket.on('notifyAttack', async ({ battleId, defenderId }) => {
      console.log(`Received attack notification for battle ${battleId} to user ${defenderId}`);
      try {
        const attackLog = await prisma.attack_log.findUnique({
          where: { id: Number(battleId) },
          });

          if (!attackLog) {
            console.log(`Attack log not found with ID: ${battleId}`);
            return;
          }

          if (attackLog.defender_id !== defenderId) {
            console.log(`Defender ID ${defenderId} does not match attack log's defender ID ${attackLog.defender_id}`);
            return;
          }

          const now = new Date();
          const attackTime = new Date(attackLog.timestamp);
          const timeDifference = now.getTime() - attackTime.getTime();
          const thirtySeconds = 30 * 1000;

          if (timeDifference > thirtySeconds) {
            console.log(`Notification is too late. Time difference: ${timeDifference}ms`);
            //return;
          }

          const message = `You were attacked in battle ${battleId}`;
          const hash = md5(message + battleId + defenderId);

          // If all checks pass, emit the notification
          console.log(`Notifying user ${defenderId} of attack in battle ${battleId}`);
          io.to(`user-${defenderId}`).emit('attackNotification', { message, hash });
        } catch (error) {
          console.error('Error validating attack notification:', error);
        }
      });

      socket.on('notifyFriendRequest', async ({ userId, message }) => {
        const hash = md5(message + userId);
        console.log(`Sending friend request notification to user ${userId}`);
        io.to(`user-${userId}`).emit('friendRequestNotification', { message, hash });
      });

      socket.on('notifyEnemyDeclaration', async ({ userId, message }) => {
        const hash = md5(message + userId);
        console.log(`Notifying user ${userId} of enemy declaration`);
        io.to(`user-${userId}`).emit('enemyDeclarationNotification', { message, hash });
      });

      socket.on('notifyMessage', async ({ userId, message }) => {
        const hash = md5(message + userId);
        console.log(`Sending message notification to user ${userId}`);
        io.to(`user-${userId}`).emit('messageNotification', { message, hash });
      });

      // Alert notification
      socket.on('alertNotification', (alert) => {
        console.log('Received alert notification:', alert);
        io.emit('alertNotification', alert); // Broadcast to all clients
      });

      // Ping-pong event
      socket.on('ping', ({userId}) => {
        console.log('Ping received to user:', userId);
        io.to(`user-${userId}`).emit('pong');
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('Socket.IO disconnected:', socket.id);
        for (const userId in userSockets) {
          userSockets[userId].delete(socket.id);
          if (userSockets[userId].size === 0) {
            delete userSockets[userId];
          }
        }
      });
    });
    return io;
  };

  export const getSocketIO = () => {
    if (!io) {
      console.error('Socket.IO has not been initialized!');
      return null;
    }
    console.log('Returning Socket.IO instance');
    return io;
  };