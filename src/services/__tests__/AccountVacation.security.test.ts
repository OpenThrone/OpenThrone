import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
const { AccountService } = require('../Account.service');

beforeEach(() => {
  mockPrisma.$queryRaw = vi.fn(async () => [{ id: 125 }]);
  mockPrisma.accountStatusHistory = {
    findFirst: vi.fn(async () => ({ status: 'ACTIVE', end_date: null })),
    count: vi.fn(async () => 0),
    create: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  mockPrisma.$transaction = vi.fn(async (cb: any) => cb(mockPrisma));
});

describe('vacation transitions', () => {
  it('closes dated and undated vacation rows after locking and checking the current status', async () => {
    mockPrisma.accountStatusHistory.findFirst.mockResolvedValue({
      status: 'VACATION',
      end_date: new Date(Date.now() + 86400000),
    });
    await AccountService.endVacation(125);
    const args = mockPrisma.accountStatusHistory.updateMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { end_date: null },
      { end_date: { gt: expect.any(Date) } },
    ]);
    expect(args.where.start_date).toEqual({ lte: args.data.end_date });
    expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.accountStatusHistory.findFirst.mock.invocationCallOrder[0],
    );
    expect(
      mockPrisma.accountStatusHistory.create.mock.calls[0][0].data.status,
    ).toBe('ACTIVE');
  });

  it('cannot overlay a newer restriction or duplicate ACTIVE transition', async () => {
    for (const status of ['CLOSED', 'BANNED', 'SUSPENDED', 'ACTIVE']) {
      mockPrisma.accountStatusHistory.findFirst.mockResolvedValue({
        status,
        end_date: null,
      });
      await AccountService.endVacation(125);
    }
    expect(mockPrisma.accountStatusHistory.create).not.toHaveBeenCalled();
    expect(mockPrisma.accountStatusHistory.updateMany).not.toHaveBeenCalled();
  });

  it('checks the yearly quota within the row lock before activation', async () => {
    mockPrisma.accountStatusHistory.count.mockResolvedValue(4);
    await expect(AccountService.startVacation(125)).rejects.toThrow(
      'Vacation limit reached',
    );
    expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.accountStatusHistory.count.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.accountStatusHistory.create).not.toHaveBeenCalled();
  });

  it('refuses duplicate vacation starts and restricted accounts', async () => {
    for (const status of ['VACATION', 'CLOSED', 'BANNED', 'SUSPENDED']) {
      mockPrisma.accountStatusHistory.findFirst.mockResolvedValue({
        status,
        end_date: null,
      });
      await expect(AccountService.startVacation(125)).rejects.toThrow(
        'current account status',
      );
    }
    expect(mockPrisma.accountStatusHistory.create).not.toHaveBeenCalled();
  });
});
