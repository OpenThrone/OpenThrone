import { decode, encode } from 'next-auth/jwt';
import QRCode from 'qrcode';
import speakeasy from 'speakeasy';

import prisma from '@/lib/prisma';
import { isAdmin, isModerator } from '@/utils/authorization';
import { verifyStoredPassword, verifyTotpOnce } from '@/utils/credentialGuards';
import { isPrivileged2FAEnforced } from '@/utils/securityPolicies';

const SETUP_LIFETIME_SECONDS = 600;

export class TwoFactorSetupError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

const setupEncryptionKey = () => {
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Authentication secret is not configured');
  return secret;
};

/** An expiring encrypted setup token keeps unfinished enrollment out of the database. */
export async function beginTwoFactorSetup(userId: number) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { display_name: true, twoFactorSecret: true },
  });
  if (!user) throw new TwoFactorSetupError('User not found', 401);
  if (user.twoFactorSecret)
    throw new TwoFactorSetupError('2FA already enabled', 409);

  const secret = speakeasy.generateSecret({
    name: `OpenThrone (${user.display_name})`,
    issuer: 'OpenThrone',
  });
  const setupToken = await encode({
    secret: setupEncryptionKey(),
    maxAge: SETUP_LIFETIME_SECONDS,
    token: { purpose: 'two-factor-setup', userId, secret: secret.base32 },
  });
  return {
    secret: secret.base32,
    setupToken,
    qrCode: await QRCode.toDataURL(secret.otpauth_url),
    expiresIn: SETUP_LIFETIME_SECONDS,
  };
}

/** Activate only after the user proves their authenticator can generate a code. */
export async function completeTwoFactorSetup(
  userId: number,
  code: string,
  setupToken: string,
) {
  let pending;
  try {
    pending = await decode({ token: setupToken, secret: setupEncryptionKey() });
  } catch {
    throw new TwoFactorSetupError(
      'Setup expired or invalid. Start setup again.',
    );
  }
  if (
    pending?.purpose !== 'two-factor-setup' ||
    pending.userId !== userId ||
    typeof pending.secret !== 'string'
  ) {
    throw new TwoFactorSetupError(
      'Setup expired or invalid. Start setup again.',
    );
  }
  if (
    !/^\d{6}$/.test(code) ||
    !speakeasy.totp.verify({
      secret: pending.secret,
      encoding: 'base32',
      token: code,
      window: 1,
    })
  )
    throw new TwoFactorSetupError('Invalid token');

  const updated = await prisma.users.updateMany({
    where: { id: userId, twoFactorSecret: null },
    data: { twoFactorSecret: pending.secret },
  });
  if (updated.count !== 1)
    throw new TwoFactorSetupError(
      '2FA already enabled or account unavailable',
      409,
    );
  return { success: true };
}

export type TwoFactorDisableProof = {
  password?: string;
  totpCode?: string;
};

/** Removing 2FA needs proof of the password or a current authenticator code. */
export async function disableTwoFactor(
  userId: number,
  proof?: TwoFactorDisableProof,
) {
  if (
    isPrivileged2FAEnforced() &&
    ((await isAdmin(userId)) || (await isModerator(userId)))
  ) {
    throw new TwoFactorSetupError('2FA is required for this account', 409);
  }

  const invalidProof = () =>
    new TwoFactorSetupError('Invalid password or 2FA code', 401);
  if (!proof || (!proof.password && !proof.totpCode)) throw invalidProof();

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { password_hash: true, twoFactorSecret: true },
  });
  if (!user) throw invalidProof();

  const { password, totpCode } = proof;
  const proven = password
    ? !!user.password_hash &&
      (await verifyStoredPassword(user.password_hash, password))
    : !!user.twoFactorSecret &&
      !!totpCode &&
      (await verifyTotpOnce(userId, user.twoFactorSecret, totpCode));
  if (!proven) throw invalidProof();

  await prisma.users.update({
    where: { id: userId },
    data: { twoFactorSecret: null },
  });
  return { success: true };
}
