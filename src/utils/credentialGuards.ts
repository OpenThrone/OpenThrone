import * as bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';

import type { RateLimitSlot } from '@/lib/postgres-rate-limiter';
import {
  consumeRateLimitSlot,
  postgresRateLimiter,
  releaseRateLimitSlot,
} from '@/lib/postgres-rate-limiter';
import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

const argon2 = require('argon2');

const FIFTEEN_MINUTES_MS = 15 * 60_000;
const TOTP_STEP_SECONDS = 30;
// A used time step only needs to be remembered while its code can still verify (window: 1).
const TOTP_REPLAY_TTL_MS = 10 * 60_000;

/** Consumes one attempt from a Postgres-backed window. Returns false when the window is full. */
export function consumeRateLimit(
  key: string,
  options: { windowMs: number; max: number },
): Promise<boolean> {
  return postgresRateLimiter(key, options);
}

/**
 * Failed sign-in budgets. Only failures count: a correct password (including
 * the first step of a 2FA login) refunds its reservation.
 *
 * - account+IP: the tight lockout. A remote attacker fills only their own
 *   bucket, so the owner can still sign in from their usual address.
 * - account: a looser cap across all addresses, so password/TOTP guessing
 *   spread over many IPs stays bounded.
 * - IP: one address spraying many accounts.
 */
export const LOGIN_ACCOUNT_IP_FAILURE_LIMIT = {
  windowMs: FIFTEEN_MINUTES_MS,
  max: 10,
};
export const LOGIN_ACCOUNT_FAILURE_LIMIT = {
  windowMs: FIFTEEN_MINUTES_MS,
  max: 50,
};
export const LOGIN_IP_FAILURE_LIMIT = { windowMs: FIFTEEN_MINUTES_MS, max: 50 };
export const TWO_FACTOR_DISABLE_LIMIT = {
  windowMs: FIFTEEN_MINUTES_MS,
  max: 5,
};

/** Error for an exhausted sign-in failure budget. */
export const TOO_MANY_LOGIN_ATTEMPTS =
  'Too many login attempts. Try again later.';

/** Failure slots reserved up front so concurrent guesses cannot overrun a budget. */
export interface LoginFailureReservation {
  slots: RateLimitSlot[];
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Reserves one failure in every applicable budget before the password check.
 * Reserving first (atomically) keeps parallel guesses within the limit; call
 * `refundLoginFailure` when the attempt turns out not to be a failure.
 * The IP-keyed budgets are skipped when the client IP is unknown, rather than
 * sharing one bucket among every such client. Returns null when any budget is
 * exhausted (nothing stays reserved in that case).
 */
export async function reserveLoginFailure(
  email: string,
  ip?: string | null,
): Promise<LoginFailureReservation | null> {
  const account = normalizeEmail(email);
  const budgets: [string, { windowMs: number; max: number }][] = [];
  if (ip) {
    budgets.push([`login:fail:ip:${ip}`, LOGIN_IP_FAILURE_LIMIT]);
    budgets.push([
      `login:fail:account-ip:${account}:${ip}`,
      LOGIN_ACCOUNT_IP_FAILURE_LIMIT,
    ]);
  }
  budgets.push([`login:fail:account:${account}`, LOGIN_ACCOUNT_FAILURE_LIMIT]);

  const slots: RateLimitSlot[] = [];
  try {
    for (const [key, limit] of budgets) {
      const slot = await consumeRateLimitSlot(key, limit);
      if (!slot) {
        await refundLoginFailure({ slots });
        return null;
      }
      slots.push(slot);
    }
  } catch (error) {
    await refundLoginFailure({ slots });
    throw error;
  }
  return { slots };
}

/** Returns reserved failure slots; the attempt was not a failed credential check. */
export async function refundLoginFailure(
  reservation: LoginFailureReservation,
): Promise<void> {
  for (const slot of reservation.slots) {
    try {
      await releaseRateLimitSlot(slot);
    } catch (error) {
      logError('Failed to refund login attempt', error);
    }
  }
}

/**
 * Runs a credential check inside the failure budget. `check` reports whether
 * the attempt failed (wrong password or wrong TOTP); anything else, including
 * an exception, is refunded. Returns null when the budget is exhausted.
 */
export async function withLoginFailureBudget<T>(
  email: string,
  ip: string | null | undefined,
  check: () => Promise<{ failed: boolean; result: T }>,
): Promise<T | null> {
  const reservation = await reserveLoginFailure(email, ip);
  if (!reservation) return null;
  let failed = false;
  try {
    const outcome = await check();
    failed = outcome.failed;
    return outcome.result;
  } finally {
    if (!failed) await refundLoginFailure(reservation);
  }
}

/** Whether Cloudflare Turnstile is enforced for credential checks. */
export function isLoginCaptchaEnforced(): boolean {
  // Only server-side env flags disable it; request headers never bypass it.
  return !(
    process.env.DISABLE_TURNSTILE === 'true' ||
    process.env.NEXT_PUBLIC_DISABLE_TURNSTILE === 'true' ||
    process.env.NEXT_PUBLIC_USE_CAPTCHA === 'false'
  );
}

/**
 * Verifies the Turnstile token for a credential check. Throws an Error whose
 * message is safe to show; does nothing when captcha is disabled by env.
 */
export async function verifyLoginCaptcha(
  turnstileToken: string | undefined,
): Promise<void> {
  if (!isLoginCaptchaEnforced()) return;
  if (
    !(process.env.TURNSTILE_SECRET || process.env.NEXT_PUBLIC_TURNSTILE_SECRET)
  ) {
    throw new Error('Captcha is enabled but not configured on the server');
  }
  if (!turnstileToken) {
    throw new Error('Captcha token required');
  }

  const captchaRes = await fetch(
    `${process.env.NEXT_PUBLIC_URL_ROOT}/api/captcha/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: turnstileToken }),
    },
  );
  const captchaData = await captchaRes.json();
  if (!captchaData.success) {
    throw new Error('Captcha verification failed');
  }
}

/** Verifies a stored password hash (legacy bcrypt or argon2). Malformed hashes fail closed. */
export async function verifyStoredPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    if (hash.startsWith('$2b$')) return await bcrypt.compare(password, hash);
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Verifies a TOTP code and records its time step. The step is stored as a unique
 * row, so a code accepted once cannot be replayed, including by concurrent requests.
 */
export async function verifyTotpOnce(
  userId: number,
  secret: string,
  token: string,
): Promise<boolean> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const result = speakeasy.totp.verifyDelta({
    secret,
    encoding: 'base32',
    token,
    window: 1,
    time: nowSeconds,
  });
  if (!result) return false;

  const step = Math.floor(nowSeconds / TOTP_STEP_SECONDS) + result.delta;
  try {
    await prisma.rateLimitBucket.create({
      data: {
        key: `totp-step:${userId}:${step}`,
        bucket: 0n,
        count: 1,
        expiresAt: new Date(Date.now() + TOTP_REPLAY_TTL_MS),
      },
    });
    return true;
  } catch (error: unknown) {
    if ((error as { code?: string } | null)?.code === 'P2002') return false;
    throw error;
  }
}
