import { createServer } from 'http';
import { getToken } from 'next-auth/jwt';
import { Server } from 'socket.io';

import { initializeSocket } from './socket';

const mockServerOptions: { options?: Record<string, unknown> } = {};

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation((_httpServer, options) => {
    mockServerOptions.options = options;
    return { on: jest.fn() };
  }),
}));

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }));

jest.mock('@/lib/prisma-exports', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError {},
  },
}));

jest.mock('@/lib/sessionAccount', () => ({
  isSessionAccountCurrent: jest.fn().mockResolvedValue(true),
  isSessionAccountStatusAllowed: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/Messaging.service', () => ({ MessagingService: {} }));

jest.mock('./prisma', () => ({ __esModule: true, default: {} }));

jest.mock('./rate-limiter', () => ({ rateLimiter: jest.fn() }));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of ['NEXTAUTH_SECRET', 'JWT_SECRET']) {
    if (key in ORIGINAL_ENV) process.env[key] = ORIGINAL_ENV[key];
    else delete process.env[key];
  }
});

const socketAuthRequest = () => ({
  url: '/socket.io/?EIO=4&transport=polling&token=session-token',
  headers: {} as Record<string, string>,
});

const allowRequestFromLastInit = () =>
  mockServerOptions.options?.allowRequest as unknown as (
    req: ReturnType<typeof socketAuthRequest>,
    callback: (err: unknown, success: boolean) => void,
  ) => Promise<void>;

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

describe('Socket.IO allowRequest authentication', () => {
  it('authorizes a session signed with NEXTAUTH_SECRET when JWT_SECRET differs', async () => {
    const signingSecret = 'nextauth-signing-secret';
    process.env.NEXTAUTH_SECRET = signingSecret;
    process.env.JWT_SECRET = 'different-jwt-secret';

    // Simulate next-auth: the token only decodes with the secret that signed it.
    jest
      .mocked(getToken)
      .mockImplementation(
        async ({ secret }: { secret?: string }) =>
          (secret === signingSecret ? { user: { id: 7 } } : null) as never,
      );

    const req = socketAuthRequest();
    const callback = jest.fn();

    await allowRequestFromLastInit()(req, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
    expect((req as { userId?: number }).userId).toBe(7);
  });

  it('still authorizes a session signed with JWT_SECRET alone', async () => {
    delete process.env.NEXTAUTH_SECRET;
    process.env.JWT_SECRET = 'jwt-only-secret';

    jest
      .mocked(getToken)
      .mockImplementation(
        async ({ secret }: { secret?: string }) =>
          (secret === 'jwt-only-secret' ? { user: { id: 3 } } : null) as never,
      );

    const req = socketAuthRequest();
    const callback = jest.fn();

    await allowRequestFromLastInit()(req, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
    expect((req as { userId?: number }).userId).toBe(3);
  });

  it('rejects a token signed with neither secret', async () => {
    process.env.NEXTAUTH_SECRET = 'nextauth-signing-secret';
    process.env.JWT_SECRET = 'different-jwt-secret';

    jest.mocked(getToken).mockImplementation(async () => null);

    const req = socketAuthRequest();
    const callback = jest.fn();

    await allowRequestFromLastInit()(req, callback);

    expect(callback).toHaveBeenCalledWith('Invalid token', false);
    expect((req as { userId?: number }).userId).toBeUndefined();
  });
});
