import prisma from '@/lib/prisma';
import {
  consumeRateLimit,
  verifyStoredPassword,
  verifyTotpOnce,
} from '@/utils/credentialGuards';

/** Failed or repeated re-authentications allowed per account in 15 minutes. */
const REAUTH_LIMIT = { windowMs: 15 * 60_000, max: 8 };

export type ReauthFailure =
  | 'invalid_password'
  | 'totp_required'
  | 'invalid_totp'
  | 'rate_limited';

/** Thrown by `requireReauth`; `code` is stable and safe to show to the player. */
export class ReauthError extends Error {
  constructor(public readonly code: ReauthFailure) {
    super(code);
    this.name = 'ReauthError';
  }
}

/**
 * Re-proves the signed-in player before a privacy action: the password, plus a
 * fresh authenticator code when 2FA is enabled. Every attempt spends a slot of
 * a per-account budget so the endpoint cannot be used to guess passwords.
 * `scope` keeps the budgets of different actions separate.
 */
export async function requireReauth(
  userId: number,
  scope: string,
  credentials: { password?: string; totpToken?: string },
): Promise<void> {
  if (!(await consumeRateLimit(`reauth:${scope}:${userId}`, REAUTH_LIMIT))) {
    throw new ReauthError('rate_limited');
  }
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { password_hash: true, twoFactorSecret: true },
  });
  if (
    !user?.password_hash ||
    !credentials.password ||
    !(await verifyStoredPassword(user.password_hash, credentials.password))
  ) {
    throw new ReauthError('invalid_password');
  }
  if (user.twoFactorSecret) {
    if (!credentials.totpToken) throw new ReauthError('totp_required');
    if (
      !(await verifyTotpOnce(
        userId,
        user.twoFactorSecret,
        credentials.totpToken,
      ))
    ) {
      throw new ReauthError('invalid_totp');
    }
  }
}
