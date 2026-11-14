import type { NextApiRequest, NextApiResponse } from 'next';

import { rateLimiter } from '@/lib/rate-limiter';
import { issueAltchaChallenge } from '@/services/AltchaCaptcha.service';
import { getRecruitmentCaptcha } from '@/services/RecruitmentCaptcha.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { resolveClientIp } from '@/utils/ipUtils';
import { logError } from '@/utils/logger';

/** One challenge per recruit page load; auto-recruit moves on every few seconds. */
const CHALLENGES_PER_MINUTE = 60;

/**
 * Issues a signed ALTCHA proof-of-work challenge for the recruit flow. It is
 * open to anonymous visitors (external recruit links), rate limited per IP,
 * and deliberately skips the session guard: the check must set no cookies of
 * its own. The solved payload is checked, once, by the recruit endpoints.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const allowed = await rateLimiter(
      `captcha_challenge:${resolveClientIp(req) ?? 'unknown'}`,
      { windowMs: 60_000, max: CHALLENGES_PER_MINUTE },
    );
    if (!allowed) return res.status(429).json({ error: 'Too many requests' });
    const captcha = await getRecruitmentCaptcha();
    if (!captcha.required || captcha.provider !== 'altcha') {
      return res
        .status(409)
        .json({ error: 'ALTCHA is not in use.', code: 'ALTCHA_NOT_IN_USE' });
    }
    const config = await getRuntimeConfig();
    const challenge = await issueAltchaChallenge(
      config.recruitAltchaDifficulty,
    );
    if (!challenge) {
      return res.status(503).json({
        error: 'Verification is temporarily unavailable.',
        code: 'CAPTCHA_UNAVAILABLE',
      });
    }
    return res.status(200).json(challenge);
  } catch (error) {
    logError('Could not issue an ALTCHA challenge', error);
    return res.status(500).json({ error: 'Unable to issue a challenge.' });
  }
}
