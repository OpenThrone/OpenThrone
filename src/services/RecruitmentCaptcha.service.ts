import type { RecruitCaptchaProvider } from '@/constants/runtimeSettings';
import {
  isAltchaConfigured,
  verifyAltchaPayload,
} from '@/services/AltchaCaptcha.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';

/** What the recruit flow must show: nothing, or a challenge from one provider. */
export type RecruitmentCaptcha =
  | { required: false; provider: null }
  | { required: true; provider: RecruitCaptchaProvider };

const TURNSTILE_TOKEN_MAX_LENGTH = 2048;

/** `NEXT_PUBLIC_USE_CAPTCHA=false` turns off every captcha, both providers. */
const allCaptchaOff = () => process.env.NEXT_PUBLIC_USE_CAPTCHA === 'false';

/**
 * The Turnstile switches (local dev and the preview build rely on them) turn
 * off Turnstile only, so a host can keep sign-in captcha-free and still run
 * ALTCHA on recruiting.
 */
const turnstileSwitchedOff = () =>
  process.env.DISABLE_TURNSTILE === 'true' ||
  process.env.NEXT_PUBLIC_DISABLE_TURNSTILE === 'true';

const turnstileSecret = () =>
  process.env.TURNSTILE_SECRET || process.env.NEXT_PUBLIC_TURNSTILE_SECRET;

/**
 * Which captcha guards recruiting right now. `NEXT_PUBLIC_USE_CAPTCHA=false`
 * turns it off entirely and the Turnstile switches turn off Turnstile only;
 * otherwise the `recruit.captchaProvider` setting picks the provider, and the
 * captcha is required once a usable provider is configured (or
 * `NEXT_PUBLIC_USE_CAPTCHA=true` forces it). ALTCHA without its key falls back
 * to Turnstile when Turnstile is usable; a required provider that is missing
 * its secret fails closed when verifying.
 */
export async function getRecruitmentCaptcha(): Promise<RecruitmentCaptcha> {
  if (allCaptchaOff()) return { required: false, provider: null };
  const turnstileUsable = !turnstileSwitchedOff() && Boolean(turnstileSecret());
  const configured =
    process.env.NEXT_PUBLIC_USE_CAPTCHA === 'true' ||
    turnstileUsable ||
    isAltchaConfigured();
  if (!configured) return { required: false, provider: null };
  const config = await getRuntimeConfig();
  const provider = config.recruitCaptchaProvider ?? 'altcha';
  if (provider === 'turnstile' && turnstileSwitchedOff())
    return { required: false, provider: null };
  // A host deployed before its ALTCHA key was set keeps Turnstile instead of
  // refusing every recruit. Without a usable Turnstile either, ALTCHA stays
  // selected and fails closed.
  if (provider === 'altcha' && !isAltchaConfigured() && turnstileUsable)
    return { required: true, provider: 'turnstile' };
  return { required: true, provider };
}

async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  const secret = turnstileSecret();
  if (
    !secret ||
    typeof token !== 'string' ||
    !token ||
    token.length > TURNSTILE_TOKEN_MAX_LENGTH
  ) {
    return false;
  }
  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return (
      typeof result === 'object' &&
      result !== null &&
      'success' in result &&
      result.success === true
    );
  } catch {
    // Provider failures fail closed; never log challenge tokens or secrets.
    return false;
  }
}

/** Verify the single-use challenge on the reward endpoint, never in a prior call. */
export async function verifyRecruitmentCaptcha(
  token: unknown,
  ip: string,
): Promise<boolean> {
  const captcha = await getRecruitmentCaptcha();
  if (!captcha.required) return true;
  return captcha.provider === 'altcha'
    ? verifyAltchaPayload(token)
    : verifyTurnstile(token, ip);
}
