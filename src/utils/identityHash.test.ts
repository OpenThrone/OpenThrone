import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash, createHmac } from 'crypto';

import { getAntiAbuseHash } from '@/utils/antiAbuse';
import {
  hashIdentity,
  legacyEmailHash,
  normalizeDisplayName,
  normalizeEmail,
} from '@/utils/identityHash';

const KEYS = ['IDENTITY_HASH_SECRET', 'ANTI_ABUSE_SALT', 'NODE_ENV'] as const;
let original: Partial<Record<(typeof KEYS)[number], string>>;
beforeEach(() => {
  original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.IDENTITY_HASH_SECRET = 'synthetic-identity-secret';
  process.env.ANTI_ABUSE_SALT = 'synthetic-legacy-salt';
  Object.assign(process.env, { NODE_ENV: 'test' });
});
afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else Object.assign(process.env, { [key]: original[key] });
  }
});

describe('identity normalization', () => {
  it('folds Gmail aliases, dots and plus tags', () => {
    expect(normalizeEmail('  First.Last+news@GoogleMail.com ')).toBe(
      'firstlast@gmail.com',
    );
    expect(normalizeEmail('First.Last+tag@gmail.com')).toBe(
      'firstlast@gmail.com',
    );
  });
  it('preserves dots for other providers while removing plus tags', () => {
    expect(normalizeEmail(' First.Last+tag@Example.org ')).toBe(
      'first.last@example.org',
    );
    expect(normalizeEmail('NoAtSign')).toBe('noatsign');
    expect(normalizeEmail('')).toBe('');
  });
  it('folds fullwidth characters, separators and minimal confusables', () => {
    expect(normalizeDisplayName('  Ｌｕｍｐｙ_Duck-0135@. ')).toBe(
      'lumpyduckolesa',
    );
    expect(normalizeDisplayName('A\tB\nC')).toBe('abc');
    expect(normalizeDisplayName('Élf')).toBe('élf');
  });
});

describe('identity hashing', () => {
  it('is deterministic, normalized and HMAC-SHA256', () => {
    const hash = hashIdentity('EMAIL', 'First.Last+tag@GoogleMail.com');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashIdentity('EMAIL', 'firstlast@gmail.com'));
    expect(hash).toBe(
      createHmac('sha256', 'synthetic-identity-secret')
        .update('identity:EMAIL:firstlast@gmail.com')
        .digest('hex'),
    );
    expect(hashIdentity('DISPLAY_NAME', 'Lumpy_Duck')).toBe(
      hashIdentity('DISPLAY_NAME', 'lumpy.duck'),
    );
  });
  it('domain-separates otherwise identical normalized values', () => {
    expect(hashIdentity('EMAIL', 'duck')).not.toBe(
      hashIdentity('DISPLAY_NAME', 'duck'),
    );
  });
  it('falls back to the legacy salt, and uses a fixed development secret', () => {
    const dedicated = hashIdentity('EMAIL', 'duck@example.org');
    delete process.env.IDENTITY_HASH_SECRET;
    const fallback = hashIdentity('EMAIL', 'duck@example.org');
    expect(fallback).not.toBe(dedicated);
    expect(fallback).toBe(
      createHmac('sha256', 'synthetic-legacy-salt')
        .update('identity:EMAIL:duck@example.org')
        .digest('hex'),
    );
    delete process.env.ANTI_ABUSE_SALT;
    expect(hashIdentity('EMAIL', 'duck@example.org')).toBe(
      hashIdentity('EMAIL', 'duck@example.org'),
    );
  });
  it('rejects public defaults in staging and unset environments', () => {
    delete process.env.IDENTITY_HASH_SECRET;
    delete process.env.ANTI_ABUSE_SALT;
    for (const environment of ['staging', undefined]) {
      if (environment === undefined)
        Reflect.deleteProperty(process.env, 'NODE_ENV');
      else Object.assign(process.env, { NODE_ENV: environment });
      expect(() => hashIdentity('EMAIL', 'duck@example.org')).toThrow(
        'required',
      );
    }
  });
  it('fails in production without a nonempty secret', () => {
    delete process.env.IDENTITY_HASH_SECRET;
    delete process.env.ANTI_ABUSE_SALT;
    Object.assign(process.env, { NODE_ENV: 'production' });
    expect(() => hashIdentity('EMAIL', 'duck@example.org')).toThrow('required');
    process.env.IDENTITY_HASH_SECRET = '';
    expect(() => hashIdentity('EMAIL', 'duck@example.org')).toThrow('required');
    process.env.IDENTITY_HASH_SECRET = 'synthetic-production-secret';
    expect(hashIdentity('EMAIL', 'duck@example.org')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('re-exports legacy behavior without applying new normalization', () => {
    const email = ' First.Last+Tag@GoogleMail.com ';
    expect(legacyEmailHash(email)).toBe(getAntiAbuseHash(email));
    expect(legacyEmailHash(email)).toBe(
      createHash('sha256')
        .update(`synthetic-legacy-salt:${email.toLowerCase()}`)
        .digest('hex'),
    );
    expect(legacyEmailHash(email)).not.toBe(
      legacyEmailHash(normalizeEmail(email)),
    );
  });
});
