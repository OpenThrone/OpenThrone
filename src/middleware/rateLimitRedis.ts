type RateLimitProfile =
  | 'auth'
  | 'password_reset'
  | 'attack'
  | 'spy'
  | 'bank'
  | 'admin'
  | 'cron';

type RateLimitConfig = {
  windowMs: number;
  max: number;
};

export const RATE_LIMIT_CONFIG_MAP: Record<RateLimitProfile, RateLimitConfig> =
  {
    auth: { windowMs: 60_000, max: 12 },
    password_reset: { windowMs: 60_000, max: 6 },
    attack: { windowMs: 60_000, max: 20 },
    spy: { windowMs: 60_000, max: 20 },
    bank: { windowMs: 60_000, max: 15 },
    admin: { windowMs: 60_000, max: 30 },
    cron: { windowMs: 60_000, max: 10 },
  };

const inMemoryBuckets = new Map<string, number[]>();

/**
 * Redis-compatible rate limiter surface.
 *
 * Current implementation uses in-memory buckets as a fallback to keep behavior
 * deterministic until Redis infrastructure is wired in this environment.
 */
export const rateLimitRedis = (
  key: string,
  profile: RateLimitProfile,
): boolean => {
  const config = RATE_LIMIT_CONFIG_MAP[profile];
  const now = Date.now();
  const timestamps = inMemoryBuckets.get(key) ?? [];
  const validTimestamps = timestamps.filter((ts) => ts > now - config.windowMs);

  if (validTimestamps.length >= config.max) {
    inMemoryBuckets.set(key, validTimestamps);
    return false;
  }

  validTimestamps.push(now);
  inMemoryBuckets.set(key, validTimestamps);
  return true;
};
