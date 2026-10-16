import { postgresRateLimiter } from '@/lib/postgres-rate-limiter';

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', '0:0:0:0:0:0:0:1']);

function isLocalhost(ip: string): boolean {
  return LOCALHOST_IPS.has(ip);
}

export const highRiskLimiter = async (key: string): Promise<boolean> => {
  if (isLocalhost(key)) return true;
  return postgresRateLimiter(`highRisk:${key}`, { windowMs: 60_000, max: 5 });
};
