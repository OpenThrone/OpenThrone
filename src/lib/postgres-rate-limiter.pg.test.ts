// Opt-in integration test against a real, disposable Postgres. Skipped unless
// RATE_LIMIT_TEST_DATABASE_URL is set; run this file on its own, e.g.
//   RATE_LIMIT_TEST_DATABASE_URL=postgres://... bun --no-env-file test src/lib/postgres-rate-limiter.pg.test.ts
// It creates rate_limit_buckets if missing and only touches its own keys.
import { afterAll, describe, expect, it, mock } from 'bun:test';

const DATABASE_URL = process.env.RATE_LIMIT_TEST_DATABASE_URL;

describe.skipIf(!DATABASE_URL)('postgres rate limiter on Postgres', () => {
  let limiter: typeof import('./postgres-rate-limiter');
  let prisma: any;
  const prefix = `pgtest:${process.pid}:${Date.now()}`;

  const setup = async () => {
    if (limiter) return;
    // The test preload mocks '@/lib/prisma'; point it at a real client instead.
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const { PrismaClient } =
      await import('../../prisma/generated/prisma/client');
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: DATABASE_URL }),
    });
    mock.module('@/lib/prisma', () => ({ default: prisma }));
    limiter = await import('./postgres-rate-limiter');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
        "id" BIGSERIAL PRIMARY KEY,
        "key" TEXT NOT NULL,
        "bucket" BIGINT NOT NULL,
        "count" INTEGER NOT NULL DEFAULT 1,
        "expiresAt" TIMESTAMPTZ(3) NOT NULL,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_buckets_key_bucket_key" ON "rate_limit_buckets"("key", "bucket")`,
    );
  };

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "key" LIKE ${`${prefix}%`}`;
    await prisma.$disconnect();
  });

  it('admits exactly max of 40 concurrent consumes', async () => {
    await setup();
    const key = `${prefix}:burst`;
    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        limiter.postgresRateLimiter(key, { windowMs: 600_000, max: 7 }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(7);
    const rows = await prisma.$queryRaw<{ total: number }[]>`
      SELECT SUM("count")::int AS total FROM "rate_limit_buckets" WHERE "key" = ${key}`;
    expect(rows[0].total).toBe(7);
  });

  it('counts the previous bucket and honours refunds', async () => {
    await setup();
    const key = `${prefix}:window`;
    const windowMs = 600_000;
    const bucket = BigInt(Math.floor(Date.now() / windowMs));
    await prisma.$executeRaw`
      INSERT INTO "rate_limit_buckets" ("key", "bucket", "count", "expiresAt")
      VALUES (${key}, ${bucket - 1n}, 2, now() + interval '1 hour')`;

    const slot = await limiter.consumeRateLimitSlot(key, { windowMs, max: 3 });
    expect(slot).not.toBeNull();
    expect(await limiter.postgresRateLimiter(key, { windowMs, max: 3 })).toBe(
      false,
    );
    await limiter.releaseRateLimitSlot(slot!);
    expect(await limiter.postgresRateLimiter(key, { windowMs, max: 3 })).toBe(
      true,
    );
  });
});
