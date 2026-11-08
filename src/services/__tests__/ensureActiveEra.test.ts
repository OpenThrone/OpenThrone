import { describe, expect, it, mock } from 'bun:test';

type EraRow = { id: number; name: string; startDate: Date; endDate: null };

// In-memory stand-in for the era table and one advisory lock, with a yield on
// every query so concurrent callers interleave as they do against Postgres.
const eras: EraRow[] = [];
let lockTail: Promise<void> = Promise.resolve();
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

const makeClient = (onLock?: () => Promise<void>) => ({
  era: {
    findFirst: async () => {
      await tick();
      return eras.at(-1) ?? null;
    },
    create: async ({ data }: { data: { name: string; startDate: Date } }) => {
      await tick();
      const row = { id: eras.length + 1, endDate: null, ...data };
      eras.push(row);
      return row;
    },
  },
  $queryRaw: async () => {
    await onLock?.();
    return [];
  },
});

const prismaMock = {
  ...makeClient(),
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = lockTail;
    lockTail = previous.then(() => held);
    try {
      return await fn(makeClient(() => previous));
    } finally {
      release();
    }
  },
};

mock.module('@/lib/prisma', () => ({ default: prismaMock }));

const { ensureActiveEra } = await import('@/services/Era.service');

describe('ensureActiveEra', () => {
  it('creates a single era when many requests hit a fresh database (#274)', async () => {
    const results = await Promise.all(
      Array.from({ length: 9 }, () => ensureActiveEra()),
    );
    expect(eras).toHaveLength(1);
    expect(eras[0].name).toBe('Era 1');
    expect(new Set(results.map((era) => era.id))).toEqual(new Set([1]));
  });
});
