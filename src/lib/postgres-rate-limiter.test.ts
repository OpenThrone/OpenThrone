import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { installRateLimitStore } from 'test/utils/rateLimitStore';

installMockPrisma(vi);

const {
  consumeRateLimitSlot,
  postgresRateLimiter,
  releaseRateLimitSlot,
} = require('./postgres-rate-limiter');

const LIMIT = { windowMs: 60_000, max: 3 };
const sqlOf = (call: any[]) => Array.from(call[0] as string[]).join('?');

describe('postgres rate limiter statement shape', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.rateLimitBucket = {
      aggregate: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    };
    mockPrisma.$queryRaw = vi.fn(async () => [{ count: 1 }]);
    mockPrisma.$executeRaw = vi.fn(async () => 1);
  });

  it('checks and increments in one conditional upsert, never a separate read', async () => {
    expect(await postgresRateLimiter('shape:key', LIMIT)).toBe(true);

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.rateLimitBucket.aggregate).not.toHaveBeenCalled();
    expect(mockPrisma.rateLimitBucket.upsert).not.toHaveBeenCalled();

    const call = mockPrisma.$queryRaw.mock.calls[0];
    const sql = sqlOf(call).replace(/\s+/g, ' ');
    expect(sql).toContain('INSERT INTO "rate_limit_buckets"');
    // Insert path: only when the previous bucket leaves room.
    expect(sql).toContain('WHERE prev.c < ?::int');
    // Update path: re-evaluated by Postgres on the locked row.
    expect(sql).toContain('ON CONFLICT ("key", "bucket") DO UPDATE');
    expect(sql).toContain(
      'WHERE "rate_limit_buckets"."count" + (SELECT c FROM prev) < ?::int',
    );
    expect(sql).toContain('RETURNING "count"');

    const [, key, bucket, , , expiresAt, max] = call;
    expect(key).toBe('shape:key');
    expect(bucket).toBe(BigInt(Math.floor(Date.now() / LIMIT.windowMs)));
    expect(expiresAt).toBeInstanceOf(Date);
    expect(max).toBe(LIMIT.max);
  });

  it('reports a full window when the statement returns no row', async () => {
    mockPrisma.$queryRaw = vi.fn(async () => []);
    expect(await postgresRateLimiter('shape:key', LIMIT)).toBe(false);
    expect(await consumeRateLimitSlot('shape:key', LIMIT)).toBeNull();
  });

  it('refunds a slot without letting the count go negative', async () => {
    const slot = await consumeRateLimitSlot('shape:key', LIMIT);
    await releaseRateLimitSlot(slot);
    const sql = sqlOf(mockPrisma.$executeRaw.mock.calls[0]).replace(
      /\s+/g,
      ' ',
    );
    expect(sql).toContain('SET "count" = "count" - 1');
    expect(sql).toContain('AND "count" > 0');
    expect(mockPrisma.$executeRaw.mock.calls[0].slice(1)).toEqual([
      'shape:key',
      slot.bucket,
    ]);
  });
});

describe('postgres rate limiter window semantics', () => {
  beforeEach(() => {
    resetMockPrisma();
  });

  it('admits exactly max attempts from a burst of concurrent requests', async () => {
    installRateLimitStore(mockPrisma, vi);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => postgresRateLimiter('burst', LIMIT)),
    );
    expect(results.filter(Boolean)).toHaveLength(LIMIT.max);
  });

  it('frees capacity when a slot is refunded', async () => {
    const store = installRateLimitStore(mockPrisma, vi);
    const slots = [];
    for (let i = 0; i < LIMIT.max; i += 1) {
      slots.push(await consumeRateLimitSlot('refund', LIMIT));
    }
    expect(await postgresRateLimiter('refund', LIMIT)).toBe(false);
    await releaseRateLimitSlot(slots[0]);
    expect(store.windowCount('refund')).toBe(LIMIT.max - 1);
    expect(await postgresRateLimiter('refund', LIMIT)).toBe(true);
  });
});
