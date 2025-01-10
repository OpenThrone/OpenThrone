import { getUpdatedStatus } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';
import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import prisma from './prisma';

let io: Server | null = null;

export const initializeSocket = (httpServer: HttpServer) => {
  if (!io) {
    io = new Server(httpServer, {
      cors: {
        origin: "*.openthrone.dev",
        methods: ["GET", "POST"],
      },
      path: '/socket.io',
    });


    const userSockets = {};

    io.on('connection', (socket) => {
      console.log('Socket.IO connected:', socket.id);

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

      socket.on('requestUserData', async ({ userId }) => {
        console.log(`Fetching data for user: ${userId}`);

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

          const userData = {
            ...user,
            beenAttacked: attacks.some((attack) => attack.type === 'attack'),
            detectedSpy: attacks.some((attack) => attack.type !== 'attack' && attack.winner === user.id),
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

          io.to(`user-${userId}`).emit('userData', stringifyObj(userData));
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      });

      socket.on('triggerUserUpdate', ({ userId }) => {
        io.to(`user-${userId}`).emit('userUpdate', { message: `Update for user ${userId}` });
        const sockets = userSockets[userId];
        if (sockets) {
          sockets.forEach((socketId) => {
            io.to(socketId).emit('userUpdate', { message: `Update for user ${userId}` });
          });
        }
      });

      socket.on('notifyAttack', ({ userId, battleId }) => { 
        io.to(`user-${userId}`).emit('attackNotification', { message: `You were attacked in battle ${battleId}` });
      })

      // Ping-pong event
      socket.on('ping', ({userId}) => {
        console.log('Ping received to user:', userId);
        io.to(`user-${userId}`).emit('pong');
      });

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
  }
  return io;
};

export const getSocketIO = () => {
  console.log('Returning Socket.IO instance');
  try {
    if (!io) {
      console.error('Socket.IO has not been initialized!');
      throw new Error('Socket.IO has not been initialized!');
    }
  } catch (error) {
    console.error('Error getting Socket.IO instance:', error);
  }
  console.log('Returning Socket.IO instance');
  return io;
};
