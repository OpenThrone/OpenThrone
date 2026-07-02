import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

interface PostgresRateLimiterOptions {
  windowMs: number;
  max: number;
}

export async function postgresRateLimiter(
  key: string,
  options: PostgresRateLimiterOptions,
): Promise<boolean> {
  const now = Date.now();
  const bucket = BigInt(Math.floor(now / options.windowMs));

  if (Math.random() < 0.01) {
    prisma.rateLimitBucket
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch((error: unknown) => {
        logError('Failed to purge expired rate limit buckets', error);
      });
  }

  const agg = await prisma.rateLimitBucket.aggregate({
    _sum: { count: true },
    where: { key, bucket: { gte: bucket - 1n } },
  });
  const currentCount = agg._sum.count ?? 0;
  if (currentCount >= options.max) return false;

  await prisma.rateLimitBucket.upsert({
    where: { key_bucket: { key, bucket } },
    create: {
      key,
      bucket,
      count: 1,
      expiresAt: new Date(now + options.windowMs * 2),
    },
    update: { count: { increment: 1 } },
  });
  return true;
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
