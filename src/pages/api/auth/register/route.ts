import { logError } from "@/utils/logger";
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthService } from '@/services';
import { RegisterSchema } from '@/lib/validation';
import { ZodError } from 'zod';
import { headers } from "next/headers";



export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    await handlePOST(res, req);
  } else {
    throw new Error(
      `The HTTP ${req.method} method is not supported at this route.`
    );
  }
}

export async function handlePOST(res: NextApiResponse, req: NextApiRequest) {
  try {
    if (process.env.NEXT_PUBLIC_DISABLE_REGISTRATION === 'true') {
      return res.status(403).json({ error: 'Registrations are disabled' });
    }
    const { turnstileToken } = req.body;
    const captchaRes = await fetch(`${process.env.NEXT_PUBLIC_URL_ROOT}/api/captcha/verify`, {
    method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: turnstileToken }),
    });
    const captchaData = await captchaRes.json();
    if (!captchaData.success) {
      return res.status(400).json({ error: 'Captcha verification failed' });
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
        return res.status(400).json({ error: 'Invalid input', details: error.format() });
      }
      throw error;
    }

  } catch (error) {
    logError('Error in handlePOST:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

