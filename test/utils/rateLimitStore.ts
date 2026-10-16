// In-memory stand-in for the rate_limit_buckets table, driven by the raw SQL
// that src/lib/postgres-rate-limiter.ts issues. The real limiter (bucket math,
// window size, slot refunds) and the TOTP replay ledger run unchanged on top.
//
// Usage: installRateLimitStore(mockPrisma, vi) in beforeEach.

type Vi = { fn: (impl?: (...args: any[]) => any) => any };

export interface RateLimitStore {
  /** Current count per `${key}|${bucket}`. */
  counts: Map<string, number>;
  /** Keys in the order consume statements were issued (allowed or not). */
  consumed: string[];
  /** Keys in the order refunds were issued. */
  released: string[];
  /** Sum of the current and previous bucket for a key, as the limiter sees it. */
  windowCount: (key: string) => number;
}

const sqlText = (strings: TemplateStringsArray | string[]) =>
  Array.from(strings).join('?');

export function installRateLimitStore(mockPrisma: any, vi: Vi): RateLimitStore {
  const counts = new Map<string, number>();
  const ledger = new Set<string>();
  const consumed: string[] = [];
  const released: string[] = [];
  const id = (key: string, bucket: bigint) => `${key}|${bucket}`;

  mockPrisma.$queryRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlText(strings);
      if (!sql.includes('INSERT INTO "rate_limit_buckets"')) {
        throw new Error(`Unexpected $queryRaw in rate limit store: ${sql}`);
      }
      // Parameter order: key, bucket, key, bucket, expiresAt, max, max.
      const key = String(values[0]);
      const bucket = BigInt(values[1] as bigint);
      const max = Number(values[5]);
      consumed.push(key);
      const previous = counts.get(id(key, bucket - 1n)) ?? 0;
      const current = counts.get(id(key, bucket)) ?? 0;
      if (current + previous >= max) return [];
      counts.set(id(key, bucket), current + 1);
      return [{ count: current + 1 }];
    },
  );

  mockPrisma.$executeRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlText(strings);
      if (!sql.includes('UPDATE "rate_limit_buckets"')) {
        throw new Error(`Unexpected $executeRaw in rate limit store: ${sql}`);
      }
      const key = String(values[0]);
      const bucket = BigInt(values[1] as bigint);
      released.push(key);
      const current = counts.get(id(key, bucket)) ?? 0;
      if (current <= 0) return 0;
      counts.set(id(key, bucket), current - 1);
      return 1;
    },
  );

  mockPrisma.rateLimitBucket = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    // TOTP replay ledger (verifyTotpOnce): a unique row per accepted step.
    create: vi.fn(async ({ data }: any) => {
      if (ledger.has(data.key)) {
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
      }
      ledger.add(data.key);
      return {};
    }),
  };

  const windowCount = (key: string) => {
    let total = 0;
    for (const [entry, count] of counts) {
      if (entry.slice(0, entry.lastIndexOf('|')) === key) total += count;
    }
    return total;
  };

  return { counts, consumed, released, windowCount };
}
