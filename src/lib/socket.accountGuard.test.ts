import { beforeEach, describe, expect, it, vi } from 'bun:test';
import type { Socket } from 'socket.io';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
const { installSocketAccountGuard } = await import('@/lib/socket');

describe('existing socket account guard', () => {
  beforeEach(() => {
    mockPrisma.users.findUnique.mockResolvedValue({
      email: 'synthetic@example.invalid',
    });
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue({ id: 1 });
    mockPrisma.accountStatusHistory = {
      findFirst: vi.fn().mockResolvedValue(null),
    };
  });

  const packet = async () => {
    let middleware!: (
      packet: unknown[],
      next: (error?: Error) => void,
    ) => Promise<void>;
    const socket = {
      request: {
        userId: 7,
        sessionAccount: { id: 7, email: 'synthetic@example.invalid' },
      },
      use: (handler: typeof middleware) => {
        middleware = handler;
      },
      disconnect: vi.fn(),
    };
    installSocketAccountGuard(socket as unknown as Socket);
    const next = vi.fn();
    await middleware(['sendMessage', { roomId: 42, content: 'hello' }], next);
    return { socket, next };
  };

  for (const status of ['BANNED', 'SUSPENDED', 'VACATION', 'CLOSED']) {
    it(`disconnects an already-connected ${status} account before dispatch`, async () => {
      mockPrisma.accountStatusHistory.findFirst.mockResolvedValue({
        status,
        end_date: null,
      });
      const { socket, next } = await packet();
      expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  }

  it('allows a current unrestricted account', async () => {
    const { socket, next } = await packet();
    expect(next).toHaveBeenCalledWith();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('fails closed if account lookup fails', async () => {
    mockPrisma.accountStatusHistory.findFirst.mockRejectedValue(
      new Error('Synthetic unavailable'),
    );
    const { socket, next } = await packet();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});
