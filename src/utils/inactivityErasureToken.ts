import { createHmac, timingSafeEqual } from 'crypto';

import { getEmailLinkSecret } from '@/utils/unsubscribeToken';

/**
 * One-click "erase my account" link in inactivity emails. The token names the
 * player and the notice it was issued with (its warnedAt), so it stops working
 * once that notice ends: the player logs in, is erased, or gets a new notice.
 * Opening the link never erases; the landing page's button does.
 */
export interface InactivityErasurePayload {
  userId: number;
  /** warnedAt of the notice, epoch milliseconds. */
  warnedAt: number;
}

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret)
    .update(`inactivity-erasure:v1:${payload}`)
    .digest();

const isPayload = (value: unknown): value is { u: number; w: number } => {
  if (!value || typeof value !== 'object') return false;
  const { u, w } = value as { u?: unknown; w?: unknown };
  return (
    Number.isSafeInteger(u) &&
    (u as number) > 0 &&
    Number.isSafeInteger(w) &&
    (w as number) > 0
  );
};

export function createInactivityErasureToken(
  userId: number,
  warnedAt: Date,
): string {
  const value = { u: userId, w: warnedAt.getTime() };
  if (!isPayload(value)) throw new Error('Invalid erasure link payload');
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${sign(payload, getEmailLinkSecret()).toString('base64url')}`;
}

/** Checks the signature; malformed or forged tokens return null. */
export function verifyInactivityErasureToken(
  token: string,
): InactivityErasurePayload | null {
  const secret = getEmailLinkSecret();
  if (typeof token !== 'string' || token.length > 512) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signature))
    return null;
  try {
    const supplied = Buffer.from(signature, 'base64url');
    const expected = sign(payload, secret);
    if (
      supplied.length !== expected.length ||
      supplied.toString('base64url') !== signature ||
      !timingSafeEqual(supplied, expected)
    )
      return null;
    const decoded = Buffer.from(payload, 'base64url');
    if (decoded.toString('base64url') !== payload) return null;
    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (!isPayload(value)) return null;
    return { userId: value.u, warnedAt: value.w };
  } catch {
    return null;
  }
}
