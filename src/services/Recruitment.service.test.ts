import { describe, expect, it, mock, vi } from 'bun:test';
// Shared complete Prisma mock keeps other service exports intact in Bun's cache.
import { installMockPrisma } from 'test/utils/mockPrisma';

import type { Prisma } from '@/lib/prisma-exports';
import { getOTStartDate } from '@/utils/timefunctions';

installMockPrisma(vi);

const TEST_CONTEXT = {
  internalDailyCap: 250,
  externalDailyCap: 25,
  externalIpDailyCap: 5,
  recruitCitizenMultiplier: 1,
};

const {
  getRecruitmentBlock,
  getRecruitmentStatus,
  performRecruitment,
  performRecruitmentWithSessionValidation,
} = await import('@/services/Recruitment.service');

describe('recruitment history transaction ordering', () => {
  for (const strategy of ['standard', 'linkBased'] as const) {
    it(`rechecks the ${strategy} limit after waiting for a concurrent recruitment`, async () => {
      let count = 4;
      let rewards = 0;
      const events: string[] = [];
      // Advisory locks are keyed by ID and held until the owning transaction ends.
      type Held = {
        owner: string;
        released: Promise<void>;
        release: () => void;
      };
      const locks = new Map<number, Held>();
      const makeTx = (owner: string) =>
        ({
          $queryRaw: async (
            _strings: unknown,
            _namespace: number,
            id: number,
          ) => {
            for (;;) {
              const held = locks.get(id);
              if (!held || held.owner === owner) break;
              await held.released;
            }
            if (!locks.has(id)) {
              let release: () => void = () => {};
              const released = new Promise<void>((resolve) => {
                release = resolve;
              });
              locks.set(id, { owner, released, release });
            }
            events.push(`${owner}:locked`);
            return [];
          },
          recruit_history: {
            count: async () => {
              events.push(`${owner}:count`);
              return count;
            },
            create: async () => {
              count += 1;
              events.push(`${owner}:history`);
            },
          },
          era: {
            findFirst: async () => ({ startDate: new Date('2020-01-01') }),
          },
          users: {
            findUnique: async () => ({ id: 42 }),
            update: async () => {
              rewards += 1;
            },
          },
          userUnit: { upsert: async () => {} },
          bank_history: { create: async () => {} },
        }) as unknown as Prisma.TransactionClient;
      const releaseAll = (owner: string) => {
        for (const [id, held] of locks) {
          if (held.owner === owner) {
            locks.delete(id);
            held.release();
          }
        }
      };
      const paramsFor = (owner: string) => ({
        context: TEST_CONTEXT,
        tx: makeTx(owner),
        fromUser: 17,
        toUser: 42,
        userIdToUpdate: 42,
        ipAddress: '192.0.2.1',
        strategy,
      });
      // A real transaction releases its advisory locks at commit/rollback.
      const first = performRecruitment(paramsFor('a')).finally(() =>
        releaseAll('a'),
      );
      const second = performRecruitment(paramsFor('b')).finally(() =>
        releaseAll('b'),
      );
      const outcomes = await Promise.allSettled([first, second]);
      expect(outcomes.map((outcome) => outcome.status)).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(count).toBe(5);
      expect(rewards).toBe(1);
      // The second transaction must read the limit only after the first has written its history.
      const firstHistory = events.indexOf('a:history');
      expect(events.indexOf('b:count')).toBeGreaterThan(firstHistory);
      expect(events.indexOf('b:locked')).toBeGreaterThan(-1);
      expect(events.indexOf('b:locked')).toBeGreaterThan(firstHistory);
    });
  }

  it('rejects a non-existent sender before any reward or history write (F-02)', async () => {
    const update = mock(async () => ({}));
    const historyCreate = mock(async () => ({}));
    const tx = {
      $queryRaw: async () => [],
      recruit_history: { count: async () => 0, create: historyCreate },
      era: { findFirst: async () => ({ startDate: new Date('2020-01-01') }) },
      users: {
        findUnique: async ({ where }: { where: { id: number } }) =>
          where.id === 42 ? { id: 42 } : null,
        update,
      },
      userUnit: { upsert: async () => {} },
      bank_history: { create: async () => {} },
    } as unknown as Prisma.TransactionClient;

    await expect(
      performRecruitment({
        context: TEST_CONTEXT,
        tx,
        fromUser: 987654,
        toUser: 42,
        userIdToUpdate: 42,
        ipAddress: '192.0.2.1',
        strategy: 'standard',
      }),
    ).rejects.toThrow('Recruiter not found');
    expect(historyCreate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects another account’s session before any recruitment mutation', async () => {
    const lock = mock(async () => []);
    const findUnique = mock(async () => null);
    const tx = {
      $queryRaw: lock,
      autoRecruitSession: { findUnique },
    } as unknown as Prisma.TransactionClient;
    await expect(
      performRecruitmentWithSessionValidation({
        tx,
        fromUser: 17,
        toUser: 42,
        userIdToUpdate: 42,
        ipAddress: '192.0.2.1',
        sessionId: 9,
        recruiterUserId: 42,
      }),
    ).rejects.toThrow('Invalid session ID');
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 9, userId: 42 } });
    expect(lock).not.toHaveBeenCalled();
  });

  it('excludes recruit history from before the active era reset boundary', async () => {
    const eraStart = new Date(getOTStartDate().getTime() + 12 * 60 * 60 * 1000);
    const seenWindows: Date[] = [];
    const db = {
      era: { findFirst: async () => ({ startDate: eraStart }) },
      recruit_history: {
        count: async ({ where }: { where: { timestamp: { gte: Date } } }) => {
          seenWindows.push(where.timestamp.gte);
          // Older history would cap these users, but must be ignored after reset.
          return where.timestamp.gte.getTime() === eraStart.getTime() ? 0 : 30;
        },
      },
    } as any;

    const result = await getRecruitmentBlock({
      db,
      recruiterId: 17,
      targetId: 42,
      // Even an explicitly older window cannot cross the reset boundary.
      since: new Date('2025-04-10T00:00:00.000Z'),
    });

    expect(result).toBeNull();
    expect(seenWindows).toHaveLength(2);
    expect(
      seenWindows.every((date) => date.getTime() === eraStart.getTime()),
    ).toBe(true);
  });

  it('does not let an older explicit since bypass today’s quota boundary', async () => {
    const todayStart = getOTStartDate();
    const seenWindows: Date[] = [];
    const db = {
      era: { findFirst: async () => ({ startDate: new Date('2020-01-01') }) },
      recruit_history: {
        count: async ({ where }: { where: { timestamp: { gte: Date } } }) => {
          seenWindows.push(where.timestamp.gte);
          return where.timestamp.gte.getTime() === todayStart.getTime()
            ? 0
            : 30;
        },
      },
    } as any;

    const result = await getRecruitmentBlock({
      db,
      recruiterId: 17,
      targetId: 42,
      since: new Date('2019-01-01'),
    });

    expect(result).toBeNull();
    expect(seenWindows).toHaveLength(2);
    expect(
      seenWindows.every((date) => date.getTime() === todayStart.getTime()),
    ).toBe(true);
  });
});

