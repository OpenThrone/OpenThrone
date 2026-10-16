import { createHmac, timingSafeEqual } from 'crypto';

import type { EmailCategory } from '../../prisma/generated/prisma/enums';

export type UnsubscribeCategory = EmailCategory | 'ALL';
export interface UnsubscribePayload {
  userId: number;
  category: UnsubscribeCategory;
}

const CATEGORIES: readonly string[] = [
  'ATTACK_NOTIFICATION',
  'TRANSACTIONAL',
  'NEWS',
  'ANNOUNCEMENT',
  'ACCOUNT_LIFECYCLE',
  'ALL',
];

function getSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (secret) return secret;
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.NODE_ENV !== 'test'
  ) {
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET is required');
  }
  return 'openthrone-development-unsubscribe';
}

function isPayload(value: unknown): value is UnsubscribePayload {
  if (!value || typeof value !== 'object') return false;
  const { userId, category } = value as Partial<UnsubscribePayload>;
  return (
    Number.isSafeInteger(userId) &&
    userId > 0 &&
    typeof category === 'string' &&
    CATEGORIES.includes(category)
  );
}

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret)
    .update(`unsubscribe:v1:${payload}`)
    .digest();
}

/** Creates a non-expiring token; changing the signing secret revokes tokens. */
export function createUnsubscribeToken(
  userId: number,
  category: UnsubscribeCategory,
): string {
  if (!isPayload({ userId, category })) {
    throw new Error('Invalid unsubscribe payload');
  }
  const payload = Buffer.from(JSON.stringify({ userId, category })).toString(
    'base64url',
  );
  return `${payload}.${sign(payload, getSecret()).toString('base64url')}`;
}

/** Validates the signature and payload; malformed tokens return null. */
export function verifyUnsubscribeToken(
  token: string,
): UnsubscribePayload | null {
  // Resolve configuration outside the parse catch so production fails closed.
  const secret = getSecret();
  if (typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (
    !payload ||
    !signature ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]+$/.test(signature)
  )
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
    return { userId: value.userId, category: value.category };
  } catch {
    return null;
  }
}
