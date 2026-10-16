import { createHmac } from 'crypto';

import type { IdentityBlockKind } from '../../prisma/generated/prisma/enums';

export { getAntiAbuseHash as legacyEmailHash } from '@/utils/antiAbuse';

/** Canonical email identity, including provider aliases and plus addressing. */
export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf('@');
  if (separator < 0) return normalized;
  let local = normalized.slice(0, separator).split('+')[0] ?? '';
  let domain = normalized.slice(separator + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

/** Minimal display-name confusable folding for reservation checks. */
export function normalizeDisplayName(name: string): string {
  const confusables: Record<string, string> = {
    '0': 'o',
    '1': 'l',
    '3': 'e',
    '5': 's',
    '@': 'a',
  };
  return name
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_\-.\s]/g, '')
    .replace(/[0135@]/g, (character) => confusables[character] ?? character);
}

/** Keyed, domain-separated identity hash; never store plaintext identities. */
export function hashIdentity(kind: IdentityBlockKind, value: string): string {
  if (kind !== 'EMAIL' && kind !== 'DISPLAY_NAME') {
    throw new Error('Invalid identity kind');
  }
  let secret = process.env.IDENTITY_HASH_SECRET ?? process.env.ANTI_ABUSE_SALT;
  if (!secret) {
    if (
      process.env.NODE_ENV !== 'development' &&
      process.env.NODE_ENV !== 'test'
    ) {
      throw new Error('IDENTITY_HASH_SECRET or ANTI_ABUSE_SALT is required');
    }
    secret = 'openthrone-development-identity-hash';
  }
  const normalized =
    kind === 'EMAIL' ? normalizeEmail(value) : normalizeDisplayName(value);
  return createHmac('sha256', secret)
    .update(`identity:${kind}:${normalized}`)
    .digest('hex');
}
