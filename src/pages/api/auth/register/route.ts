import type { NextApiRequest, NextApiResponse } from 'next';
import { ZodError } from 'zod';

import { RegisterSchema } from '@/lib/validation';
import { withCors } from '@/middleware/cors';
import { AuthService } from '@/services';
import { logError } from '@/utils/logger';

async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    await handlePOST(res, req);
  } else {
    throw new Error(
      `The HTTP ${req.method} method is not supported at this route.`,
    );
  }
}

export default withCors(handle, { envVar: 'OT_AUTH_CORS_ORIGINS' });

/** Handles Auth register POST requests. */
export async function handlePOST(res: NextApiResponse, req: NextApiRequest) {
  try {
    if (process.env.NEXT_PUBLIC_DISABLE_REGISTRATION === 'true') {
      return res.status(403).json({ error: 'Registrations are disabled' });
    }

    const disableTurnstile =
      process.env.DISABLE_TURNSTILE === 'true' ||
      process.env.NEXT_PUBLIC_DISABLE_TURNSTILE === 'true' ||
      process.env.NEXT_PUBLIC_USE_CAPTCHA === 'false';
    const turnstileConfigured = Boolean(
      process.env.NEXT_PUBLIC_TURNSTILE_SECRET,
    );
    const enforceTurnstile =
      !disableTurnstile &&
      (process.env.NEXT_PUBLIC_USE_CAPTCHA === 'true' || turnstileConfigured);

    if (enforceTurnstile) {
      if (!process.env.NEXT_PUBLIC_TURNSTILE_SECRET) {
        logError(
          'Registration captcha enabled but NEXT_PUBLIC_TURNSTILE_SECRET is not set',
        );
        return res.status(500).json({
          error: 'Captcha is enabled but not configured on the server',
        });
      }

      const { turnstileToken } = req.body as { turnstileToken?: string };
      if (!turnstileToken) {
        return res.status(400).json({ error: 'Captcha token required' });
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
        return res.status(400).json({ error: 'Captcha verification failed' });
      }
    }

    try {
      const data = RegisterSchema.parse(req.body);
      const { email, password, race, display_name, class: userClass } = data;

      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

      const user = await AuthService.registerUser({
        email,
        password,
        display_name,
        race,
        class: userClass,
        ip: ip as string,
      });

      return res.json(user);
    } catch (error) {
      if (error instanceof ZodError) {
        return res
          .status(400)
          .json({ error: 'Invalid input', details: error.format() });
      }
      throw error;
    }
  } catch (error) {
    logError('Error in handlePOST:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
