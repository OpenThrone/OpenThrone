import { postgresRateLimiter } from '@/lib/postgres-rate-limiter';

interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

export const rateLimiter = (
  key: string,
  options: RateLimiterOptions,
): Promise<boolean> => postgresRateLimiter(key, options);
