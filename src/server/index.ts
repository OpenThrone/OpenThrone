import next from 'next';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getUpdatedStatus } from '@/services';
import { stringifyObj } from '@/utils/numberFormatting';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, turbo: true, turbopack: true });
const handle = app.getRequestHandler();

(async () => {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    if (req.url === '/socket.io/') {
      // WebSocket upgrade will be handled by wss
      return;
    }
    handle(req, res); // Handle other requests with Next.js
  });
  if (process.env.NEXT_PUBLIC_WS_ENABLED === 'true') {
    const wss = new WebSocketServer({
      noServer: true, // Disable built-in HTTP server
    });

    httpServer.on('upgrade', (request, socket, head) => {
      if (request.url === '/socket.io/') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy(); // Close the connection for other upgrade requests
      }
    });

    const userSockets: { [userId: number]: Set<WebSocket> } = {};

    wss.on('connection', (ws, request) => {
      console.log('WebSocket connected');
      ws.on('message', async (message) => {
        try {
          const parsedMessage = JSON.parse(message.toString());
          const { event, payload } = parsedMessage;

          if (event === 'registerUser') {
            const userId = payload.userId;
            if (!userSockets[userId]) {
              userSockets[userId] = new Set();
            }
            userSockets[userId].add(ws);
            console.log(`User ${userId} registered with WebSocket`);
          }

          if (event === 'requestUserData') {
            const userId = payload.userId;
            console.log(`Fetching data for user: ${userId}`);

            // Fetch user data
            const user = await prisma.users.findUnique({
              where: { id: userId },
              include: { permissions: true },
            });

            if (!user) {
              console.error('User not found');
              ws.send(JSON.stringify({ event: 'userDataError', payload: { error: 'User not found' } }));
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
              console.error(`Account is ${currentStatus.toLowerCase()}`);
              ws.send(
                JSON.stringify({ event: 'userDataError', payload: { error: `Account is ${currentStatus.toLowerCase()}` } })
              );
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

            ws.send(JSON.stringify({ event: 'userData', payload: stringifyObj(userData) }));
          }

          if (event === 'triggerUserUpdate') {
            const userId = payload.userId;
            const sockets = userSockets[userId];
            if (sockets) {
              sockets.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(
                    JSON.stringify({ event: 'userUpdate', payload: { message: `Update for user ${userId}` } })
                  );
                }
              });
            }
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket disconnected');
        for (const userId in userSockets) {
          userSockets[userId].delete(ws);
          if (userSockets[userId].size === 0) {
            delete userSockets[userId];
          }
        }
      });
    });
  }

  httpServer.listen(3000, () => {
    console.log('> Server ready on https://alpha.openthrone.dev');
  });
})();
