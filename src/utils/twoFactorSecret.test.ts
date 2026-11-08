import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  isEncryptedTwoFactorSecret,
  needsReencryption,
} from '@/utils/twoFactorSecret';

const SECRET = 'JBSWY3DPEHPK3PXP';
const saved = process.env.NEXTAUTH_SECRET;
beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'synthetic-auth-secret-for-tests';
});
afterEach(() => {
  if (saved === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = saved;
  delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
});

describe('two-factor secret encryption', () => {
  it('round-trips and never stores the plain secret', () => {
    const stored = encryptTwoFactorSecret(SECRET);
    expect(isEncryptedTwoFactorSecret(stored)).toBe(true);
    expect(stored).not.toContain(SECRET);
    expect(decryptTwoFactorSecret(stored)).toBe(SECRET);
    // A fresh IV each time.
    expect(encryptTwoFactorSecret(SECRET)).not.toBe(stored);
  });

  it('still reads secrets stored before encryption', () => {
    expect(decryptTwoFactorSecret(SECRET)).toBe(SECRET);
  });

  it('refuses tampered values and values from another key', () => {
    const stored = encryptTwoFactorSecret(SECRET);
    const tampered = stored.slice(0, -2) + (stored.endsWith('A') ? 'BB' : 'AA');
    expect(decryptTwoFactorSecret(tampered)).toBeNull();
    process.env.NEXTAUTH_SECRET = 'a-different-secret';
    expect(decryptTwoFactorSecret(stored)).toBeNull();
    expect(decryptTwoFactorSecret('enc:v1:garbage')).toBeNull();
  });

  it('keeps reading old rows after a dedicated key is set, and flags them for rekeying', () => {
    const old = encryptTwoFactorSecret(SECRET);
    process.env.TWO_FACTOR_ENCRYPTION_KEY = 'dedicated-2fa-key';
    expect(decryptTwoFactorSecret(old)).toBe(SECRET);
    expect(needsReencryption(old)).toBe(true);
    const current = encryptTwoFactorSecret(SECRET);
    expect(needsReencryption(current)).toBe(false);
    // Session secret rotated: the dedicated key still opens new rows.
    process.env.NEXTAUTH_SECRET = 'rotated-session-secret';
    expect(decryptTwoFactorSecret(current)).toBe(SECRET);
  });

  it('treats missing or empty values as no secret', () => {
    expect(decryptTwoFactorSecret(null)).toBeNull();
    expect(decryptTwoFactorSecret('')).toBeNull();
    expect(isEncryptedTwoFactorSecret(undefined)).toBe(false);
  });
});
