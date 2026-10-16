import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { encode } from 'next-auth/jwt';
import speakeasy from 'speakeasy';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
const {
  beginTwoFactorSetup,
  completeTwoFactorSetup,
  disableTwoFactor,
} = require('../TwoFactor.service');

const TEST_SECRET = 'two-factor-enrollment-test-key';
const originalAuthSecret = process.env.NEXTAUTH_SECRET;
const originalPolicy = process.env.OT_ENFORCE_PRIVILEGED_2FA;
afterEach(() => {
  if (originalAuthSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = originalAuthSecret;
  if (originalPolicy === undefined)
    delete process.env.OT_ENFORCE_PRIVILEGED_2FA;
  else process.env.OT_ENFORCE_PRIVILEGED_2FA = originalPolicy;
});

const AUTHENTICATOR_SECRET = 'JBSWY3DPEHPK3PXP';

async function setupToken(userId = 125, maxAge = 600) {
  return encode({
    secret: TEST_SECRET,
    maxAge,
    token: {
      purpose: 'two-factor-setup',
      userId,
      secret: AUTHENTICATOR_SECRET,
    },
  });
}

describe('two-factor enrollment', () => {
  beforeEach(() => {
    resetMockPrisma();
    process.env.NEXTAUTH_SECRET = TEST_SECRET;
    process.env.OT_ENFORCE_PRIVILEGED_2FA = 'false';
    mockPrisma.users.updateMany = vi.fn().mockResolvedValue({ count: 1 });
  });

  it('generates a QR and encrypted setup token without activating 2FA', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      display_name: 'Player',
      twoFactorSecret: null,
    });
    const setup = await beginTwoFactorSetup(125);
    expect(setup.qrCode.startsWith('data:image/png;base64,')).toBe(true);
    expect(setup.setupToken).toBeTruthy();
    expect(setup.expiresIn).toBe(600);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });

  it('activates the secret only after a valid authenticator code', async () => {
    const code = speakeasy.totp({
      secret: AUTHENTICATOR_SECRET,
      encoding: 'base32',
    });
    expect(await completeTwoFactorSetup(125, code, await setupToken())).toEqual(
      { success: true },
    );
    expect(mockPrisma.users.updateMany).toHaveBeenCalledWith({
      where: { id: 125, twoFactorSecret: null },
      data: { twoFactorSecret: AUTHENTICATOR_SECRET },
    });
  });

  it('rejects invalid codes, tampering, expiry, and another account without writes', async () => {
    await expect(
      completeTwoFactorSetup(125, 'invalid', await setupToken()),
    ).rejects.toThrow('Invalid token');
    await expect(
      completeTwoFactorSetup(1, '123456', await setupToken()),
    ).rejects.toThrow('Setup expired or invalid');
    await expect(
      completeTwoFactorSetup(125, '123456', 'tampered'),
    ).rejects.toThrow('Setup expired or invalid');
    await expect(
      completeTwoFactorSetup(125, '123456', await setupToken(125, -600)),
    ).rejects.toThrow('Setup expired or invalid');
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an already enrolled account and prevents token replay', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      twoFactorSecret: AUTHENTICATOR_SECRET,
    });
    await expect(beginTwoFactorSetup(125)).rejects.toThrow(
      '2FA already enabled',
    );
    mockPrisma.users.updateMany.mockResolvedValue({ count: 0 });
    const code = speakeasy.totp({
      secret: AUTHENTICATOR_SECRET,
      encoding: 'base32',
    });
    await expect(
      completeTwoFactorSetup(125, code, await setupToken()),
    ).rejects.toThrow('2FA already enabled');
  });

  it('refuses to disable 2FA without the password or a current code', async () => {
    const argon2 = require('argon2');
    const verify = vi.spyOn(argon2, 'verify').mockResolvedValue(false);
    mockPrisma.users.findUnique.mockResolvedValue({
      password_hash: '$argon2id$synthetic-placeholder',
      twoFactorSecret: AUTHENTICATOR_SECRET,
    });
    try {
      await expect(disableTwoFactor(125)).rejects.toThrow(
        'Invalid password or 2FA code',
      );
      await expect(
        disableTwoFactor(125, { password: 'wrong-password' }),
      ).rejects.toThrow('Invalid password or 2FA code');
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
    } finally {
      verify.mockRestore();
    }
  });

  it('disables 2FA with the correct password and honors enforced staff policy', async () => {
    const argon2 = require('argon2');
    const verify = vi.spyOn(argon2, 'verify').mockResolvedValue(true);
    mockPrisma.users.findUnique.mockResolvedValue({
      password_hash: '$argon2id$synthetic-placeholder',
      twoFactorSecret: AUTHENTICATOR_SECRET,
    });
    expect(await disableTwoFactor(125, { password: 'right-password' })).toEqual(
      { success: true },
    );
    expect(mockPrisma.users.update).toHaveBeenCalledTimes(1);
    verify.mockRestore();

    process.env.OT_ENFORCE_PRIVILEGED_2FA = 'true';
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue({
      role: 'ADMINISTRATOR',
    });
    await expect(
      disableTwoFactor(125, { password: 'right-password' }),
    ).rejects.toThrow('2FA is required');
    expect(mockPrisma.users.update).toHaveBeenCalledTimes(1);
  });
});
