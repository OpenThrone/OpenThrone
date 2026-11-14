import * as bcrypt from 'bcryptjs';
import { describe, expect, it, mock, vi } from 'bun:test';

import {
  hashApiTokenSecret,
  hashPassword,
  isBcryptHash,
  verifyPassword,
} from './passwordHash';

// Interop vectors generated with the previously-used native `argon2` package
// (`bun -e "import argon2 from 'argon2'; console.log(await argon2.hash(...))"`),
// kept here so hash-wasm must keep verifying hashes that already exist in the
// database. Note both use the native defaults (`p=4`), which hash-wasm decodes
// from the hash itself.
const NATIVE_VECTORS: Array<[string, string]> = [
  [
    'openthrone-test-1',
    '$argon2id$v=19$m=65536,t=3,p=4$/9POCpSv4NEpyPJmPtYXYw$n78K/HnhPNxoWdQfsZICVqZTAAaKexXmC4ednYOQ0Hk',
  ],
  [
    'openthrone-test-2',
    '$argon2id$v=19$m=65536,t=2,p=4$D3p18WA2Xvm8XntOi9fxwQ$UacemH6TUR7SyGauhTzCe2XSpoPG7yhWGIXdLzyPFl8',
  ],
];

describe('passwordHash (hash-wasm argon2id)', () => {
  it.each(NATIVE_VECTORS)(
    'verifies the native-argon2 vector for %s',
    async (password, hash) => {
      expect(await verifyPassword(hash, password)).toBe(true);
    },
  );

  it.each(NATIVE_VECTORS)(
    'rejects a wrong password against the vector for %s',
    async (password, hash) => {
      expect(await verifyPassword(hash, `${password}-wrong`)).toBe(false);
    },
  );

  it('round-trips hashPassword through verifyPassword', async () => {
    const hash = await hashPassword('synthetic-password');
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await verifyPassword(hash, 'synthetic-password')).toBe(true);
    expect(await verifyPassword(hash, 'synthetic-password-2')).toBe(false);
  });

  it('produces a fresh salt on every hash', async () => {
    const first = await hashPassword('same-password');
    const second = await hashPassword('same-password');
    expect(first).not.toBe(second);
    expect(await verifyPassword(first, 'same-password')).toBe(true);
    expect(await verifyPassword(second, 'same-password')).toBe(true);
  });

  it('fails closed on a tampered hash body', async () => {
    const [password, hash] = NATIVE_VECTORS[0];
    const tampered = `${hash.slice(0, -3)}abc`;
    expect(await verifyPassword(tampered, password)).toBe(false);
  });

  it('fails closed on a malformed or missing stored hash', async () => {
    expect(await verifyPassword('not-a-valid-hash', 'pw')).toBe(false);
    expect(await verifyPassword('', 'pw')).toBe(false);
    expect(await verifyPassword(null as unknown as string, 'pw')).toBe(false);
    expect(
      await verifyPassword(undefined as unknown as string, 'pw'),
    ).toBe(false);
  });

  it('still verifies legacy bcrypt hashes and flags them', async () => {
    const legacyHash = bcrypt.hashSync('legacy-bcrypt-password', 10);
    expect(isBcryptHash(legacyHash)).toBe(true);
    expect(await verifyPassword(legacyHash, 'legacy-bcrypt-password')).toBe(
      true,
    );
    expect(await verifyPassword(legacyHash, 'other-password')).toBe(false);
    expect(isBcryptHash(NATIVE_VECTORS[0][1])).toBe(false);
  });

  it('round-trips API token secrets with memory-safe parameters', async () => {
    const tokenHash = await hashApiTokenSecret('synthetic-secretpepper');
    expect(tokenHash.startsWith('$argon2id$v=19$m=19456,t=3,p=1$')).toBe(true);
    expect(await verifyPassword(tokenHash, 'synthetic-secretpepper')).toBe(
      true,
    );
    expect(await verifyPassword(tokenHash, 'wrong-secret')).toBe(false);
  });
});
