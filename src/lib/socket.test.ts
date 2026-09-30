import { createServer } from 'http';
import { Server } from 'socket.io';

import { initializeSocket } from './socket';

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }));

jest.mock('@/lib/prisma-exports', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError {},
  },
}));

jest.mock('@/services/Messaging.service', () => ({ MessagingService: {} }));

jest.mock('./prisma', () => ({ __esModule: true, default: {} }));

jest.mock('./rate-limiter', () => ({ rateLimiter: jest.fn() }));

describe('Socket.IO server integration', () => {
  it('preserves upgrade requests owned by the Next.js dev server', () => {
    const httpServer = createServer();

    initializeSocket(httpServer);

    expect(jest.mocked(Server)).toHaveBeenCalledWith(
      httpServer,
      expect.objectContaining({ destroyUpgrade: false }),
    );
  });
});
