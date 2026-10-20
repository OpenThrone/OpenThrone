import { beforeEach, describe, expect, test, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the service loads.
const { AllianceBankService, ALLIANCE_BANK_TX_OPTIONS, lockAllianceThenUsers } =
  await import('../AllianceBank.service');

let events: string[];
let txOptions: unknown[];

beforeEach(() => {
  events = [];
  txOptions = [];
  mockPrisma.$queryRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: number[]) => {
      const table = /FROM (\w+)/.exec(strings.join('?'))?.[1];
      expect(strings.join('?')).toContain('FOR UPDATE');
      events.push(`lock:${table}:${values[0]}`);
      return [];
    },
  );
  mockPrisma.$transaction = vi.fn(
    async (
      callback: (tx: typeof mockPrisma) => Promise<unknown>,
      options: unknown,
    ) => {
      txOptions.push(options);
      return callback(mockPrisma);
    },
  );
  mockPrisma.alliances = {
    findUnique: vi.fn(async () => ({ leader_id: 10 })),
    updateMany: vi.fn(async () => {
      events.push('write:alliances');
      return { count: 1 };
    }),
  };
  mockPrisma.alliance_memberships = { count: vi.fn(async () => 1) };
  mockPrisma.alliance_bank_history = {
    create: vi.fn(async () => ({})),
    aggregate: vi.fn(async () => ({ _sum: { amount: null } })),
  };
  mockPrisma.users = {
    findUnique: vi.fn(async () => ({ gold: 1_000n })),
    updateMany: vi.fn(async () => {
      events.push('write:users');
      return { count: 1 };
    }),
  };
});

const locks = () => events.filter((e) => e.startsWith('lock:'));

describe('alliance bank lock order: alliance row first, then users by ascending id', () => {
  test('deposit locks the alliance before the depositing member', async () => {
    await AllianceBankService.deposit({
      allianceId: 7,
      userId: 11,
      amount: 5n,
    });

    expect(locks()).toEqual(['lock:alliances:7', 'lock:users:11']);
    expect(events.indexOf('write:users')).toBeGreaterThan(1);
    expect(txOptions).toEqual([ALLIANCE_BANK_TX_OPTIONS]);
  });

  test('withdraw uses the same order, so it cannot deadlock with a deposit', async () => {
    await AllianceBankService.withdraw({
      allianceId: 7,
      requesterId: 10,
      targetUserId: 11,
      amount: 5n,
    });

    expect(locks()).toEqual(['lock:alliances:7', 'lock:users:11']);
    expect(events.indexOf('write:alliances')).toBeGreaterThan(1);
    expect(txOptions).toEqual([ALLIANCE_BANK_TX_OPTIONS]);
  });

  test('multiple users are locked in ascending id order, once each', async () => {
    await lockAllianceThenUsers(mockPrisma, 3, [42, 8, 42, 15]);

    expect(locks()).toEqual([
      'lock:alliances:3',
      'lock:users:8',
      'lock:users:15',
      'lock:users:42',
    ]);
  });
});
