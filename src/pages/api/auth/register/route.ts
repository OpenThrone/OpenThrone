import type { NextApiRequest, NextApiResponse } from 'next';
import { ZodError } from 'zod';

import { RegisterSchema } from '@/lib/validation';
import { withCors } from '@/middleware/cors';
import { AuthService } from '@/services';
import { stringifyObj } from '@/utils/jsonHelpers';
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

type RegistrationErrorResponse = {
  readonly status: number;
  readonly error: string;
};

const isErrorWithCode = (error: unknown): error is { readonly code: unknown } =>
  typeof error === 'object' && error !== null && 'code' in error;

const getRegistrationErrorResponse = (
  error: unknown,
): RegistrationErrorResponse | null => {
  if (error instanceof ZodError) {
    return { status: 400, error: 'invalid_input' };
  }

  if (error instanceof Error) {
    if (error.message === 'User already exists') {
      return {
        status: 409,
        error: 'email_taken',
      };
    }

    if (error.message === 'Account creation is temporarily restricted.') {
      return { status: 403, error: 'registrations_disabled' };
    }
  }

  if (isErrorWithCode(error) && error.code === 'P2002') {
    return {
      status: 409,
      error: 'email_taken',
    };
  }

  return null;
};

/** Handles Auth register POST requests. */
export async function handlePOST(res: NextApiResponse, req: NextApiRequest) {
  try {
    if (process.env.NEXT_PUBLIC_DISABLE_REGISTRATION === 'true') {
      return res.status(403).json({ error: 'registrations_disabled' });
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
          error: 'captcha_failed',
        });
      }

      const { turnstileToken } = req.body as { turnstileToken?: string };
      if (!turnstileToken) {
        return res.status(400).json({ error: 'captcha_failed' });
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
        return res.status(400).json({ error: 'captcha_failed' });
      }
    }

    try {
      const data = RegisterSchema.parse(req.body);
      const { email, password, race, display_name, class: userClass } = data;
      const forwardedFor = req.headers['x-forwarded-for'];
      const ip =
        (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) ??
        req.socket.remoteAddress;

      const user = await AuthService.registerUser({
        email,
        password,
        display_name,
        race,
        class: userClass,
        ip,
      });

      return res.status(200).json(stringifyObj(user));
    } catch (error) {
      const registrationError = getRegistrationErrorResponse(error);
      if (registrationError) {
        return res
          .status(registrationError.status)
          .json({ error: registrationError.error });
      }
      throw error;
    }
  } catch (error) {
    logError('Error in handlePOST:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
