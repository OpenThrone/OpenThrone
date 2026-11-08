import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * Authenticator (TOTP) secrets are stored encrypted with AES-256-GCM under a
 * key derived from TWO_FACTOR_ENCRYPTION_KEY, or from the auth secret when it
 * is not set. Set the dedicated key so session secrets can rotate without
 * locking out 2FA users: decryption tries every configured key, and
 * `scripts/encrypt-2fa-secrets.ts --rekey` rewrites rows under the current
 * one. Rows written before encryption hold plain base32 and still verify.
 */
const PREFIX = 'enc:v1:';

const derive = (secret: string) =>
  Buffer.from(
    hkdfSync('sha256', secret, 'openthrone', 'two-factor-secret-v1', 32),
  );

/** Encryption key first, then fallbacks that may hold older rows. */
const keys = () => {
  const secrets = [
    process.env.TWO_FACTOR_ENCRYPTION_KEY,
    process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET,
  ].filter((secret): secret is string => !!secret);
  if (!secrets.length)
    throw new Error('Authentication secret is not configured');
  return [...new Set(secrets)].map(derive);
};

export const isEncryptedTwoFactorSecret = (stored: string | null | undefined) =>
  typeof stored === 'string' && stored.startsWith(PREFIX);

export function encryptTwoFactorSecret(base32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys()[0], iv);
  const data = Buffer.concat([cipher.update(base32, 'utf8'), cipher.final()]);
  return (
    PREFIX +
    [iv, cipher.getAuthTag(), data]
      .map((b) => b.toString('base64url'))
      .join(':')
  );
}

/** Returns the base32 secret, or null when the stored value cannot be read. */
export function decryptTwoFactorSecret(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  if (!isEncryptedTwoFactorSecret(stored)) return stored;
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return null;
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url'));
  for (const key of keys())
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString(
        'utf8',
      );
    } catch {
      // Try the next configured key.
    }
  return null;
}

/** True when the value is stored under a key other than the current one. */
export function needsReencryption(stored: string): boolean {
  if (!isEncryptedTwoFactorSecret(stored)) return true;
  const [current] = keys();
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return false;
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url'));
  try {
    const decipher = createDecipheriv('aes-256-gcm', current, iv);
    decipher.setAuthTag(tag);
    Buffer.concat([decipher.update(data), decipher.final()]);
    return false;
  } catch {
    return true;
  }
}
