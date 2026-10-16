import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHmac } from 'crypto';

import type { UnsubscribeCategory } from '@/utils/unsubscribeToken';
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from '@/utils/unsubscribeToken';

const KEYS = [
  'EMAIL_UNSUBSCRIBE_SECRET',
  'NEXTAUTH_SECRET',
  'NODE_ENV',
] as const;
let original: Partial<Record<(typeof KEYS)[number], string>>;
beforeEach(() => {
  original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'synthetic-unsubscribe-secret';
  process.env.NEXTAUTH_SECRET = 'synthetic-auth-secret';
  Object.assign(process.env, { NODE_ENV: 'test' });
});
afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else Object.assign(process.env, { [key]: original[key] });
  }
});

function signedPayload(value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature = createHmac('sha256', 'synthetic-unsubscribe-secret')
    .update(`unsubscribe:v1:${payload}`)
    .digest('base64url');
  return `${payload}.${signature}`;
}

describe('unsubscribe tokens', () => {
  it('roundtrips all categories with URL-safe encoding', () => {
    const categories: UnsubscribeCategory[] = [
      'TRANSACTIONAL',
      'NEWS',
      'ANNOUNCEMENT',
      'ACCOUNT_LIFECYCLE',
      'ALL',
    ];
    for (const category of categories) {
      const token = createUnsubscribeToken(42, category);
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(verifyUnsubscribeToken(token)).toEqual({ userId: 42, category });
    }
  });
  it('rejects modified payloads and signatures', () => {
    const token = createUnsubscribeToken(42, 'NEWS');
    const [payload, signature] = token.split('.');
    const other = Buffer.from(
      JSON.stringify({ userId: 43, category: 'NEWS' }),
    ).toString('base64url');
    expect(verifyUnsubscribeToken(`${other}.${signature}`)).toBeNull();
    expect(
      verifyUnsubscribeToken(
        `${payload}.${signature?.startsWith('A') ? 'B' : 'A'}${signature?.slice(1)}`,
      ),
    ).toBeNull();
  });
  it('rejects malformed encodings and truncated signatures', () => {
    const token = createUnsubscribeToken(42, 'ALL');
    for (const malformed of [
      '',
      'invalid',
      '.',
      `${token}.extra`,
      `${token}=`,
      token.slice(0, -1),
      'a.b',
      '!.$',
      'a'.repeat(1025),
    ]) {
      expect(verifyUnsubscribeToken(malformed)).toBeNull();
    }
  });
  it('rejects signed invalid payloads and invalid creation inputs', () => {
    for (const value of [
      null,
      {},
      { userId: '42', category: 'ALL' },
      { userId: 0, category: 'NEWS' },
      { userId: 1.5, category: 'NEWS' },
      { userId: 42, category: 'INVALID' },
    ]) {
      expect(verifyUnsubscribeToken(signedPayload(value))).toBeNull();
    }
    for (const userId of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => createUnsubscribeToken(userId, 'ALL')).toThrow('Invalid');
    }
  });
  it('supports test defaults and revocation by rotation', () => {
    const originalToken = createUnsubscribeToken(42, 'NEWS');
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect(verifyUnsubscribeToken(originalToken)).toBeNull();
    expect(verifyUnsubscribeToken(createUnsubscribeToken(42, 'ALL'))).toEqual({
      userId: 42,
      category: 'ALL',
    });
    delete process.env.NEXTAUTH_SECRET;
    expect(verifyUnsubscribeToken(createUnsubscribeToken(42, 'ALL'))).toEqual({
      userId: 42,
      category: 'ALL',
    });
  });
  it('rejects public defaults in staging and unset environments', () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    for (const environment of ['staging', undefined]) {
      if (environment === undefined)
        Reflect.deleteProperty(process.env, 'NODE_ENV');
      else Object.assign(process.env, { NODE_ENV: environment });
      expect(() => createUnsubscribeToken(42, 'ALL')).toThrow('required');
    }
  });
  it('fails in production without a nonempty secret, including verification', () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    Object.assign(process.env, { NODE_ENV: 'production' });
    expect(() => createUnsubscribeToken(42, 'ALL')).toThrow('required');
    expect(() => verifyUnsubscribeToken('invalid')).toThrow('required');
    process.env.EMAIL_UNSUBSCRIBE_SECRET = '';
    expect(() => createUnsubscribeToken(42, 'ALL')).toThrow('required');
  });
});
