/** Match the existing site CAPTCHA switches for both recruitment paths. */
export function isRecruitmentCaptchaRequired(): boolean {
  const disabled =
    process.env.DISABLE_TURNSTILE === 'true' ||
    process.env.NEXT_PUBLIC_DISABLE_TURNSTILE === 'true' ||
    process.env.NEXT_PUBLIC_USE_CAPTCHA === 'false';
  return (
    !disabled &&
    (process.env.NEXT_PUBLIC_USE_CAPTCHA === 'true' ||
      Boolean(
        process.env.TURNSTILE_SECRET ||
        process.env.NEXT_PUBLIC_TURNSTILE_SECRET,
      ))
  );
}

/** Verify the single-use challenge on the reward endpoint, never in a prior call. */
export async function verifyRecruitmentCaptcha(
  token: unknown,
  ip: string,
): Promise<boolean> {
  if (!isRecruitmentCaptchaRequired()) return true;
  const secret =
    process.env.TURNSTILE_SECRET || process.env.NEXT_PUBLIC_TURNSTILE_SECRET;
  if (!secret || typeof token !== 'string' || !token || token.length > 2048) {
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
