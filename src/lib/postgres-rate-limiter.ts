import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

interface PostgresRateLimiterOptions {
  windowMs: number;
  max: number;
}

/** One consumed attempt; pass it to `releaseRateLimitSlot` to refund it. */
export interface RateLimitSlot {
  key: string;
  bucket: bigint;
}

const purgeExpiredBuckets = () => {
  if (Math.random() >= 0.01) return;
  prisma.rateLimitBucket
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch((error: unknown) => {
      logError('Failed to purge expired rate limit buckets', error);
    });
};

/**
 * Atomically consumes one attempt. The window is the current fixed bucket plus
 * the previous one. The check and the increment are one INSERT ... ON CONFLICT
 * statement: Postgres locks the (key, bucket) row and re-evaluates the
 * DO UPDATE condition against its latest committed count, so concurrent
 * requests cannot all pass a stale read. Returns null when the window is full.
 */
export async function consumeRateLimitSlot(
  key: string,
  options: PostgresRateLimiterOptions,
): Promise<RateLimitSlot | null> {
  const now = Date.now();
  const bucket = BigInt(Math.floor(now / options.windowMs));
  const expiresAt = new Date(now + options.windowMs * 2);
  const max = Math.floor(options.max);

  purgeExpiredBuckets();

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    WITH prev AS (
      SELECT COALESCE(SUM("count"), 0)::int AS c
      FROM "rate_limit_buckets"
      WHERE "key" = ${key} AND "bucket" = ${bucket}::bigint - 1
    )
    INSERT INTO "rate_limit_buckets" ("key", "bucket", "count", "expiresAt")
    SELECT ${key}, ${bucket}::bigint, 1, ${expiresAt}::timestamptz
    FROM prev
    WHERE prev.c < ${max}::int
    ON CONFLICT ("key", "bucket") DO UPDATE
      SET "count" = "rate_limit_buckets"."count" + 1
      WHERE "rate_limit_buckets"."count" + (SELECT c FROM prev) < ${max}::int
    RETURNING "count"`;

  return rows.length > 0 ? { key, bucket } : null;
}

/** Refunds an attempt taken by `consumeRateLimitSlot` (never below zero). */
export async function releaseRateLimitSlot(slot: RateLimitSlot): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "rate_limit_buckets"
    SET "count" = "count" - 1
    WHERE "key" = ${slot.key} AND "bucket" = ${slot.bucket}::bigint AND "count" > 0`;
}

/** Consumes one attempt from a Postgres-backed window. Returns false when the window is full. */
export async function postgresRateLimiter(
  key: string,
  options: PostgresRateLimiterOptions,
): Promise<boolean> {
  return (await consumeRateLimitSlot(key, options)) !== null;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const row = await prisma.responseCache.findUnique({ where: { key } });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row.payload as T;
}

export async function setCached(
  key: string,
  payload: unknown,
  ttlMs: number,
): Promise<void> {
  await prisma.responseCache.upsert({
    where: { key },
    create: {
      key,
      payload,
      expiresAt: new Date(Date.now() + ttlMs),
    },
    update: {
      payload,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
}
