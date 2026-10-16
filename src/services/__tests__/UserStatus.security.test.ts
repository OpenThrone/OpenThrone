import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const {
  getUpdatedStatus,
  getLoginBlockingStatus,
  getLoginBlockingStatuses,
} = require('../User.service');

let locked = false;

beforeEach(() => {
  locked = false;
  mockPrisma.$queryRaw = vi.fn(async () => {
    locked = true;
    return [{ id: 125 }];
  });
  mockPrisma.users.findUnique = vi.fn(async () => ({
    last_active: new Date(0),
  }));
  mockPrisma.accountStatusHistory = {
    findFirst: vi.fn(async () => ({ status: 'ACTIVE', end_date: null })),
    create: vi.fn(async () => ({})),
  };
  mockPrisma.$transaction = vi.fn(async (cb: any) => cb(mockPrisma));
});

describe('serialized status refresh', () => {
  it('rereads a restriction after obtaining the user lock and never overlays it with idle status', async () => {
    mockPrisma.accountStatusHistory.findFirst.mockImplementation(async () => ({
      status: locked ? 'BANNED' : 'ACTIVE',
      end_date: null,
    }));
    expect(await getUpdatedStatus(125)).toBe('BANNED');
    expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.accountStatusHistory.findFirst.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.accountStatusHistory.create).not.toHaveBeenCalled();
  });

  it('holds the same lock before expiry and inactivity status writes', async () => {
    mockPrisma.accountStatusHistory.create.mockImplementation(async () => {
      expect(locked).toBe(true);
      return {};
    });
    for (const record of [
      null,
      { status: 'VACATION', end_date: new Date(0) },
      { status: 'ACTIVE', end_date: null },
    ]) {
      locked = false;
      mockPrisma.accountStatusHistory.findFirst.mockResolvedValue(record);
      await getUpdatedStatus(125);
    }
    expect(mockPrisma.accountStatusHistory.create).toHaveBeenCalledTimes(3);
  });

  it('resolves a whole recipient page with the same latest-row and expiry policy in one query', async () => {
    mockPrisma.accountStatusHistory.findMany = vi.fn(async () => [
      { user_id: 1, status: 'CLOSED', end_date: null },
      { user_id: 2, status: 'BANNED', end_date: new Date(0) },
      { user_id: 3, status: 'ACTIVE', end_date: null },
      {
        user_id: 4,
        status: 'SUSPENDED',
        end_date: new Date(Date.now() + 60_000),
      },
    ]);
    expect(await getLoginBlockingStatuses([1, 2, 3, 4])).toEqual(
      new Map([
        [1, 'CLOSED'],
        [2, null],
        [3, null],
        [4, 'SUSPENDED'],
      ]),
    );
    expect(mockPrisma.accountStatusHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: { in: [1, 2, 3, 4] },
          start_date: { lte: expect.any(Date) },
        },
        orderBy: [{ user_id: 'asc' }, { start_date: 'desc' }, { id: 'desc' }],
        distinct: ['user_id'],
      }),
    );
    expect(mockPrisma.accountStatusHistory.findFirst).not.toHaveBeenCalled();
  });

  it('orders same-timestamp statuses by their insertion ID for login and refresh', async () => {
    await getLoginBlockingStatus(125);
    await getUpdatedStatus(125);
    for (const [args] of mockPrisma.accountStatusHistory.findFirst.mock.calls) {
      expect(args.orderBy).toEqual([{ start_date: 'desc' }, { id: 'desc' }]);
    }
  });
});
