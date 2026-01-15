import { z } from 'zod';

import { logError } from '@/utils/logger';

const VerifySchema = z.object({
  token: z.string(),
});

const verifyEndpoint =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const secret = process.env.NEXT_PUBLIC_TURNSTILE_SECRET;

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
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

      if (!enforceTurnstile) {
        return res.status(200).json({ success: true, bypassed: true });
      }
      if (!secret) {
        return res.status(500).json({
          error: 'Captcha is enabled but not configured on the server',
        });
      }

      const validatedBody = VerifySchema.safeParse(req.body);
      if (!validatedBody.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validatedBody.error.flatten().fieldErrors,
        });
      }

      const { token } = validatedBody.data;
      const response = await fetch(verifyEndpoint, {
        method: 'POST',
        body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.ok) throw new Error('Verification failed'); // Handle fetch errors

      const data = await response.json();
      return res.status(data.success ? 200 : 400).json(data);
    }
    return res.status(405).send('Method not allowed'); // Handle any other HTTP methods
  } catch (error) {
    logError('Error in /api/catpcha/verify:', error);
    return res.status(500).send('Internal Server Error');
  }
}
