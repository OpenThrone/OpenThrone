import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withCors } from '@/middleware/cors';
import { AuthService } from '@/services';

const VerifySchema = z.object({
  email: z.string().email(),
  verify: z.string().min(1),
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed!' });
  }

  const validatedBody = VerifySchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // handle password reset
  const { email, verify } = validatedBody.data;
  try {
    const result = await AuthService.verifyPasswordResetCode(email, verify);
    return res.json({
      status: true,
      verified: result.verified,
    });
  } catch {
    return res.status(400).json({
      status: false,
      error: 'Invalid or expired verification code',
    });
  }
}

export default withCors(handler, { envVar: 'OT_AUTH_CORS_ORIGINS' });
