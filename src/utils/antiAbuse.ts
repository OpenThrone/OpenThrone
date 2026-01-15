import { createHash } from 'crypto';

export const getAntiAbuseHash = (email: string) => {
  const salt = process.env.ANTI_ABUSE_SALT ?? 'anti-abuse';
  return createHash('sha256')
    .update(`${salt}:${email.toLowerCase()}`)
    .digest('hex');
};

export const getAntiAbuseExpiry = (days = 365) => {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};