describe('getRecruitmentStatus', () => {
  it('reports daily use per target and when the day resets', async () => {
    const seen: unknown[] = [];
    const db = {
      era: { findFirst: async () => null },
      recruit_history: {
        count: async () => 7,
        groupBy: async ({ where }: any) => {
          seen.push(where);
          return where.to_user !== undefined
            ? [{ from_user: 42, _count: { _all: 5 } }]
            : [
                { from_user: 42, _count: { _all: 9 } },
                { from_user: 43, _count: { _all: 2 } },
              ];
        },
      },
    } as any;

    const status = await getRecruitmentStatus({
      db,
      recruiterId: 17,
      targetIds: [42, 43],
    });

    expect(status.recruiterUsed).toBe(7);
    expect(status.pairLimit).toBe(5);
    expect(status.targets['42']).toEqual({ pairUsed: 5, targetUsed: 0 });
    expect(status.targets['43']).toEqual({ pairUsed: 0, targetUsed: 0 });
    expect(status.resetsAt).toBe(getOTStartDate(1).toISOString());
    expect(seen).toHaveLength(1);
  });

  it('skips the grouped queries when no targets are requested', async () => {
    const db = {
      era: { findFirst: async () => null },
      recruit_history: {
        count: async () => 0,
        groupBy: async () => {
          throw new Error('should not query');
        },
      },
    } as any;
    const status = await getRecruitmentStatus({
      db,
      recruiterId: 17,
      targetIds: [],
    });
    expect(status.targets).toEqual({});
  });
});
