import { createHash } from 'crypto';

/** Returns anti abuse hash for callers that need normalized game data. */
export const getAntiAbuseHash = (email: string) => {
  const salt = process.env.ANTI_ABUSE_SALT ?? 'anti-abuse';
  return createHash('sha256')
    .update(`${salt}:${email.toLowerCase()}`)
    .digest('hex');
};

/** Returns anti abuse expiry for callers that need normalized game data. */
export const getAntiAbuseExpiry = (days = 365) => {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};
