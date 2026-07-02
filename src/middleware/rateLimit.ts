import { postgresRateLimiter } from '@/lib/postgres-rate-limiter';

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', '0:0:0:0:0:0:0:1']);

function isLocalhost(ip: string): boolean {
  return LOCALHOST_IPS.has(ip);
}

export const globalLimiter = async (key: string): Promise<boolean> => {
  if (isLocalhost(key)) return true;
  return postgresRateLimiter(`global:${key}`, {
    windowMs: 15 * 60 * 1000,
    max: 100,
  });
};

export const registerLimiter = async (key: string): Promise<boolean> => {
  if (isLocalhost(key)) return true;
  return postgresRateLimiter(`register:${key}`, {
    windowMs: 60 * 1000,
    max: 10,
  });
};

export const highRiskLimiter = async (key: string): Promise<boolean> => {
  if (isLocalhost(key)) return true;
  return postgresRateLimiter(`highRisk:${key}`, { windowMs: 60_000, max: 5 });
};
